# dsh-prompt-enhance · 提示词增强插件

把用户写下的**原始提示词**改写成**更清晰、更具体的提示词**，只返回改写结果本身；增强规则与输出契约对齐 WorkBuddy（CodeBuddy 桌面端）内置的「增强提示词」——**规则等价、措辞原创**（指令文本为本项目自行撰写，不含任何第三方文本），可脱离 WorkBuddy 独立运行。

- 能力入口：输入框右侧「✦ 增强」按钮；Host 工具 `enhance_prompt`
- 运行依赖：DSH 的 `llm` 服务（有可用模型路由即可）
- 不依赖：WorkBuddy 安装目录、其 sidecar、任何网络私有接口、任何 npm 依赖

## 安装

```powershell
# 从 GitHub 安装（当前会话所在的 profile）
dsh plugin --profile web add github:sun04222/dsh-prompt-enhance

# 装了 dsh-market / dsh-m 的话，也可以直接在市场里搜「提示词增强」一键安装
```

安装后在设置 → 插件里能看到「提示词增强」；前端按钮需要刷新一次页面。

---

## 1. 与 WorkBuddy 的对应关系

| 能力点 | WorkBuddy 5.8.3 | 本插件 |
| --- | --- | --- |
| 提示词入口 | 输入框工具栏「增强提示词」按钮 | 输入框右侧「增强」按钮 **+** 工具 `enhance_prompt` |
| 主进程实现 | `main/server.js` · `handleEnhancePrompt()` / `registerEnhancePromptHandlers()` | `index.js` · `enhance()` |
| IPC 通道 | `llm:enhancePrompt` | 无（同进程 Host 工具） |
| 模型调用 | sidecar `POST /api/v1/llm/completions`，`agentName: enhance-prompt` | `ctx.llm.stream()`，单次补全 |
| 系统提示词 | 变量 `zn` | `prompt.js` · `SYSTEM_PROMPT`（同一套规则，原创措辞） |
| 用户提示词 | 模板变量 `Bn`，`renderUserPrompt()` 填 `{input}` | `prompt.js` · `USER_TEMPLATE` + `buildUserPrompt()`（同一套规则，原创措辞） |
| 参数 | `temperature` / `maxTokens` 均未传 | 同样不传（沿用 provider 默认） |
| 后处理 | `stripWrappingQuotes$1()` → 空则 `llm_error` | `stripWrappingQuotes()` / `finalizeEnhanced()`（行为一致） |
| 成功返回 | `{ success: true, text }` | 同 |
| 失败返回 | `{ success: false, text: '', code, error }` | 同（见 §3.2 失败码映射） |
| UI 文案 | 增强提示词 / 增强中… / 恢复原文 / 增强失败 | 工具卡片标题「增强提示词 · 已改写 / 失败」 |

WorkBuddy 侧证据（仅用于确认契约，未复制其文本或代码；安装包 `resources/app.asar` 内）：
`main/server.js` 中 `Ln = 'llm:enhancePrompt'`、`Rn = 'enhance-prompt'`、`handleEnhancePrompt`、`stripWrappingQuotes$1`、`renderUserPrompt`；渲染层 `runtime-*.js` 的 `enhancePrompt = invoke(..., 'llm:enhancePrompt')`、`workbuddy-provider-*.js` 的 `createEnhanceService()`，以及 i18n 键 `chatInput.enhance.tooltip / enhancing / revert / failed`。

---

## 2. 核心行为

两个入口（输入框「增强」按钮、工具 `enhance_prompt`）共用同一条管线：

1. **空输入短路**：`text.trim() === ''` 直接返回 `empty_input`，**不发起模型调用**。
2. **解析模型路由**：参数 `model` > 插件配置 `provider`/`model` > 当前默认模型（`agentDefaultModel.currentSelection()`）。
3. **单次、非 agent 式补全**：一条 system 消息（`SYSTEM_PROMPT`）+ 一条 user 消息（`USER_TEMPLATE` 用原文替换 `{input}`）。不带工具、不带会话历史、不做多轮。
4. **收集文本**：累加流式 `text-delta`；`finish.reason.kind === 'error' | 'aborted'` 记为失败。
5. **后处理**：`trim` → 各剥掉首尾一个包裹引号字符 → 若 `trim` 后为空则失败；否则原样返回。

