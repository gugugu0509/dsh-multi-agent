// DSH 读群（全文，不截断）：打印最近 N 条消息的完整 content。
// 与 feishu-dsh-read.mjs 的差别：① 不 slice(0,3000) ② 可选 --raw 打印原始 JSON。
// 起因：长报告（如 WBY 每轮的落库回执）常超 3000 字符，被截断后无法读全（2026-09-28 DSH 立）。
// 用法：node feishu-dsh-read-full.mjs           # 最近 1 条全文
//       FS_N=2 node feishu-dsh-read-full.mjs    # 最近 2 条全文
//       node feishu-dsh-read-full.mjs --raw     # 附原始 JSON（调试用）
import fs from 'node:fs';
import { ROOT } from './paths.mjs';
const CHAT = process.env.FS_CHAT_MAIN || '';
const STATE = ROOT + '/room/.dsh-lastseen-' + CHAT.slice(-8) + '.json';
const N = Number(process.env.FS_N || 1);
const RAW = process.argv.includes('--raw');
const t = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ app_id: process.env.FA_ID, app_secret: process.env.FA_SECRET })
}).then(r => r.json());
const h = { authorization: 'Bearer ' + t.tenant_access_token };
const r = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT}&page_size=${N}&sort_type=ByCreateTimeDesc`, { headers: h }).then(x => x.json());
const items = (r.data && r.data.items) || [];
for (const m of items) {
  const c = (m.body.content || '').replace(/\\n/g, '\n');
  console.log(`==== [${m.sender.id}] {${m.create_time}} len=${c.length} ====`);
  console.log(c);
  if (RAW) console.log('---- raw ----\n' + (m.body.content || ''));
  console.log('');
}
if (!items.length) console.log('(no items; code=' + (r.code || 0) + ' msg=' + (r.msg || '') + ')');
const max = Math.max(...items.map(m => Number(m.create_time)), 0);
if (max) { fs.writeFileSync(STATE, JSON.stringify({ last: max }), 'utf8'); console.log('cursor ->', max); }
