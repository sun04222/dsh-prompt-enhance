# 发布与收录指南

目标：把本插件推到 GitHub，让它在 **社区目录**（awesome-dsh-plugin / dsh-m 社区区）和 **精选清单**（dsh-m 精选区）里都能被搜到、能一键安装。

两条收录路径彼此独立，**先做社区，再做精选**：

| | 社区目录 | 精选清单 |
| --- | --- | --- |
| 数据源 | `awesome-dsh-plugin/awesome-dsh-plugin` 的 `data/plugins/<owner>__<repo>.yml` | `iasiv5/dsh-m` 的 `registry.json` |
| 谁维护 | 社区 PR + CI 校验 + 维护者复核 | dsh-m 作者策展 |
| 生效方式 | 合并后 CI 重建站点与 npm 包 `dsh-plugin-catalog` | 合并后随 registry 生效 |
| 门槛 | 声明 `dsh.bundle`、仓库满 1 天、真实可用、加 `dsh-plugin` topic | 策展五桶之一 + 文案规范（≤60 全角当量）+ 作者判断 |

---

## 1. 需要准备的文件与配置

### 1.1 仓库必备（缺一不可）

| 文件 | 作用 | 本仓库状态 |
| --- | --- | --- |
| `package.json` 里的 `dsh.bundle.patch` | **是否可安装的唯一判据**；只声明 `dsh.client` 会被 CI 直接拒 | ✅ `./cordis.patch.yml` |
| `cordis.patch.yml` | 声明插入的插件行（`id` + `name`） | ✅ |
| 真正的功能代码 | 占位仓库 / 纯 README 仓库不收 | ✅ `index.js` `client.js` `prompt.js` |
| `README.md` | 安装方式与功能说明；市场从 README 抽取图片 | ✅ |
| `LICENSE` | 公开仓库的基本要求 | ✅ MIT |
| `CHANGELOG.md` | 发版纪律，便于维护者判断活跃度 | ✅ |
| `THIRD_PARTY_NOTICES.md` | 说明不包含任何第三方文本/代码 | ✅ |

### 1.2 `package.json` 的发布相关字段

```jsonc
{
  "name": "dsh-prompt-enhance",
  "version": "1.1.0",
  "description": "…一句话英文描述（npm 与市场卡片都可能读取）…",
  "author": "sun04222",
  "license": "MIT",
  "homepage": "https://github.com/sun04222/dsh-dsh-prompt-chance#readme",
  "repository": { "type": "git", "url": "git+https://github.com/sun04222/dsh-dsh-prompt-chance.git" },
  "bugs": { "url": "https://github.com/sun04222/dsh-dsh-prompt-chance/issues" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // 必须有
    "client": { "platform": "web", "immediately": true, "inject": ["…"] }   // 有前端 UI 才需要
  }
}
```

要点：

- **不要 `"private": true`** —— 会挡住 npm 发布（本仓库已移除）。
- `repository` 必须指回被收录的那个仓库：如果你之后发 npm，市场靠它把包和仓库关联起来，写错就不关联。
- 官方 `@deepseek-ai/*` 包用 `peerDependencies` 声明，不要放 `dependencies`；本插件不 import 任何宿主包，因此没有 peer 需要声明——省掉了预发布版本范围那类坑（`>=0.0.1-rc.1 <0.2.0` 这类范围会**静默排除**所有预发布构建，必须写成 `>=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.2.0-0`）。
- GitHub 源安装按 **release / tag** 跟踪，所以每次发版都要打 tag（见 §2.3）。

### 1.3 市场收录用的条目文件（放在**对方仓库**，不是本仓库）

社区目录一个插件一个 YAML，文件名为 `<owner>__<repo>.yml`。本仓库把成品放在 `publish/awesome-dsh-plugin.yml`，投稿时复制成：

```
data/plugins/sun04222__dsh-dsh-prompt-chance.yml
```

内容（`description.en` 必填，`zh` 可留给维护者补）：

```yaml
url: https://github.com/sun04222/dsh-dsh-prompt-chance
name: sun04222/dsh-dsh-prompt-chance
category: ui
description:
  en: '…一句话，句号结尾，只讲功能…'
  zh: '…中文同上…'
```