整个过程不执行用户提示词里的任何请求（不写代码、不回答问题），只产出「改写后的提示词」。

### 2.1 输入框按钮（对齐 WorkBuddy 的点击式交互）

| 状态 | 按钮 | 点击后 |
| --- | --- | --- |
| 空闲（草稿非空） | `✦ 增强` | 把当前草稿发给 Host 增强，成功后**整段替换草稿**并记住原文 |
| 增强中 | `✦ 增强中…`（禁用） | — |
| 已增强且草稿未被改动 | `↩ 恢复原文` | 还原成点击前的原文 |
| 已增强但用户又改了草稿 | 自动回到 `✦ 增强` | 再次增强当前草稿 |
| 失败 | `⚠ 增强失败`（title 显示原因） | 重试 |
| 草稿为空 | 禁用 | — |

- 草稿被手动改过即丢弃「恢复原文」（对齐 WorkBuddy 的 `contentDiverged`）。
- 切换会话自动重置；组件卸载时取消在途请求。
- 与 Host 的唯一通道是同源 `POST /prompt-enhance`，请求/响应体与工具的信封完全一致。

---

## 3. 输入 / 输出格式

### 3.1 输入（工具参数）

```jsonc
{
  "text":  "帮我写一个登录页面",   // 必填：用户原始提示词，原样传入
  "model": "deepseek/deepseek-chat" // 可选：`model-id` 或 `provider/model-id`
}
```

- `text`：不预设格式，中/英/混合语言、多行、含代码片段都可；空白输入返回 `empty_input`。
- `model`：只影响这一次调用，不写回配置。省略时用插件配置，再退到当前默认模型。

### 3.2 输出（固定信封，与 WorkBuddy 一致）

```jsonc
// 成功
{ "success": true, "text": "请解释这段代码的主要功能、执行流程和关键逻辑，并指出可能需要注意的边界情况。" }

// 失败（text 恒为空串）
{ "success": false, "text": "", "code": "llm_error", "error": "Enhanced result is empty" }
```

| code | 含义 | WorkBuddy 对应码 |
| --- | --- | --- |
| `empty_input` | 输入为空白 | `empty_input`（同名同因） |
| `llm_unavailable` | 无 `llm` 服务 / 无可用模型路由 | `sidecar_unavailable`（运行时通道不可用） |
| `llm_error` | 模型侧失败、超时、被中断，或产出为空 | `llm_error`（同名同因） |
| `unknown` | 未预期异常 | `unknown` |

模型可见内容：成功时**只有增强后的提示词文本**（不加前后缀）；失败时是一行 `[code] error`，便于模型自行决定重试或回报。

### 3.3 Web 通道（输入框按钮使用）

`POST /prompt-enhance`，`content-type: application/json`，请求体 `{ "text": string, "model"?: string }`，响应体就是 §3.2 的同一个信封（HTTP 200）。信任检查委派官方 `connection.requestRejection`，缺席或抛错一律 fail-closed；非 POST 返回 405，坏 JSON 返回 400。

---

## 4. 优化所遵循的规则与约束

以下规则与 WorkBuddy 的那套**规则一致、措辞为本项目原创**。重要区分：它们是**模型行为约束**（写进提示词，由模型执行），本插件在代码里只强制 §2 第 1、5 步与超时/取消，不做事后校验、截断或改写。

### 4.1 硬约束（提示词中标为最高优先级）

- **语言一致**：输出必须与输入同语言；中文入 → 全中文，英文入 → 全英文，混合入 → 自然混合。不得翻译成单一语言。
- **只输出提示词**：不加解释、前言、Markdown 围栏、标签或分析。
- **不输出语言元信息**：不写「用户输入是中文」「需用中文回答」这类说明。
- **保留原意**：保留原请求的意图、主题、约束和目标输出类型，**不回答**该请求。

