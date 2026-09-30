// feishu-dsh-watch-teapulse.mjs — 茶脉群 DSH 看门狗（常驻循环版）
// 盯「茶脉——舆情监测系统」群（群 ID 由 FS_CHAT_TEAPULSE 指定），
// 发现 WBY/人类 新消息 → 追加到 room/feishu-dsh-inbox-teapulse.md → 供 DSH(当前会话=茶脉总管)读取响应。
// 与量化群看门狗(feishu-dsh-watch.mjs, 盯 oc_05e28c)互不干扰、inbox 独立 → 不串群。
// 启动: node feishu-dsh-watch-teapulse.mjs   (需要 FA_ID/FA_SECRET 环境变量)
// 退出: Ctrl+C。建议常驻（如 pm2 / 计划任务 / 后台 job）。
import fs from 'node:fs';
import { ROOT } from './paths.mjs';
const STATE = ROOT + '/room/.dsh-teapulse-lastseen.json';
const INBOX = ROOT + '/room/feishu-dsh-inbox-teapulse.md';
const CHAT = process.env.FS_CHAT_TEAPULSE || '';  // 茶脉群（独立，勿与量化群混）
const SELF = process.env.FS_SELF_APP || '';      // 自己的发消息跳过
const WBY = process.env.FS_WBY_APP || '';      // WBY bot
const HUMAN = process.env.FS_HUMAN_OPEN || '';

async function main() {
  const token = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: process.env.FA_ID, app_secret: process.env.FA_SECRET })
  }).then(r => r.json());
  if (!token.tenant_access_token) { console.error('token 获取失败 code=' + token.code); process.exit(1); }
  const h = { authorization: 'Bearer ' + token.tenant_access_token };
  let last = null;
  try { last = JSON.parse(fs.readFileSync(STATE, 'utf8')).last; } catch { last = 0; }
  console.log('茶脉看门狗启动, chat=' + CHAT + ', last=' + last);

  setInterval(async () => {
    try {
      const r = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${CHAT}&page_size=15&sort_type=ByCreateTimeDesc`, { headers: h }).then(x => x.json());
      const items = (r.data && r.data.items) || [];
      const fresh = items.filter(m => Number(m.create_time) > last && m.sender && m.sender.id !== SELF && (m.sender.id === WBY || m.sender.id === HUMAN));
      if (fresh.length) {
        const t = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const lines = fresh.sort((a, b) => Number(a.create_time) - Number(b.create_time)).map(m => {
          let c = '';
          try { c = JSON.parse(m.body.content || '{}').text || ''; } catch { c = (m.body.content || '').replace(/\\n/g, '\n'); }
          return `## [${t}] ${m.sender.id === WBY ? 'WBY' : '人类'} ${m.message_id} ${m.msg_type}\n${c.slice(0, 2000)}\n`;
        });
        fs.appendFileSync(INBOX, '\n' + lines.join('\n'), 'utf8');
        // 提醒文件：主对话每轮开始时检查此文件感知待处理消息
        const PENDING = ROOT + '/room/tea-pulse-PENDING.md';
        try { fs.appendFileSync(PENDING, '\n' + lines.join('\n'), 'utf8'); } catch(e){}
        console.log('>>> 茶脉群有新消息待处理，提醒已写入 tea-pulse-PENDING.md');
        last = Math.max(...fresh.map(m => Number(m.create_time)));
        fs.writeFileSync(STATE, JSON.stringify({ last }), 'utf8');
        console.log('茶脉群 GOT ' + fresh.length + ' msg(s), last=' + last);
      }
    } catch (e) { console.error('轮询错误:', e.message); }
  }, 20000);
}
main();
