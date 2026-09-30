# 多 Agent 协作（飞书 × DSH × WBY）

让**一个人和多个 AI Agent** 在同一间飞书群里协作：不同的 agent（DSH / WorkBuddy 等）各自以机器人身份收发消息，共用一间「协作房」的位置与状态。

```
飞书群  ⇄  scripts/feishu-*.mjs  ⇄  room/（transcript.md 只追加）  ⇄  room-server.mjs（网页看板）
                     ⇅
              DSH / WBY 各自 headless 生成回复
```

## 组件

| 脚本 | 作用 |
| --- | --- |
| `scripts/paths.mjs` | **路径唯一来源**：项目根由脚本位置推导，可用 `DSH_PROJECT_DIR` 覆盖 |
| `scripts/room-server.mjs` | 房间网页看板（`http://127.0.0.1:18090`）+ 发言框，读/追加 `room/transcript.md` |
| `scripts/room-watch.mjs` | 看门狗：轮询 transcript，被点名就调 DSH headless 生成回复并追加 |
| `scripts/room.ps1` | 房间启停脚本 |
| `scripts/feishu-dsh-read.mjs` | 读群消息（DSH 侧，截断版） |
| `scripts/feishu-dsh-read-full.mjs` | 读群消息（DSH 侧，**全文**不截断） |
| `scripts/feishu-dsh-send.mjs` | 往主群发消息（草稿文件 → 富文本 post + @） |
| `scripts/feishu-dsh-watch.mjs` | 盯主群，发现新消息 → 写入收件箱供 DSH 响应 |
| `scripts/feishu-inbox.mjs` | 入站桥：轮询群消息 → 把点名 WBY 的消息追加到 `room/feishu-inbox.md` |
| `scripts/feishu-wby-agent.mjs` | WBY 机器人代理（收件箱 → 调 CLI → 回帖） |
| `scripts/wby-inbox-watch.mjs` | WBY 侧收件箱看门狗（补齐「已收到」标记，防重复） |
| `scripts/teapulse-responder.mjs` | 「茶脉」群自动应答（独立于主群，勿混用） |
| `scripts/feishu-dsh-watch-teapulse.mjs` | 盯「茶脉」群 |
| `scripts/feishu-dsh-send-teapulse.mjs` | 往「茶脉」群发消息 |
| `scripts/_start-tp-watch.cmd` | 茶脉盯群的一键启动（Windows） |

## 配置（密钥与标识全部走环境变量）

**本仓库不含任何群 ID、open_id、app_id 或密钥**——全部从环境变量读取。

| 变量 | 用途 | 必填 |
| --- | --- | --- |
| `FA_ID` | 飞书应用 App ID | ✅ |
| `FA_SECRET` | 飞书应用 App Secret | ✅ |
| `FS_CHAT_MAIN` | 主协作群 chat_id（`oc_...`） | ✅ |
| `FS_SELF_APP` | 本 agent 自己的 app_id（用于跳过自己发的消息） | ✅ |
| `FS_WBY_APP` | 另一个 agent 的 app_id | ✅ |
| `FS_WBY_OPEN` | 另一个 agent 机器人的 open_id（`ou_...`） | 发 @ 时必填 |
| `FS_HUMAN_OPEN` | 人类的 open_id（`ou_...`，用于识别/ @ 人类） | 发 @ 时必填 |
| `FS_CHAT_TEAPULSE` | 「茶脉」群 chat_id（仅茶脉相关脚本用） | 用茶脉群时必填 |
| `DSH_PROJECT_DIR` | 覆盖项目根路径（默认由脚本位置推导） | 可选 |
| `TEA_PROJECT_DIR` | 茶脉项目目录（供提示词引用） | 可选 |
| `LARK_CLI` | 飞书 CLI 可执行文件（默认 `lark-cli`） | 用入站桥时必填 |
| `LARK_CLI_JS` | 飞书 CLI 的 JS 入口（无 PATH 时用 `node <入口>` 调用） | 可选 |
| `WBY_CLI` | WorkBuddy CLI 可执行文件（默认 `codebuddy`） | 用 WBY 代理时必填 |
| `FS_DRAFT` | 发消息草稿文件路径（默认 `room/feishu-dsh-draft.txt`） | 可选 |
| `FS_ALLOW_STALE` | 设为 `1` 允许重发与上次相同的草稿（默认拒绝，防重复刷群） | 可选 |
| `FS_N` | 读消息条数（默认 1） | 可选 |

示例见 [`.env.example`](.env.example)。

### 本机使用（不让真实标识入库）

把真实标识写进**已被 gitignore** 的 `scripts/.env.local.cmd`（或 `.ps1`），运行前先加载：

```powershell
# PowerShell
. .\scripts\.env.local.ps1
node scripts\room-server.mjs

# cmd
call scripts\.env.local.cmd
node scripts\feishu-dsh-watch.mjs
```

## 运行

```powershell
# 1) 启动房间看板（http://127.0.0.1:18090）
node scripts\room-server.mjs

# 2) 启动看门狗（被点名时自动让 DSH 生成回复）
node scripts\room-watch.mjs

# 3) 飞书侧（需要 FA_ID / FA_SECRET 与各 FS_* 标识）
node scripts\feishu-dsh-watch.mjs
```

## 第三方依赖说明

本项目**本身零 npm 依赖**（只用 Node 内置模块），但完整链路会用到两个**第三方**组件：

| 组件 | 说明 |
| --- | --- |
| `lark-cli`（飞书官方 CLI） | 入站桥用它收发消息；本项目只调用，不包含它 |
| `dsh-lark-bridge` 之类的飞书桥 | 把飞书消息接进 DSH 会话；**第三方项目**，本项目不包含、也不依赖其代码 |

> 本仓库只包含**协作编排脚本**。要让 DSH 真正在飞书里说话，需要你自己准备上述桥接组件。

## 安全注意事项

- **密钥不入库**：App Secret 等只从环境变量读；本仓库不含任何凭据，也不含群 ID / open_id。
- **网页看板只监听本机**：`room-server.mjs` 绑定 `127.0.0.1:18090`，不要暴露到公网。
- **`room/` 是运行状态**（游标、最近消息、回复缓存），已在 `.gitignore` 排除。
- **agent 产出内容不可全信**：本项目的核心是让多个 AI 在同一群里发言，
  自动化回复**可能出错**、也可能被群内消息影响。重要决策请人类复核后再执行。
- **权限最小化**：飞书应用只授予必要权限；不要用管理员账号跑这些脚本。

## 说明

- `room/transcript.md` 采用**只追加**约定：不修改历史，便于回溯谁在什么时候说了什么。
- 概念与背景见 [`AGENTS.md`](AGENTS.md)（面向 agent 的技术约定）。

## 关于本项目

- 本项目由 **AI（DeepSeek Harness）生成**，人类负责需求定义与验收。代码未逐字复制任何第三方项目。
- 公开前已把本机使用的群 ID / open_id / app_id 全部改为环境变量读取。

## License

MIT，见 [LICENSE](LICENSE)。
