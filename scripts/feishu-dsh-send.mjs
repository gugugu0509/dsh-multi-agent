// DSH 发飞书群消息（唯一出口）。规范：msg_type=post + zh_cn；at 用 user_id(open_id)+user_name；
// 草稿 room/feishu-dsh-draft.txt(UTF-8)；@WBY/@用户 占位转蓝色@；禁止 pwsh 内联中文。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';
const CHAT = process.env.FS_CHAT_MAIN || '';
const WBY_OPEN = process.env.FS_WBY_OPEN || '';
const HUMAN_OPEN = process.env.FS_HUMAN_OPEN || '';
const DRAFT = process.env.FS_DRAFT || path.join(ROOT, 'room/feishu-dsh-draft.txt');
const SEEN = path.join(ROOT, 'room/.dsh-last-sent-draft.json');
// ⛔ 误发守卫（2026-09-28 DSH 立）：草稿文件若未在「上次发送之后」被重写 ⇒ 拒绝发送。
// 起因：复用了旧草稿文件，把上一条消息原样重发了一遍（重复刷群）。
// 判据 = 草稿 mtime 必须严格晚于上次成功发送时间；否则报错退出（rc=3），提示先重写草稿。
const st = fs.statSync(DRAFT);
let lastSent = 0;
try { lastSent = JSON.parse(fs.readFileSync(SEEN, 'utf8')).at || 0; } catch { lastSent = 0; }
if (!process.env.FS_ALLOW_STALE && st.mtimeMs <= lastSent) {
  console.error('REFUSED: 草稿未在上次发送后重写（draft mtime ' + new Date(st.mtimeMs).toISOString()
    + ' <= last sent ' + new Date(lastSent).toISOString() + '）。请先重写草稿；确需重发请设 FS_ALLOW_STALE=1。');
  process.exit(3);
}
const draft = fs.readFileSync(DRAFT, 'utf8');
const at = (id, name) => ({ tag: 'at', user_id: id, user_name: name });
const content = [];
for (const raw of draft.split(/\r?\n/)) {
  const row = [];
  let l = raw;
  if (/^@WBY/.test(l)) { row.push(at(WBY_OPEN, '咕咕咕的Agent(WBY)')); l = l.replace(/^@WBY\s*/, ''); }
  if (/^@用户/.test(l)) { row.push(at(HUMAN_OPEN, '用户584131')); l = l.replace(/^@用户\s*/, ''); }
  if (l.trim()) row.push({ tag: 'text', text: l.replace(/^@WBY\s*/, '').replace(/^@用户\s*/, '') });
  if (row.length) content.push(row);
}
const payload = { receive_id: CHAT, msg_type: 'post', content: JSON.stringify({ zh_cn: { title: '', content } }) };
const t = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ app_id: process.env.FA_ID, app_secret: process.env.FA_SECRET })
}).then(r => r.json());
const r = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t.tenant_access_token },
  body: JSON.stringify(payload)
}).then(r => r.json());
console.log('code=' + r.code + ' msg=' + (r.msg || '') + ' id=' + (r.data && r.data.message_id || ''));
if (r.code === 0) { try { fs.writeFileSync(SEEN, JSON.stringify({ at: Date.now(), id: r.data && r.data.message_id }), 'utf8'); } catch {} }