- `url` 必须与仓库**完全一致**；monorepo 子包才写 `/tree/...` 并把文件名改成 `owner__repo--path-to-pkg.yml`。
- `category` 取 23 个之一：`agi ui usage theme model identity session memory tools wsl browser vision voice docs skill workflow git notify dev security remote market fun`。本插件是输入框按钮 + 工具，取 `ui`。
- **不要在 yml 里手写 `npm:` 字段**：npm 映射由 registry 自动采集，手写会被校验拒。
- 描述里出现半角冒号加空格必须加引号，否则 YAML 解析失败。
- 描述必须**与代码逐条对得上**（这是被打回的头号原因）：写了几个按钮/工具、提到什么命令，代码里就得真有。

### 1.4 截图（可选但推荐）

在本仓库根部放 `screenshots.json`（monorepo 放在子包目录里）：

```jsonc
["assets/screenshot-1.png", "assets/screenshot-2.png"]
```

1–8 张；相对路径不得越出插件目录；绝对路径必须是 GitHub 托管的 https。不声明也行——市场会退回从 README 抽图。本仓库暂未附截图（见 §5 待办）。

---

## 2. 仓库如何组织与设置

### 2.1 组织方式

**一个插件一个仓库，插件根目录就是仓库根目录。** 不要在仓库里再套一层目录（那会变成 monorepo 形态，需要按子包规则投稿）。本仓库结构：

```
（仓库根）
├── package.json          # dsh.bundle + dsh.client 清单
├── cordis.patch.yml      # 安装时插入的插件行
├── index.js              # Host：enhance_prompt 工具 + POST /prompt-enhance 通道
├── client.js             # Web：输入框右侧「增强」按钮
├── prompt.js             # 指令文本与纯函数后处理
├── locale/{zh,en}.json   # 插件面板标题与描述
├── icon.svg
├── test/prompt.test.mjs
├── README.md  LICENSE  CHANGELOG.md  THIRD_PARTY_NOTICES.md  .gitignore
└── publish/              # 投稿素材（不参与安装）
    ├── awesome-dsh-plugin.yml        # 社区目录条目
    └── dsh-m-registry-entry.json     # 精选清单条目草稿
```

### 2.2 仓库设置清单

1. **公开仓库**（private 无法被市场和别人搜到）。
2. **Description**：与插件描述一致的一句话（会出现在 GitHub 搜索与市场卡片）。
3. **Topics**：至少加 **`dsh-plugin`**（CI 硬性检查），建议再加 `deepseek-harness`、`dsh`、`prompt-engineering`、`composer`。
4. **Homepage**：可填仓库 README；发 npm 后填 npm 页。
5. **Release / tag**：至少一个语义化 tag（如 `v1.1.0`），GitHub 源安装与升级按它跟踪。
6. **Issues 开启**（`bugs.url` 指向它）。
7. **分支保护/CI**（可选）：加一个只跑 `node --check` 与 `node test/prompt.test.mjs` 的 workflow，能显著提高维护者对你「活跃维护」的判断。

### 2.3 发布流程（本机无 git 时用 GitHub API）

本机没有安装 `git`，但 `gh` CLI 已登录（账号 `sun04222`，scope `repo`）。两种方式任选：

**方式 A：装 git 后常规推送（推荐长期使用）**

```powershell
winget install --id Git.Git -e
cd dsh-prompt-enhance
git init -b main
git add -A
git commit -m "feat: prompt enhance plugin (composer button + enhance_prompt tool)"
git remote add origin https://github.com/sun04222/dsh-dsh-prompt-chance.git
git push -u origin main
git tag v1.1.0 && git push origin v1.1.0
gh repo edit sun04222/dsh-dsh-prompt-chance --add-topic dsh-plugin --add-topic deepseek-harness --add-topic dsh
```

**方式 B：纯 API（无需 git）**

`gh` 已登录，用 REST API 建仓库、写 blob/tree/commit、更新 ref，再打 tag 与 release：

```powershell
gh repo create sun04222/dsh-dsh-prompt-chance --public `
  --description "Prompt enhancement for DeepSeek Harness: composer button + enhance_prompt tool" `
  --source . --remote origin    # 注意：--source/--push 仍需要 git，纯 API 请用 scripts/publish-github.mjs
node scripts/publish-github.mjs   # 见 §2.4，用 gh 的 token 走 REST API 上传全部文件
gh repo edit sun04222/dsh-dsh-prompt-chance --add-topic dsh-plugin --add-topic deepseek-harness
```

