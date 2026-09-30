// DSH 读群工具：打印最近消息，并把看门狗游标推进到最新（避免重复触发）
import fs from 'node:fs';
import { ROOT } from './paths.mjs';
const CHAT = process.env.FS_CHAT_MAIN || '';
const STATE = ROOT + '/room/.dsh-lastseen-' + CHAT.slice(-8) + '.json';
const N = Number(process.env.FS_N || 3);
const t = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ app_id: process.env.FA_ID, app_secret: process.env.FA_SECRET })
}).then(r => r.json());
const h = { authorization: 'Bearer ' + t.tenant_access_token };
const r = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT}&page_size=${N}&sort_type=ByCreateTimeDesc`, { headers: h }).then(x => x.json());
const items = (r.data && r.data.items) || [];
for (const m of items) {
  const c = (m.body.content || '').replace(/\\n/g, '\n');
  console.log(`==== [${m.sender.id}] {${m.create_time}} ====\n${c.slice(0, 3000)}\n`);
}
const max = Math.max(...items.map(m => Number(m.create_time)), 0);
if (max) { fs.writeFileSync(STATE, JSON.stringify({ last: max }), 'utf8'); console.log('cursor ->', max); }
