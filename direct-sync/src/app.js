const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const puppeteer = require("puppeteer-core");
const mega = require("megajs");

const BROWSER_PORT = Number(process.env.BROWSER_PORT || 9222);
const SERVER_PORT = Number(process.env.SERVER_PORT || 3000);
const MEGA_EMAIL = process.env.MEGA_EMAIL;
const MEGA_PASS = process.env.MEGA_PASS;
const MEGA_FOLDER = process.env.MEGA_FOLDER || "whatsapp-backup";
const GROUP_NAMES = (process.env.GROUP_NAMES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const PARALLEL_UPLOADS = Number(process.env.PARALLEL_UPLOADS || 3);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
if (!MEGA_EMAIL || !MEGA_PASS) { console.error("FATAL: MEGA creds required"); process.exit(1); }

const safeName = s => String(s || "chat").replace(/[\\/:*?"<>|]/g, "_").replace(/\.+$/, "").trim().slice(0, 60);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOG_FILE = path.join(__dirname, "..", "logs", "sync.log");
function plog(m) { const l = "[" + new Date().toISOString() + "] " + m; console.log(l); try { fs.appendFileSync(LOG_FILE, l + "\n"); } catch(_) {} }


// Notifications handled by start-monitor.ps1 only (prevents cmd.exe spam)

function launchEdge() {
  try {
    const { exec } = require("child_process");
    const edge = '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"';
    const args = ' --remote-debugging-port=' + BROWSER_PORT + ' --remote-allow-origins=* "' + (process.env.LOCALAPPDATA || 'C:\\Users\\Admin\\AppData\\Local') + '\\Microsoft\\Edge\\User Data" https://web.whatsapp.com';
    plog("[edge] Auto-launching Edge browser...");
    exec(edge + args, () => {});
  } catch(_) {}
}

const stats = { downloaded:0, uploaded:0, failed:0, skipped:0, queue:0, groups:0, totalGroups:0, speed:0, mega:false, wa:false, dedupSkipped:0, retries:0, deleted:0, autoDelete:false, uptime:Date.now(), lastError:"", groupStats:{}, activity:[], uploadTimes:[] };
function logAct(t, x, ok) { stats.activity.unshift({type:t, text:x, ok, time:new Date().toLocaleTimeString()}); if(stats.activity.length>100) stats.activity.pop(); }
function gs(n) { if(!stats.groupStats[n]) stats.groupStats[n]={dl:0,up:0,fail:0,del:0}; return stats.groupStats[n]; }

// DEDUP
const dedupHashes = new Set();
const HASH_FILE = path.join(__dirname, "..", "data", "hashes.json");
let hashDirty = false, hashSaving = false;
function loadHashes() { try { JSON.parse(fs.readFileSync(HASH_FILE, "utf8")).forEach(h => dedupHashes.add(h)); plog("[dedup] " + dedupHashes.size + " hashes"); } catch(_) { plog("[dedup] fresh"); } }
function saveHashesSync() { if(!hashDirty||hashSaving) return; hashSaving=true; try{const t=HASH_FILE+".tmp";fs.mkdirSync(path.dirname(HASH_FILE),{recursive:true});fs.writeFileSync(t,JSON.stringify([...dedupHashes]));fs.renameSync(t,HASH_FILE);hashDirty=false;}catch(e){} hashSaving=false; }
function markHash(h) { dedupHashes.add(h); hashDirty = true; }
function contentHash(b) { return crypto.createHash("sha256").update(b).digest("hex").slice(0, 32); }

// STATE
let megaRoot=null, megaStorage=null, pageRef=null;
const fCache=new Map(), uploadedSet=new Set();
const activeGroups=new Set();   // sync on/off per group
const deleteGroups=new Set();
const excludedGroups=new Set();
const EXCLUDED_FILE=path.join(__dirname,"..","data","excluded.json");
function loadExcluded(){try{JSON.parse(fs.readFileSync(EXCLUDED_FILE,"utf8")).forEach(n=>excludedGroups.add(n));plog("[excluded] "+excludedGroups.size+" groups excluded")}catch(_){}}
function saveExcluded(){try{fs.writeFileSync(EXCLUDED_FILE,JSON.stringify([...excludedGroups]))}catch(_){}}    // delete on/off per group
let allMatchedGroups=[];
let pageReloading=false;
let masterSync=true;             // master sync toggle
let masterDelete=false;          // master delete toggle

// MEGA
function megaConnect(){return new Promise((res,rej)=>{plog("[mega] Connecting...");megaStorage=new mega.Storage({email:MEGA_EMAIL,password:MEGA_PASS,autoload:true});const tm=setTimeout(()=>rej(new Error("timeout")),30000);megaStorage.on("ready",()=>{clearTimeout(tm);let f=megaStorage.root.children.find(c=>c.directory&&c.name===MEGA_FOLDER);if(!f){megaStorage.root.mkdir(MEGA_FOLDER,(e,fl)=>{if(e)return rej(e);megaRoot=fl;stats.mega=true;plog("[mega] Created "+MEGA_FOLDER);res()})}else{megaRoot=f;stats.mega=true;plog("[mega] Connected. "+(f.children?f.children.length:0)+" subfolders");res()}});megaStorage.on("error",e=>{clearTimeout(tm);rej(e)})})}
function loadExisting(){let n=0;(function w(f,p){if(!f.children)return;for(const c of f.children){const pp=p+"/"+c.name;if(c.directory)w(c,pp);else{uploadedSet.add(pp);n++}}})(megaRoot,"");plog("[mega] "+n+" existing paths")}
function findCh(f,n){return f&&f.children?f.children.find(c=>c.name===n):null}
async function getFld(p,n){const k=(p.name||"root")+"/"+n;if(fCache.has(k))return fCache.get(k);let f=findCh(p,n);if(!f||!f.directory){f=await new Promise((r,j)=>p.mkdir(n,(e,fl)=>e?j(e):r(fl)))}fCache.set(k,f);return f}

// QUEUE
const uq=[];let activeUploads=0;
function enqueue(g,d,f,b,mid){const k="/"+safeName(g)+"/"+d+"/"+f;if(uploadedSet.has(k)){stats.skipped++;return"skip"}const h=contentHash(b);if(dedupHashes.has(h)){stats.dedupSkipped++;logAct("skip","DUP: "+g+"/"+f,true);return"dup"}uq.push({group:g,date:d,filename:f,buffer:b,key:k,hash:h,retries:0,msgId:mid});stats.queue=uq.length;return"uploaded"}
async function deleteMsg(mid){if(!mid||!pageRef)return false;try{return await pageRef.evaluate(async(m)=>{try{var M=window.require("WAWebCollections").Msg;var msg=M.get(m);if(!msg)return false;var S=window.require("WAWebSendMsgUtils");if(S&&S.sendDeleteMsgs){await S.sendDeleteMsgs(msg.id.remote,[msg]);return true}if(S&&S.sendRevokeMsgs){await S.sendRevokeMsgs(msg.id.remote,[msg],false);return true}return false}catch(e){return false}},mid)}catch(_){return false}}
async function uploadOne(it){try{let f=await getFld(megaRoot,safeName(it.group));f=await getFld(f,it.date);if(findCh(f,it.filename)||uploadedSet.has(it.key)){uploadedSet.add(it.key);stats.skipped++;return"skip"}const ok=await new Promise(r=>{let d=false;const fin=v=>{if(!d){d=true;r(v)}};try{const up=f.upload(it.filename,it.buffer);const tm=setTimeout(()=>fin(false),60000);up.on("complete",()=>{clearTimeout(tm);fin(true)});up.on("error",()=>{clearTimeout(tm);fin(false)})}catch(e){fin(false)}});if(ok){uploadedSet.add(it.key);markHash(it.hash);saveHashesSync();stats.uploaded++;gs(it.group).up++;stats.uploadTimes.push(Date.now());if(stats.uploadTimes.length>60)stats.uploadTimes.shift();logAct("up",it.group+"/"+it.filename,true);if(masterDelete&&deleteGroups.has(it.group)&&it.msgId){if(await deleteMsg(it.msgId)){stats.deleted++;gs(it.group).del++;logAct("del","Deleted: "+it.group+"/"+it.filename,true)}}return true}return false}catch(e){return false}}
async function drain(){while(uq.length>0&&activeUploads<PARALLEL_UPLOADS&&stats.mega){const it=uq.shift();stats.queue=uq.length;activeUploads++;uploadOne(it).then(async ok=>{activeUploads--;if(!ok){it.retries++;if(it.retries<=MAX_RETRIES){stats.retries++;uq.push(it);stats.queue=uq.length}else{stats.failed++;gs(it.group).fail++;logAct("up","FAIL "+it.group+"/"+it.filename,false)}}})}}

// WHATSAPP
async function waLoop(){while(true){try{let browser=await puppeteer.connect({browserURL:"http://localhost:"+BROWSER_PORT,defaultViewport:null});pageRef=(await browser.pages()).find(p=>p.url().includes("web.whatsapp.com"));if(!pageRef){pageRef=await browser.newPage();await pageRef.goto("https://web.whatsapp.com")}plog("[wa] Waiting...");await pageRef.waitForFunction(()=>{try{return typeof window.require==="function"&&window.require("WAWebCollections").Chat.getModelsArray().length>0}catch(_){return false}},{timeout:120000});stats.wa=true;plog("[wa] Ready");
      pageRef.on("framenavigated",function(frame){if(frame===pageRef.mainFrame()){pageReloading=true;plog("[wa] Page reloading — pausing scan")}});;await pageRef.exposeFunction("queueUpload",(g,d,f,b64,mid)=>{try{return enqueue(g,d,f,Buffer.from(b64,"base64"),mid)}catch(_){return"skip"}});let pn=0;while(true){pn++;const all=await pageRef.evaluate(()=>{const C=window.require("WAWebCollections").Chat;return C.getModelsArray().filter(c=>c.id&&c.id._serialized&&c.id._serialized.endsWith("@g.us")).map(c=>({id:c.id._serialized,name:c.name||"(unnamed)"}))});stats.totalGroups=all.length;const matched=all.filter(g=>g.name&&GROUP_NAMES.some(kw=>g.name.toLowerCase().includes(kw)));matched.forEach(g=>{if(allMatchedGroups.indexOf(g.name)<0)allMatchedGroups.push(g.name);if(masterSync&&!activeGroups.has(g.name)&&!excludedGroups.has(g.name))activeGroups.add(g.name)});allMatchedGroups=allMatchedGroups.filter(n=>matched.some(g=>g.name===n));const active=matched.filter(g=>masterSync&&activeGroups.has(g.name)&&!excludedGroups.has(g.name));stats.groups=active.length;stats.autoDelete=masterDelete;plog("[wa] Pass "+pn+": "+active.length+"/"+matched.length+" groups | sync:"+masterSync+" del:"+masterDelete);let pd=0;if(pageReloading){plog("[wa] Waiting for page reload to complete...");for(let w=0;w<20;w++){await sleep(3000);try{await pageRef.evaluate(()=>typeof window.require==="function");pageReloading=false;plog("[wa] Page ready again");break}catch(_){}}if(pageReloading){plog("[wa] Still reloading, skipping pass");break}}
    for(const g of active){try{const r=await pageRef.evaluate(async(cid,gname)=>{const C=window.require("WAWebCollections").Chat;const Cmd=window.require("WAWebCmd").Cmd;const chat=C.get(cid);if(!chat)return{s:0,f:0};try{await Cmd.openChatBottom({chat})}catch(_){}await new Promise(r=>setTimeout(r,3000));const arr=chat.msgs.getModelsArray?chat.msgs.getModelsArray():(chat.msgs._models||chat.msgs.models||[]);const media=arr.filter(m=>m&&m.mediaKey!==undefined);let s=0,f=0;for(const msg of media){try{const opt={directPath:msg.directPath,encFilehash:msg.encFilehash,filehash:msg.filehash,mediaKey:msg.mediaKey,mediaKeyTimestamp:msg.mediaKeyTimestamp,type:msg.type,signal:new AbortController().signal,downloadQpl:{addAnnotations:function(){return this},addPoint:function(){return this}}};const dec=await window.require("WAWebDownloadManager").downloadManager.downloadAndMaybeDecrypt(opt);const blob=new Blob([dec]);const b64=await new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result.split(",")[1])};fr.onerror=function(){res(null)};fr.readAsDataURL(blob)});if(b64){var ts=msg.t?msg.t*1000:Date.now();var date=new Date(ts).toISOString().slice(0,10);var ext=((msg.mimetype||"image/jpeg").split("/")[1]||"bin").split(";")[0];var name=date.replace(/-/g,"")+"-"+(msg.t||0)+"-"+(s+f)+"."+ext;var mid=msg.id&&(msg.id._serialized||msg.id.id)||"";var upResult=await window.queueUpload(gname,date,name,b64,mid);if(upResult==="uploaded"||upResult==="dup"){s++}else{f++}}else{f++}}catch(e){f++}await new Promise(r=>setTimeout(r,150))}return{s,f}},g.id,g.name);pd+=r.s;stats.downloaded+=r.s;gs(g.name).dl+=r.s;if(r.s>0){plog("[wa]   "+g.name+": +"+r.s);logAct("dl",g.name+": +"+r.s,true)}}catch(e){plog("[wa] Error "+g.name+": "+e.message)}}const now=Date.now();stats.uploadTimes=stats.uploadTimes.filter(t=>now-t<60000);stats.speed=stats.uploadTimes.length;plog("[wa] Pass "+pn+": +"+pd+" dl | up:"+stats.uploaded+" del:"+stats.deleted+" q:"+uq.length);drain();await sleep(30000)}}catch(e){stats.wa=false;stats.lastError=e.message;plog("[wa] "+e.message+" retry 15s");plog('[edge] Edge not available. Waiting for monitor to relaunch.'); await sleep(60000)}}}

