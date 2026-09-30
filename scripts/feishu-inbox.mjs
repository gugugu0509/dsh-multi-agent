// 飞书入站桥（给 WBY 用的"常驻盯群"）：轮询群消息 → 把点名 WBY 的新消息追加到 room/feishu-inbox.md
// WBY 侧 automation 盯 feishu-inbox.md 消费（深度回复走 WBY 本体）。
// 启动: node feishu-inbox.mjs    状态: room\.feishu-inbox-cursor.json
// 2026-09-06 桥接侧修复（DSH/云鹊桥，按 WBY 03:00/03:21 指出的问题）：
//   ① 只收"真 @WBY"（@咕咕咕的Agent(WBY) 全半角括号/@mention 对象）——不再收仅含 "WBY" 字样的
//      普通文本/审批卡片/邀请提示（原 substring 匹配导致 DSH 消息与 <card> 被误灌）；
//   ② msg_id 去重：启动时读取 inbox 已有块的 msg_id，重复消息不再重写（治 02:16 旧消息被二次回填）；
//   ③ 写块前确保文件以 \n\n 结尾（治"块头与上块标记行粘连导致解析不可见"）。
import { execSync } from "node:child_process";
import { appendFile, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const LARK = process.env.LARK_CLI || 'lark-cli';
const CHAT_ID = process.env.FS_CHAT_MAIN || ''; // 主协作群
import { ROOM } from './paths.mjs';
const INBOX = ROOM + "/feishu-inbox.md";
const STATE = ROOM + "/.feishu-inbox-cursor.json";
const TMP = ROOM + "/.feishu-poll.json";
const POLL_MS = 15000;
// WBY 机器人 open_id（mention 里点名=真@）；本机 WBY app id（自己发的跳过）
const WBY_BOT_OPEN_ID = process.env.FS_WBY_OPEN || '';
const WBY_APP_ID = process.env.FS_WBY_APP || '';
const WBY_NAME_RE = /@咕咕咕的?Agent[（(]WBY[)）]/i; // 文本点名（展示名，全/半角括号均可）
let cursor = null; // 已处理到的最新 message_id
const seen = new Set(); // 已写入 inbox 的 msg_id（去重）

function log(m) { const line = `[${new Date().toISOString()}] ${m}\n`; appendFile(ROOM + "/feishu-inbox.log", line, "utf8").catch(() => {}); process.stdout.write(line); }

function runLark(args) {
  const argStr = args.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(" ");
  const cmd = `"${LARK}" ${argStr} > "${TMP}" 2>&1`;
  execSync(cmd, { shell: true, windowsHide: true });
  return readFile(TMP, "utf8");
}

async function loadCursor() { try { cursor = JSON.parse(await readFile(STATE, "utf8")).lastId; } catch { cursor = null; } }
async function saveCursor(id) { await writeFile(STATE, JSON.stringify({ lastId: id }), "utf8").catch(() => {}); }

// 启动时把 inbox 已有块的 msg_id 读入 seen，避免重启/重扫时二次回填
async function loadSeen() {
  try {
    const t = await readFile(INBOX, "utf8");
    for (const m of t.matchAll(/msg_id=([^\s]+)/g)) seen.add(m[1]);
  } catch {}
  log("dedup loaded msg_ids=" + seen.size);
}

function isWbyMessage(m) {
  const sender = m.sender || {};
  if (sender.id === WBY_APP_ID) return false; // 自己(WBY侧凭据)发的跳过
  const mentions = m.mentions || [];
  const hitMention = mentions.some((x) => x.id === WBY_BOT_OPEN_ID || /咕咕咕的?Agent[（(]WBY[)）]/i.test(x.name || ""));
  const content = m.content || "";
  const hitText = WBY_NAME_RE.test(content);
  return hitMention || hitText; // 仅真 @；普通文本含 "WBY"、卡片、邀请提示一律不收
}

// 写块前确保文件以 \n\n 结尾（块与上一块/标记行之间留空行）
async function ensureGap() {
  try {
    const t = await readFile(INBOX, "utf8");
    if (t.endsWith("\n\n")) return;
    await appendFile(INBOX, t.endsWith("\n") ? "\n" : "\n\n", "utf8");
  } catch {}
}

async function poll() {
  let json;
  try {
    json = await runLark(["im", "+chat-messages-list", "--chat-id", CHAT_ID, "--page-size", "50", "--format", "json"]);
  } catch (e) { log("list error: " + e.message); return; }
  let data; try { data = JSON.parse(json); } catch { log("parse error"); return; }
  if (!data.ok) { log("api not ok: " + (data.error ? JSON.stringify(data.error).slice(0, 200) : "")); return; }
  const msgs = (data.data && data.data.messages) || [];
  const fresh = [];
  for (const m of msgs) { if (cursor && m.message_id === cursor) break; fresh.push(m); }
  fresh.reverse(); // 旧→新
  let newLast = null;
  for (const m of fresh) {
    if (isWbyMessage(m) && !seen.has(m.message_id)) {
      const who = (m.sender && (m.sender.name || m.sender.id)) || "?";
      const block = `## [${m.create_time}] chat_id=${CHAT_ID} sender=${who} msg_id=${m.message_id}\n${m.content || ""}\n`;
      await ensureGap();
      await appendFile(INBOX, block, "utf8");
      seen.add(m.message_id);
      log("inbox += " + who + " : " + String(m.content || "").slice(0, 60));
    }
    newLast = m.message_id;
  }
  if (newLast) { cursor = newLast; await saveCursor(newLast); }
  rm(TMP, { force: true }).catch(() => {});
}

await loadCursor();
await loadSeen();
if (!existsSync(INBOX)) await writeFile(INBOX, "# 飞书入站（供 WBY automation 消费）\n\n> 点名 @咕咕咕的Agent(WBY) 的新群消息会追加到这里；处理完请在对应块下追加标记防重复。\n\n", "utf8").catch(() => {});
log("feishu-inbox started, chat=" + CHAT_ID + ", cursor=" + (cursor || "(fresh, 只收新消息)"));
setInterval(poll, POLL_MS);