### 2.4 一键上传脚本

本仓库附 `scripts/publish-github.mjs`：读 `gh auth token`，把工作区文件经 GitHub Git Data API（blob → tree → commit → 更新 `refs/heads/main`）上传，并可创建 tag 与 release。用法：

```powershell
node scripts/publish-github.mjs --repo sun04222/dsh-dsh-prompt-chance --tag v1.1.0
```

---

## 3. 市场收录：信息与步骤

### 3.1 社区目录（awesome-dsh-plugin）——必须有

1. 确认仓库满足：`dsh.bundle` ✅、**仓库创建满 1 天**（CI 自动校验，刚建好的仓库会被拒，第二天再提即可）、有真实代码 ✅、已加 `dsh-plugin` topic、描述属实。
2. Fork `awesome-dsh-plugin/awesome-dsh-plugin`。
3. 新增**一个**文件 `data/plugins/sun04222__dsh-dsh-prompt-chance.yml`（内容见 §1.3，`publish/awesome-dsh-plugin.yml` 可直接复制）。
4. **不要手工编辑 README**（README 由脚本从 `data/plugins/*.yml` 生成；一个 PR 最多 3 条）。
5. 提 PR。CI 依次检查：条目数 → `dsh.bundle` → 仓库年龄 → awesome-lint 与站点构建。失败会指明改什么，同分支推送即可。
6. 合并后 CI 重建站点与 npm 包，条目出现在：
   - 站点页 `https://awesome-dsh-plugin.com/p/sun04222/dsh-dsh-prompt-chance/`
   - 目录 JSON `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog@latest/plugins.json`
   - 索引 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog@latest/index.json`
   - dsh-market / dsh-m 的社区区搜索结果

**npm 不是必须的**：不发 npm 也能收录，只是没有下载量数字。想要更好的安装体验（免构建授权）就发 npm；发的时候包的 `repository` 必须指回本仓库。

**可选：GitHub Release tarball。** 如果你的仓库无法从源码安装，必须提供；本插件零依赖、纯 ESM，源码安装即可，不必提供。若提供，资产名不要带版本号（`latest/download/` 只解析 latest，文件名按字面取，带版本会在下次发版后 404），或钉住 tag。

### 3.2 精选清单（dsh-m registry）——可选

精选区是 dsh-m 作者策展的五桶（装机必备 / 崔添翼精选 / iasi自研 / 腾讯轻量云专区 / 观察区）。第三方要进精选，走 `iasiv5/dsh-m` 的 PR 改 `registry.json`，文案受 `docs/registry-copy-guide.md` 约束：

- 全条 **≤60 全角当量**（全角=1，ASCII=0.5），描述一律中文，句式为〔定位一句〕＋〔1–2 个关键能力〕＋〔前置/兼容声明〕。
- tags ≤4 个，只放功能关键词，**不放**「需 xxx / 推荐 xxx」这类关系词（关系写在描述末句）。
- 无保鲜机制的精确数字不进文案；版本号只出现在兼容声明里。
- 兼容声明四种句式：`需 <对象> <版本>` / `可选集成 <对象>` / `已适配 <版本代际>，详见仓库` / `版本无关，详见仓库`。

本仓库的草稿见 `publish/dsh-m-registry-entry.json`，第三方条目通常进 `watchlist`（观察区）或由作者定桶。**注意**：精选是人工策展，不提交也不影响社区收录与搜索。

---

## 4. 如何验证可见性

按顺序验证，每步都有可执行的检查：

```powershell
# ① 可安装性（GitHub 源）——收录的硬门槛
dsh plugin --profile web add github:sun04222/dsh-dsh-prompt-chance

# ② 仓库元数据
gh repo view sun04222/dsh-dsh-prompt-chance --json name,description,repositoryTopics,isPrivate,createdAt

# ③ 目录 JSON 是否已含本条目（合并后通常数分钟内，CDN 可能滞后数小时）
$json = (Invoke-WebRequest "https://cdn.jsdelivr.net/npm/dsh-plugin-catalog@latest/plugins.json" -UseBasicParsing).Content | ConvertFrom-Json
$json.plugins | Where-Object { $_.url -like "*dsh-dsh-prompt-chance*" } | Format-List name,owner,category,version,install,added

