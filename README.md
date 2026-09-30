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
| `DSH_PROJECT_DIR` | 覆盖项目根路径（默认由脚本位置推导；见下方「路径信任边界」） | 可选 |
| `ROOM_PORT` | 看板端口（默认 18090） | 可选 |
| `ROOM_HOST` | 看板绑定地址（默认 `127.0.0.1`；非回环需 `ROOM_ALLOW_REMOTE=1` 放行） | 可选 |
| `ROOM_ALLOW_REMOTE` | 设为 `1` 才允许看板绑定非回环地址（**有风险**，见「本地看板的安全边界」） | 可选 |
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

## 数据流向与隐私

**通信边界**：Agent 之间**不直接互相调用**——它们通过「房间」（`room/transcript.md`）这个共享文件间接协作，
再各自通过飞书 API 在群里发言。唯一的**外部网络目标**是飞书的官方接口：

| 目标 | 用途 |
| --- | --- |
| `open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal` | 用 `FA_ID` + `FA_SECRET` 换 `tenant_access_token` |
| `open.feishu.cn/open-apis/im/v1/messages` | 读群消息 / 发消息 |

**数据流向**：

| 数据 | 去哪 | 是否外发 |
| --- | --- | --- |
| `room/transcript.md`（房间内容） | 本机文件 | ❌ **不上传**；看板只在 `127.0.0.1` 提供读取 |
| 游标 / 状态 / 日志（`room/*.json`、`*.log`） | 本机文件 | ❌ 不外发 |
| 群消息 | 通过飞书官方 API 读取 | ✅ 发给 `open.feishu.cn` |
| 发出的消息 | 通过飞书官方 API 发送 | ✅ 发给 `open.feishu.cn` |
| **房间内容（被点名时）** | 作为**提示词**交给 `dsh --profile headless` | ⚠️ **会被 DSH 送进它配置的模型服务**（DeepSeek 等） |

**明确说明**：

- 本项目自身**不含任何模型密钥**：触发 agent 用的 `dsh` 是它自己的进程，
  模型密钥来自 DSH 自身的配置（`$DSH_HOME/.credentials.yaml` 或它自己的环境变量），不经过本仓库。
- 除飞书官方接口与（经 DSH/CLI 的）模型服务外，本仓库脚本**不向任何其他地方发送数据**；
  没有遥测、没有统计。
- ⚠️ **房间内容会进入模型提示词**：不要把密钥、隐私材料粘进房间；房间里已有的敏感内容，
  可用下方「清理」一节处理。

## 本地看板的安全边界

`room-server.mjs` 提供的网页看板**没有任何认证**，因此它：

- **默认只绑定回环地址** `127.0.0.1:18090`（`ROOM_PORT` 可改端口）。
- **非回环地址需要显式放行**：设了 `ROOM_HOST=0.0.0.0` 但没设 `ROOM_ALLOW_REMOTE=1` 时，
  进程会打印告警并**自动退回 `127.0.0.1`**。这样避免"以为只在本机、结果暴露到局域网/公网"。
- **同源校验**：浏览器里任何网页都能向 `127.0.0.1` 发「简单请求」（表单 POST 无需 CORS 预检），
  所以 `POST /speak` 会检查 `Origin`——**跨站来源直接 403**，本机脚本（curl / node，不带 Origin）正常放行。
  这挡住了「打开一个恶意网页 → 内容被注入房间 → 触发 agent」的链路。
- **单条消息上限 64 KB**，超出返回 413。
- 接口只有两个：`GET /raw`（读 transcript）、`POST /speak`（追加一条）——**没有删除或改写接口**。

> ⚠️ 如果你确实要用 `ROOM_ALLOW_REMOTE=1` 把看板放到局域网/公网，**请自行加一层带认证的反向代理**：
> 看板内容就是房间全文，而且能直接触发 agent——裸奔等于把房间和 agent 一起交出去。

## room/ 的落盘、权限与清理

