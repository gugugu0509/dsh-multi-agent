// 房间网页看板 + 发言框 + @全员：读/追加 transcript.md，3s 自动刷新
// 启动: node room-server.mjs   打开 http://127.0.0.1:18090
import { readFile, appendFile } from "node:fs/promises";
import { createServer } from "node:http";
import { ROOM } from './paths.mjs';

const FILE = ROOM + "/transcript.md";
// ── 绑定与端口 ─────────────────────────────────────────────────────────
// 默认只监听回环地址，端口可用 ROOM_PORT 改。
// ⚠️ 这个看板**没有任何认证**：它能读/写 room/transcript.md，而房间内容会触发 agent。
//    因此绑到非回环地址必须显式放行（ROOM_ALLOW_REMOTE=1），否则自动退回 127.0.0.1。
const PORT = Number(process.env.ROOM_PORT || 18090);
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const WANT_HOST = process.env.ROOM_HOST || "127.0.0.1";
const HOST = LOOPBACK.has(WANT_HOST) || process.env.ROOM_ALLOW_REMOTE === "1" ? WANT_HOST : "127.0.0.1";
if (HOST !== WANT_HOST) {
  console.warn("[room-server] 拒绝绑定 " + WANT_HOST + "：看板无认证且会触发 agent，已退回 127.0.0.1。"
    + "确实需要外露请设 ROOM_ALLOW_REMOTE=1，并自行加反向代理鉴权。");
}

function now() { const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }

const PAGE = `<!doctype html><meta charset="utf-8"><title>多Agent 协作房间</title>
<style>
body{font-family:system-ui;max-width:860px;margin:24px auto;padding:0 16px;background:#0f1220;color:#e8eaf2}
h1{color:#7cc0ff}.head{color:#8a93ad;margin:16px 0 4px}
.msg{border:1px solid #2a3350;border-left:4px solid #7cc0ff;border-radius:8px;margin:10px 0;padding:6px 14px;background:#171c30}
h3{margin:8px 0 6px;color:#ffd479;font-size:14px}p{margin:4px 0;white-space:pre-wrap;line-height:1.55}
#composer{margin:18px 0;padding:12px;background:#171c30;border:1px solid #2a3350;border-radius:8px}
textarea{width:100%;box-sizing:border-box;background:#0f1220;color:#e8eaf2;border:1px solid #2a3350;border-radius:6px;padding:8px;min-height:70px;font:inherit}
.row{margin-top:8px;display:flex;gap:8px;align-items:center}
select,button{background:#24406e;color:#fff;border:1px solid #33518a;border-radius:6px;padding:6px 10px;font:inherit;cursor:pointer}
button:hover{background:#2e548c}#sent{color:#6fdc8c}
</style>
<h1>🐙 多Agent 协作房间 <small>(3s 自动刷新)</small></h1>
<div id="room"><span>加载中…</span></div>
<div id="composer">
  <textarea id="box" placeholder="以你的身份发言（落盘为所选角色，仅追加）…"></textarea>
  <div class="row">
    <select id="role"><option value="human">@human（你）</option><option value="dsh">@dsh</option><option value="wby">@wby</option></select>
    <button onclick="atAll()" title="插入 @dsh @wby @human">@全员</button>
    <button onclick="speak()">发言</button>
    <span id="sent"></span>
  </div>
</div>
<script>
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function render(raw){
  var lines=raw.split(/\\r?\\n/), out=[], open=false;
  for (var i=0;i<lines.length;i++){
    var t=lines[i].replace(/\\s+$/,"");
    if (/^##\\s/.test(t)) { if(open){out.push("</div>")} open=true; out.push('<div class="msg"><h3>'+esc(t.slice(3))+'</h3>'); }
    else if (/^#/.test(t)) { if(open){out.push("</div>");open=false} out.push('<div class="head">'+esc(t.replace(/^#\\s*/,""))+'</div>'); }
    else if (t==="") { if(open){out.push("</div>");open=false} }
    else out.push("<p>"+esc(t)+"</p>");
  }
  if(open) out.push("</div>");
  return out.join("\\n");
}
function load(){fetch('/raw').then(function(r){return r.text()}).then(function(t){var el=document.getElementById('room');el.innerHTML=render(t);}).catch(function(){})}
function atAll(){var b=document.getElementById('box');var m='@dsh @wby @human：';b.value=b.value?b.value.replace(/\\s*$/,'')+' '+m:m;b.focus()}
function speak(){
  var text=document.getElementById('box').value.trim();
  if(!text){return}
  var role=document.getElementById('role').value;
  fetch('/speak',{method:'POST',headers:{'content-type':'text/plain'},body:role+'\\n'+text})
    .then(function(r){return r.text()}).then(function(m){
      document.getElementById('sent').textContent=m;
      if(m.indexOf('ok')===0){document.getElementById('box').value='';load()}
    }).catch(function(){document.getElementById('sent').textContent='发送失败'});
}
load(); setInterval(load,3000);
</script>`;

function appendEntry(body) {
  const nl = body.indexOf("\n");
  const role = (nl > 0 ? body.slice(0, nl) : "human").trim();
  const text = (nl > 0 ? body.slice(nl + 1) : body).trim();
  const safe = /^[a-zA-Z0-9_]{1,20}$/.test(role) ? role : "human";
  const block = `## [${now()}] @${safe}\r\n${text}\r\n`;
  return appendFile(FILE, block, "utf8").then(() => `ok @${safe}`);
}

// 同源校验：任何网页都能向 127.0.0.1 发「简单请求」（表单 POST 不需要 CORS 预检），
// 不加这层的话，用户在浏览器里打开一个恶意页面就可能把内容注入房间、进而触发 agent。
// 跨站请求一定带 Origin，本机脚本（curl / node）不带——只拦前者。
function isLocalOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try {
    const u = new URL(o);
    return LOOPBACK.has(u.hostname) && u.port === String(PORT);
  } catch { return false; }
}

const MAX_BODY = 64 * 1024;   // 单条消息上限，避免无界内存

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/speak") {
      if (!isLocalOrigin(req)) {
        res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        res.end("forbidden: cross-origin"); return;
      }
      let body = "";
      for await (const ch of req) {
        body += ch;
        if (body.length > MAX_BODY) { res.writeHead(413); res.end("too large"); return; }
      }
      const msg = await appendEntry(body);
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); res.end(msg); return;
    }
    if (req.url === "/raw") {
      // 文件还不存在（房间还没人发言）时返回空内容，而不是 500
      let b = "";
      try { b = await readFile(FILE, "utf8"); } catch { b = ""; }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); res.end(b); return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGE);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, HOST, () => console.log("room board: http://" + HOST + ":" + PORT
  + (LOOPBACK.has(HOST) ? "" : "   ⚠ 已绑定非回环地址，且无认证")));