# ④ 站点页（存在即收录成功）
Invoke-WebRequest "https://awesome-dsh-plugin.com/p/sun04222/dsh-dsh-prompt-chance/" -UseBasicParsing | Select-Object StatusCode

# ⑤ 在 DSH 内搜索（最接近用户体验的验证）
#    在会话里让我搜：dshm_search query="提示词增强"
#    命中会出现本插件卡片，卡片上应标出「市场安装」与来源
```

补充说明：

- **CDN 缓存**：jsDelivr 对 `@latest` 有缓存窗口，刚合并看不到属正常；用 `https://purge.jsdelivr.net/npm/dsh-plugin-catalog@latest/plugins.json` 可手动清缓存，或直接看未加 CDN 的 `registry.npmjs.org` 版本号是否已递增。
- **dsh-m 侧缓存**：社区目录默认缓存 60 分钟（可在 dsh-m 设置里改 `cacheTtlMin`），刚合并后可能需要等一轮或清缓存再搜。
- **精选区显示**：只有进了 `registry.json` 才会出现在精选区；社区区命中不会因为没进精选而消失。
- **不是安全审查**：收录 ≠ 审查，README 顶部有明确警告——这也意味着通过 CI 不等于有人替你验过代码。

---

## 5. 当前状态与剩余步骤

### 已完成（2026-10-23 05:48 +08:00 本机时间）

| 项 | 状态 |
| --- | --- |
| GitHub 仓库 | ✅ 公开：`https://github.com/sun04222/dsh-dsh-prompt-chance` |
| 文件 | ✅ 18 个文件已上传，与本地**逐字节一致**（仓库根 = 插件根） |
| 仓库描述 | ✅ `Prompt enhancement for DeepSeek Harness: composer button + enhance_prompt tool` |
| Topics | ✅ `dsh-plugin`（CI 硬性要求）、`deepseek-harness`、`dsh`、`prompt-engineering`、`composer` |
| Tag / Release | ✅ `v1.1.0`（GitHub 源安装与升级按 tag 跟踪） |
| GitHub 搜索 | ✅ 已可搜到：按仓库名与 `topic:dsh-plugin` 各命中 1 条 |
| 社区目录条目 | ✅ 已备好 `publish/awesome-dsh-plugin.yml`（YAML 已校验：category 合法、无 `npm` 键、描述以句号结尾） |
| 精选条目草稿 | ✅ 已备好 `publish/dsh-m-registry-entry.json` |

### 剩余步骤

1. **提社区目录 PR（当前被仓库年龄卡住）**
   仓库创建于 `2026-10-22T21:48:07Z`，CI 要求仓库满 1 天，因此**最早可提交时间 = 2026-10-23T21:48:07Z ＝ 北京时间 2026-10-24 05:48**。在此之前提交会因年龄不达标被 CI 拒（不是质量问题，第二天补提即可）。

   提交方式：fork `awesome-dsh-plugin/awesome-dsh-plugin` → 新增 `data/plugins/sun04222__dsh-dsh-prompt-chance.yml`（内容复制 `publish/awesome-dsh-plugin.yml`）→ 提 PR。**一个 PR 最多 3 条、不要手工改 README。**

2. **（可选）截图**：`screenshots.json` + 1–8 张 `assets/*.png`，让市场详情页有 App Store 式截图。
3. **（可选）发 npm**：让市场显示下载量；发的时候包的 `repository` 必须指回本仓库。
4. **（可选）提精选清单 PR**：把 `publish/dsh-m-registry-entry.json` 并进 `iasiv5/dsh-m` 的 `registry.json`（人工策展，选桶与文案由维护者定）。

### 一个待你确认的点

仓库名 `dsh-dsh-prompt-chance` 里的 `chance` 疑似 `enhance` 笔误。**现在改名成本最低**：仓库改名后收录文件名（`sun04222__<repo>.yml`）、`package.json` 的 `homepage`/`repository`/`bugs`、README 安装命令都要同步改。一旦收录进市场再改名，URL 会 404，得再提一次 PR 修条目。