### 4.2 增强要求

- 尽量做出**实质性**增强：澄清任务、范围、约束、期望产出。
- 原提示词已经清楚时，做轻度润色，而不是原样返回。
- 完整且简洁，**不得**以未完成的列表、悬空连词或冒号结尾。
- 不添加无关要求、无依据的事实或多余章节。

### 4.3 分析与改写原则（system 提示词）

- 先评估：主目标、歧义与缺口、指令清晰度、缺失的上下文。
- 再应用：写清具体指令、补必要上下文、设定显式参数与约束、规定输出结构、给相关示例、语气与复杂度匹配用途、删除冗余。
- 保持原目标，只做现实可加的改进。

### 4.4 明确禁止

- 不索要指南/教程（除非用户主动要）、不索要代码片段。
- 不引入用户未提及的具体技术栈。
- 不解释「怎么做（HOW）」，聚焦「做什么（WHAT）」。
- 不回答提问，而是把它扩写得更具体。

### 4.5 长度

提示词要求「**约 800 字符以内**」。这是模型侧软约束：代码**不做截断**，也不因超长报错。

---

## 5. 适用场景

- 用户说「帮我优化/增强/润色这个提示词」「把这句话改成能直接发给模型的提示词」。
- 把一句口语化需求（「给我的狗做个网站」）扩成可执行的任务描述。
- 将提示词交给另一个模型/另一个会话前，统一做一次清晰化。
- 批量为已有提示词库做统一风格的改写（逐条调用）。

**不适用**：

- 代替执行用户请求（本工具只改写提示词，不写代码、不解释代码）。
- 事实检索、翻译、摘要、改写文章正文（会被语言一致 + 只输出提示词两条规则带偏）。
- 需要多轮追问才能澄清的需求——本工具单轮、无对话状态。

---

## 6. 边界条件与已知差异

| 场景 | 行为 |
| --- | --- |
| 输入为空白 / 只有换行 | `empty_input`，不调用模型 |
| 模型返回空白或只有引号 | `llm_error` / `Enhanced result is empty` |
| 模型返回被引号包裹 | 剥掉首尾各**一个**引号字符（`"` `'` `“` `”` `‘` `’`）；`""abc""` → `"abc"` |
| 只有一侧带引号 | 只剥那一侧（如 `"abc` → `abc`）——与原应用行为一致 |
| 输入含 `$&`、`$'`、`` $` `` | **按字面量保留**。原应用把替换串当模式处理，会损坏原文；本插件改用函数式替换修正该问题 |
| 超时 | 默认 60s（`timeoutMs` 可配），返回 `llm_error` / `Request timed out …` |
| 调用被取消 | 返回 `llm_error` / `Request aborted` |
| 超长输入 | 不截断、不预校验；超出模型上下文时由 provider 报错 → `llm_error` |
| 超长输出 | 不截断（800 字符仅是提示词要求） |
| 并发 | 无共享状态，可并行调用 |
| 无可用模型 | `llm_unavailable`，不影响插件其余功能 |

**与 WorkBuddy 的差异（均不影响输入输出契约）**：

1. **指令文本原创**：规则一致、措辞自行撰写，因此模型的文风可能与原应用略有出入；这是为公开分发有意做的取舍（见 `THIRD_PARTY_NOTICES.md`）。
2. 按钮位置：WorkBuddy 在输入框右下角工具区；本插件挂在 `conversation.input.right`（提交按钮前），受宿主布局约束。
3. `model` 语义：WorkBuddy 传模型 id 给 sidecar；本插件传 `provider/model` 路由，省略时取默认模型。
4. `$&` 替换修正：原应用把用户原文当替换模式，本插件按字面量插入。

---

## 7. 配置

`cordis.patch.yml` 的 `config`（全部可选）：

```yaml
- insert:
    - id: dsh-prompt-enhance
      name: 'dsh-prompt-enhance'
      config:
        provider: ''      # 默认模型 provider；空则用当前默认模型
        model: ''         # 默认模型 id；空则用当前默认模型
        timeoutMs: 60000  # 单次补全墙钟上限（毫秒）