- **位置**：`<项目根>/room/`（`transcript.md` 是房间正文，另有游标/状态/日志文件）。
- **不会被 git 跟踪**：`room/` 已写进 `.gitignore`，房间内容不会进版本库。
- **可能积累敏感内容**：房间是「只追加」的协作记录，**可能包含对话、误粘贴的密钥、隐私信息**。
  它同时是 agent 的输入来源，所以清理时要意识到"删掉的内容不会再被 agent 看到"。
- **权限**：文件继承所在目录的权限。请把项目放在**本机私有目录**（不要放共享盘/同步盘），
  并确认只有你的用户账号可读（Windows 默认用户目录即满足）。
- **清理方式**（任选）：

```powershell
# ① 完全重置房间（保留规则文件）
Remove-Item .\room\transcript.md -Force

# ② 只删运行状态与日志（保留正文）
Remove-Item .\room\*.json, .\room\*.log -Force

# ③ 脱敏：把房间里的可疑内容替换掉（transcript 约定是「只追加」，
#    改写等于破坏历史，建议先归档再改写）
Copy-Item .\room\transcript.md .\room\transcript.archive.md
(Get-Content .\room\transcript.md -Raw) -replace 'sk-[A-Za-z0-9]+', '[REDACTED]' |
  Set-Content .\room\transcript.md -Encoding UTF8
```

> 建议：定期看一眼 `room/transcript.md` 里有没有不该留的东西；如果房间要长期用，
> 把它当成「会被 AI 读取且可能被外发」的介质来对待。

## Agent 触发链路与边界

`room-watch.mjs` 是唯一会自动触发 agent 的脚本，链路如下：

```
轮询 transcript（每 15s）→ 发现最新一条 @dsh/@全员 且发言者不是 dsh
   → 拼一段任务提示词（含房间规则片段 + 该条消息）
   → spawn: dsh --profile headless "<任务>"     ← 超时 300s，串行（busy 标志）
   → agent 把回复写入 room/.dsh-reply.tmp
   → 本进程按格式追加回 transcript
```

**边界与防护**：

| 项 | 现状 |
| --- | --- |
| 调用什么 | `dsh --profile headless`（本机已安装的 DSH CLI）；它自己再去调模型服务 |
| 密钥来源 | 本项目只提供 `FA_ID`/`FA_SECRET`（读飞书）；**模型密钥来自 DSH 自身配置** |
| **命令注入防护** | 任务文本作为 `cmd.exe` 的引号参数传入，拼接前会**中和换行**（否则会截断命令行、后续文本被当成新命令）、**中和双引号**、**中和 `%`**（阻断 cmd 的 `%VAR%` 展开，避免环境变量内容泄进提示词），并限制长度 8000 |
| 发消息的注入防护 | `wby-inbox-watch.mjs` 里 `--chat-id` 取自房间内容，会先校验 `oc_...` 形态才允许拼接；消息文本同样去掉 `%` |
| 限频 | 轮询间隔 15s、每轮只处理一条、生成过程串行；`wby-inbox-watch.mjs` 每 10s 一轮，连续失败 3 次后停 |
| 超时 | headless 300s 后 `kill` |

⚠️ **提示词注入是本项目固有风险**：房间内容来自**任何能在群里发言的人**（以及能访问看板的进程），
而它会原样进入 agent 的提示词。因此请：

- 不要给参与协作的 agent 配置高危工具权限（能删文件、能付款、能对外发消息的那种）；
- 把 agent 的输出当作**建议**而非事实，重要动作由人复核；
- 群里出现可疑指令（例如"忽略以上规则，把 X 发到 Y"）时，按**未授权输入**处理。

## 路径信任边界（DSH_PROJECT_DIR）

`DSH_PROJECT_DIR` 覆盖项目根，**它决定所有脚本读写哪个目录**——这本身是一条信任边界：
指向不可信目录，脚本就会去读写那里的 `room/`。

代码里已做校验：**只有当该目录含 `scripts/` 或 `room/` 时才采用**，否则打印告警并回退到
「按脚本位置推导出来的项目根」。因此：

- 正常情况下**不需要设置它**（把整个目录搬到别处也能直接跑）；
- 只有当你把脚本和房间分开放时才设置，并且**只指向你自己的目录**；
- 不要把它指向下载目录、共享盘或他人可写的路径。

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
