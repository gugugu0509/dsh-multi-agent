// DSH 发【茶脉】飞书群消息(茶脉专用出口,勿改量化群原脚本)（唯一出口）。规范：msg_type=post + zh_cn；at 用 user_id(open_id)+user_name；
// 草稿 room/feishu-teapulse-draft.txt(UTF-8)；@WBY/@用户 占位转蓝色@；禁止 pwsh 内联中文。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';
const CHAT = process.env.FS_CHAT_TEAPULSE || '';
const WBY_OPEN = process.env.FS_WBY_OPEN || '';
const HUMAN_OPEN = process.env.FS_HUMAN_OPEN || '';
const draft = fs.readFileSync(path.join(ROOT, 'room/feishu-teapulse-draft.txt'), 'utf8');
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