```

路由优先级：工具参数 `model` > 配置 `provider`+`model` > 当前默认模型。

---

## 8. 安装与自测

安装（三种等价方式）：

```powershell
dsh plugin --profile web add github:sun04222/dsh-prompt-enhance   # 从 GitHub 安装
# 或在 dsh-market / dsh-m 市场里搜「提示词增强」一键安装
# 或本地开发：把本目录作为 bundle 安装（plugin_manager 的 install_bundle，target 传绝对路径）
```

本地开发时安装后无需重启即可用；再次修改代码后需把该 bundle 关一次再开，才会重新载入新模组。

```powershell
node test/prompt.test.mjs                  # 纯函数单测（10 项，进程内运行）
node --check index.js; node --check prompt.js; node --check client.js
```

> 沙箱下 `node --test test/` 会因子进程管道 EPERM 失败，直接跑测试文件即可（`node:test` 在同进程执行）。

安装后确认工具已注册：查询 `Tool.listTools`，应出现 `enhance_prompt`，参数为 `text`（必填）与 `model`（可选）。

### 工程备注（维护者必读）

- **不 import `@deepseek-ai/dsh-tools`**：本地目录安装是软链到 profile，`defineTool` 这类宿主包在该路径下解析不到（`ERR_MODULE_NOT_FOUND`，插件激活失败）。因此 `index.js` 直接构造 `ToolDefinition`，`parameters` 写的就是 `defineTool` 归一化后的同一份原始 JSON Schema —— 模型看到的 schema 与用 `defineTool` 完全一致。
- **`output.schema` 用原始 JSON Schema 写法**（`required: ['success','text']`）；若改回 `defineTool`，同一处必须改成逐属性 `required: true` 的 author DSL 形式，否则编译报错。

---

## 9. 实测记录（本机验证，改写版指令）

| 输入 | 输出 |
| --- | --- |
| `这段代码有 bug，帮我看看` | 中文：`请定位这段代码中的 bug，说明其根本原因与触发条件，给出最小化的修复方案，并指出可用于验证修复的测试点或输入示例。如果存在多处问题，请按严重程度逐一列出。` |
| `fix the login error` | 英文：`Diagnose the login error: identify the error message or failure behavior, trace it to its likely root cause in the code, and provide a corrected fix…` |
| `write a weekly report, markdown, keep it short` | 英文，补出章节结构与篇幅约束，未回答请求本身 |
| `"   "` | `{ success:false, code:'empty_input' }`，无模型调用 |
| `model: no-such-provider/no-such-model` | `{ success:false, code:'llm_error', error:'no adapter registered for provider "no-such-provider"' }`，不崩溃 |

以上覆盖「同语言输出」「只产出提示词」「不做零增强」「空输入短路」「通道不可用降级」五条关键契约。

---

## 10. 功能契约的来源（取证说明）

功能契约是从本机安装的 WorkBuddy（闭源客户端）**观测**得到的，用于确认行为规格；本仓库**未分发**其中任何文本、代码或资源，指令文本已按规则重写（见 `THIRD_PARTY_NOTICES.md`）。复现取证的方法：

```powershell
# 1) 定位 WorkBuddy 安装目录
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\* |
  Where-Object DisplayName -like 'WorkBuddy*' | Select-Object DisplayName, UninstallString

# 2) 解包 app.asar（8 字节 pickle 头 + JSON 索引，数据区偏移 = 8 + headerPickleSize）
#    然后在 <extracted>/main/server.js 中检索：
#    llm:enhancePrompt / handleEnhancePrompt / stripWrappingQuotes / renderUserPrompt
#    渲染层：<app.asar.unpacked>/renderer/assets/*.js 检索 enhancePrompt、chatInput.enhance
```

---

## 11. 发布到市场

见 [PUBLISHING.md](PUBLISHING.md)：仓库需要准备哪些文件与配置、如何组织与设置、两条收录路径（社区目录 / 精选清单）的信息与步骤，以及可见性的验证方法。投稿素材在 `publish/` 下。
