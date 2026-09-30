#!/usr/bin/env node
// wby-inbox-watch.mjs — WBY 侧飞书收件箱看门狗 v2
// 每 10s 扫 <项目根>/room/feishu-inbox.md：
//   发现点名 @WBY 且无标记、且状态文件未记录的块 → lark-cli(bot) 发「已捕获」回执
//   → 标记插入到【对应块下方】（不再追加文件尾）+ 状态文件 wby-watch-state.json 双重防重。
// 深度回复由 WBY 自动化（小时级）或被唤醒的会话完成（打 `- [已回复 ...]`）。
// 用法：node wby-inbox-watch.mjs [--once]
import fs from 'node:fs';
import { ROOM } from './paths.mjs';
import { spawnSync } from 'node:child_process';

const INBOX = ROOM + '/feishu-inbox.md';
const STATE = ROOM + '/wby-watch-state.json';
const LOG = ROOM + '/wby-watch.log';
const DEFAULT_CHAT = process.env.FS_CHAT_MAIN || '';
const INTERVAL_MS = 10000;
// lark-cli 全路径（DSH 情报核实）：终端 PATH 里没有 lark-cli 时裸调用会 'not recognized'。
// 终极方案：直接用本进程的 node（process.execPath）跑 lark-cli 的 JS 入口——不依赖 .cmd 包装、不依赖终端 PATH。
const LARK_JS = process.env.LARK_CLI_JS || '';
const LARK_CLI = fs.existsSync(LARK_JS) ? process.execPath + ' "' + LARK_JS + '"' : 'lark-cli';
const MAX_FAIL = 3;
const ONCE = process.argv.includes('--once');
const MARKERS = ['已回复', '已收到', '回复失败']; // 块内任一存在 = 看门狗不再碰

const log = (m) => {
  const line = `[${new Date().toISOString()}] ${m}`;
  try { fs.appendFileSync(LOG, line + '\n', 'utf8'); } catch {}
  try { console.log(line); } catch {}
};
process.on('uncaughtException', (e) => log('uncaughtException: ' + (e && e.message)));
process.on('unhandledRejection', (e) => log('unhandledRejection: ' + (e && (e.message || e))));

const nowTs = () => new Date().toTimeString().slice(0, 5);

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { acked: [], fails: {} }; }
}
function saveState(s) {
  try { fs.writeFileSync(STATE, JSON.stringify(s, null, 2), 'utf8'); } catch (e) { log('state save fail: ' + e.message); }
}

function parseBlocks(text) {
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^## \[([^\]]+)\]\s+(.*)$/);
    if (!h) continue;
    const meta = h[2];
    const c = meta.match(/chat_id=(\S+)/);
    const m = meta.match(/msg_id=(\S+)/);
    let end = lines.length; // 块体 = header+1 到下一个 header 前
    for (let j = i + 1; j < lines.length; j++) {
      if (/^## \[/.test(lines[j])) { end = j; break; }
    }
    blocks.push({ headerIdx: i, endIdx: end, ts: h[1], chat: c ? c[1] : null, msgId: m ? m[1] : null, meta, body: lines.slice(i + 1, end) });
  }
  return blocks;
}

const marked = (b) => b.body.some((l) => MARKERS.some((t) => l.trim().startsWith(`- [${t}`)));

// 把标记行插到指定块末尾（header 之后、下一 header 之前），失败重试 2 次；失败只记日志（state 文件仍兜底防重）
function markInFile(b, line) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const lines = fs.readFileSync(INBOX, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
      let target = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^## \[/.test(lines[i]) && (b.msgId ? lines[i].includes(b.msgId) : lines[i] === b.meta)) {
          let end = lines.length;
          for (let j = i + 1; j < lines.length; j++) if (/^## \[/.test(lines[j])) { end = j; break; }
          target = end;
          break;
        }
      }
      if (target < 0) { log(`markInFile: block not found (${b.msgId})`); return false; }
      lines.splice(target, 0, line);
      fs.writeFileSync(INBOX, lines.join('\n'), 'utf8');
      return true;
    } catch (e) {
      log(`markInFile attempt${attempt + 1} fail: ${e.message}`);
      if (attempt < 2) { const t = Date.now(); while (Date.now() - t < 300) {} }
    }
  }
  return false;
}

function ack(b) {
  const quote = b.body.join(' ').replace(/\s+/g, ' ').replace(/["\\]/g, '').trim().slice(0, 40);
  const text = `收到：「${quote}」（WBY 自动接轮 ${nowTs()}）已捕获进队列，深度处理稍后完成。`;
  const cmd = `"${LARK_CLI}" im +messages-send --as bot --chat-id ${b.chat || DEFAULT_CHAT} --text "${text}"`;
  try {
    const r = spawnSync(cmd, { encoding: 'utf8', shell: true, timeout: 60000 });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    try {
      const j = JSON.parse(r.stdout || '{}');
      if (j.ok && j.data && j.data.message_id) return { ok: true, id: j.data.message_id };
    } catch {}
    return { ok: false, err: out.slice(0, 160) || ('exit=' + r.status) };
  } catch (e) {
    return { ok: false, err: 'spawn: ' + e.message };
  }
}

function cycle() {
  let text;
  try { if (!fs.existsSync(INBOX)) return; text = fs.readFileSync(INBOX, 'utf8'); } catch (e) { log('inbox read fail: ' + e.message); return; }
  const state = loadState();
  const blocks = parseBlocks(text);
  const pending = blocks.filter((b) => {
    const body = b.body.join('\n');
    if (body.includes('<card title=')) return false; // DSH 操作审批卡：JSON 里可能含 @WBY 字样，永远跳过
    if (!/@WBY|@咕咕咕的Agent\(WBY\)/i.test(body)) return false;
    if (marked(b)) return false;
    const key = b.msgId || (b.ts + '|' + b.body.join(' ').slice(0, 60));
    if (state.acked.includes(key)) return false;
    return true;
  });
  if (!pending.length) return;
  log(`pending=${pending.length}`);
  for (const b of pending.slice(0, 3)) {
    const key = b.msgId || (b.ts + '|' + b.body.join(' ').slice(0, 60));
    const fails = (state.fails && state.fails[key]) || 0;
    if (fails >= MAX_FAIL) { markInFile(b, `- [回复失败 ${nowTs()} by wby-watch] -> 连续${fails}次失败，停止重试交人工`); continue; }
    const r = ack(b);
    if (r.ok) {
      state.acked.push(key);
      saveState(state);
      const okMark = markInFile(b, `- [已收到 ${nowTs()} by wby-watch] -> ${r.id}`);
      log(`acked ${b.msgId || key} -> ${r.id}${okMark ? '' : ' (标记写文件失败，state 兜底)'}`);
    } else {
      state.fails = state.fails || {};
      state.fails[key] = fails + 1;
      saveState(state);
      log(`ack FAILED ${b.msgId || key} x${fails + 1}: ${r.err}`);
    }
  }
}

log(ONCE ? 'single cycle (--once) v2' : `watcher v2 started (every ${INTERVAL_MS / 1000}s)`);
cycle();
if (!ONCE) setInterval(cycle, INTERVAL_MS);