// API
const app=express();
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"..","public","index.html")));
app.get("/api/health",(req,res)=>res.json({ok:true,uptime:Math.round((Date.now()-stats.uptime)/1000),mega:stats.mega,wa:stats.wa,queue:uq.length}));
app.get("/api/stats",(req,res)=>res.json({downloaded:stats.downloaded,uploaded:stats.uploaded,failed:stats.failed,skipped:stats.skipped,dedupSkipped:stats.dedupSkipped,dedupHashes:dedupHashes.size,retries:stats.retries,deleted:stats.deleted,queue:uq.length,groups:stats.groups,totalGroups:stats.totalGroups,speed:stats.speed,mega:stats.mega,wa:stats.wa,uptime:Math.round((Date.now()-stats.uptime)/1000),lastError:stats.lastError,masterSync:masterSync,masterDelete:masterDelete,groupStats:stats.groupStats,activity:stats.activity.slice(0,30)}));
app.get("/api/groups-list",(req,res)=>res.json({groups:allMatchedGroups.map(n=>({name:n,active:activeGroups.has(n)&&!excludedGroups.has(n),deleteEnabled:deleteGroups.has(n),excluded:excludedGroups.has(n)}))}));
app.post("/api/toggle-master-sync",(req,res)=>{masterSync=!masterSync;plog("[sync] Master "+(masterSync?"ON":"OFF"));res.json({ok:true,masterSync})});
app.post("/api/toggle-master-delete",(req,res)=>{masterDelete=!masterDelete;stats.autoDelete=masterDelete;if(masterDelete){allMatchedGroups.forEach(n=>deleteGroups.add(n))}else{deleteGroups.clear()}plog("[delete] Master "+(masterDelete?"ON (all)":"OFF (all)"));res.json({ok:true,masterDelete})});
app.post("/api/exclude-group",(req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{try{const{name}=JSON.parse(b);excludedGroups.add(name);activeGroups.delete(name);deleteGroups.delete(name);saveExcluded();plog("[exclude] Removed: "+name);res.json({ok:true,excluded:true})}catch(e){res.json({ok:false})}})});
app.post("/api/include-group",(req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{try{const{name}=JSON.parse(b);excludedGroups.delete(name);if(masterSync)activeGroups.add(name);saveExcluded();plog("[include] Restored: "+name);res.json({ok:true,excluded:false})}catch(e){res.json({ok:false})}})});
app.post("/api/toggle-group",(req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{try{const{name}=JSON.parse(b);if(activeGroups.has(name)){activeGroups.delete(name)}else{activeGroups.add(name)}plog("[group] Sync "+(activeGroups.has(name)?"ON":"OFF")+": "+name);res.json({ok:true,active:activeGroups.has(name)})}catch(e){res.json({ok:false})}})});
app.post("/api/toggle-delete-group",(req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{try{const{name}=JSON.parse(b);if(deleteGroups.has(name)){deleteGroups.delete(name)}else{deleteGroups.add(name)}plog("[group] Delete "+(deleteGroups.has(name)?"ON":"OFF")+": "+name);res.json({ok:true,deleteEnabled:deleteGroups.has(name)})}catch(e){res.json({ok:false})}})});

// SHUTDOWN
process.on("SIGINT",()=>{plog("[shutdown] flushing...");saveHashesSync();process.exit(0)});
process.on("SIGTERM",()=>{plog("[shutdown] flushing...");saveHashesSync();process.exit(0)});
process.on("uncaughtException",e=>{plog("[FATAL] "+e.message);stats.lastError=e.message});

// MAIN
async function main(){plog("=== WhatsApp -> MEGA v6.0 ===");plog("Filter: "+GROUP_NAMES.length+" keywords");loadHashes();loadExcluded();try{await megaConnect();loadExisting()}catch(e){plog("[mega] "+e.message)}setInterval(()=>drain().catch(()=>{}),3000);setInterval(()=>saveHashesSync(),15000);app.listen(SERVER_PORT);plog("[dashboard] http://localhost:"+SERVER_PORT);plog("[wa] Starting...");await waLoop()}
main().catch(e=>{plog("FATAL: "+e.message);process.exit(1)});