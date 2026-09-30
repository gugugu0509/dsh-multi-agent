// DSH 群看门狗：检测到 WBY/人类新消息即完成任务（通知 DSH 接复），避免漏 @。
import fs from 'node:fs';
import { ROOT } from './paths.mjs';
const CHAT = process.env.FS_CHAT_MAIN || ''; // 可指定目标群
const STATE = ROOT + '/room/.dsh-lastseen-' + CHAT.slice(-8) + '.json';
const INBOX = ROOT + '/room/feishu-dsh-inbox.md';
const SELF = process.env.FS_SELF_APP || '';      // 自己的发消息跳过
const WBY = process.env.FS_WBY_APP || '';      // WBY bot
const HUMAN = process.env.FS_HUMAN_OPEN || '';
let last = null;
let failStreak = 0;
const t0 = Date.now();
async function newToken() {
  const t = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ app_id: process.env.FA_ID, app_secret: process.env.FA_SECRET }) }).then(r => r.json());
  return t.tenant_access_token;
}
let tk = await newToken();
let h = { authorization: 'Bearer ' + tk };
let tokenAt = Date.now();
async function auth() {
  if (Date.now() - tokenAt > 5400000) { tk = await newToken(); h = { authorization: 'Bearer ' + tk }; tokenAt = Date.now(); } // 90 分钟刷新
  return h;
}
// 启动游标：优先用持久化状态（不漏"无看门狗空档期"到达的消息）；无状态时才对齐当前最新
{
  let loaded = 0;
  try { loaded = Number(JSON.parse(fs.readFileSync(STATE, 'utf8')).last) || 0; } catch { loaded = 0; }
  if (loaded > 0) { last = loaded; }
  else {
    const init = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT}&page_size=5&sort_type=ByCreateTimeDesc`, { headers: h }).then(x => x.json());
    last = Math.max(...((init.data && init.data.items) || []).map(m => Number(m.create_time)), 0);
    fs.writeFileSync(STATE, JSON.stringify({ last }), 'utf8');
  }
}
while (Date.now() - t0 < 43200000) { // 最多 12 小时
  let result;
  try {
    result = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT}&page_size=15&sort_type=ByCreateTimeDesc`, { headers: await auth() }).then(x => x.json());
  } catch (e) { await new Promise(res => setTimeout(res, 15000)); continue; } // 瞬时网络抖动：等待重试，不退出
  if (result.code && result.code !== 0) { // token 失效等：强制刷新，连续失败则退出以便唤醒 DSH
    failStreak++;
    tk = await newToken(); h = { authorization: 'Bearer ' + tk }; tokenAt = Date.now();
    if (failStreak > 40) { console.log('WATCH FAIL code=' + result.code + ' msg=' + (result.msg || '')); process.exit(2); }
    await new Promise(res => setTimeout(res, 15000));
    continue;
  }
  failStreak = 0;
  const items = (result.data && result.data.items) || [];
  const fresh = items.filter(m => Number(m.create_time) > last && m.sender && m.sender.id !== SELF && (m.sender.id === WBY || m.sender.id === HUMAN));
  if (fresh.length) {
    const t = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const lines = fresh.sort((a, b) => Number(a.create_time) - Number(b.create_time)).map(m => {
      const c = (m.body.content || '').replace(/\\n/g, '\n');
      return `## [${t}] ${m.sender.id === WBY ? 'WBY' : '人'} ${m.message_id} ${m.msg_type}\n${c.slice(0, 1500)}\n`;
    });
    fs.appendFileSync(INBOX, '\n' + lines.join('\n'), 'utf8');
    last = Math.max(...fresh.map(m => Number(m.create_time)));
    fs.writeFileSync(STATE, JSON.stringify({ last }), 'utf8');
    console.log('GOT ' + fresh.length + ' msg(s), last=' + last);
    process.exit(0);
  }
  if (!last) { last = Math.max(...items.map(m => Number(m.create_time))); fs.writeFileSync(STATE, JSON.stringify({ last }), 'utf8'); }
  await new Promise(res => setTimeout(res, 20000));
}
console.log('TIMEOUT no new msg');
