# CC GUI Model Switcher

本项目是针对 [cc-gui（desktop-cc-gui）](https://github.com/zhukunpenglinyutong/desktop-cc-gui) 开发的扩展插件，需要在 cc-gui 宿主中安装使用。插件提供模型与 CLI 选择、供应商渠道切换、独立渠道管理、全局主题、会话模型显示，以及可选的 Claude Agent SDK 提示词清洗。

宿主项目地址：https://github.com/zhukunpenglinyutong/desktop-cc-gui

插件使用宿主发现的 CLI 和供应商配置，不内置个人供应商 ID、API Key 或本机路径。面向 Windows、macOS、Linux，使用同一份构建产物，安装时无需修改宿主源代码。

> **供应商切换：** 插件切换渠道时，新版宿主使用 `set_current_provider` 命令，旧版宿主使用 `onChannelChange` 回调；等待宿主确认后再应用模型。创建、编辑和删除独立渠道会同步宿主供应商列表。独立渠道支持 Claude / Codex / Kimi / Grok / OMP / PI。DSH、AGY、OpenCode、Qoder 等使用自身账号或服务配置，插件会明确提示暂不支持独立渠道。系统渠道详情只读。OMP / PI 的独立渠道还会写入 `models.yml` / `models.json`，并需指定 `api` 协议。Claude CLI 的所有渠道（系统渠道、原生配置、独立渠道）会自动注入 `attribution` 元数据和 `ENABLE_TOOL_SEARCH` 环境变量，确保工具搜索功能和提交归属信息的一致性。

## 目录

- [功能](#功能)
- [环境要求](#环境要求)
- [安装与更新](#安装与更新)
- [权限与数据](#权限与数据)
- [提示词清洗说明](#提示词清洗说明)
- [常见问题](#常见问题)
- [开发与验证](#开发与验证)
- [项目结构](#项目结构)

## 功能

### CLI、模型与会话

从聊天输入框的模型按钮打开”模型与渠道”弹窗。

- 识别宿主提供的 11 种 CLI：Claude Code、Codex CLI、Kimi CLI、Grok CLI、PI CLI、OMP CLI、DeepSeek Harness、Antigravity CLI、OpenCode、Qoder CLI、Qoder CLI CN；实际可用项取决于宿主及本机安装状态。
- CLI 引擎列表支持鼠标滚轮水平滚动，方便快速浏览和选择已安装的 CLI。
- 根据当前会话展示 CLI、模型、推理强度和 1M 上下文标记，状态栏同步显示当前会话信息。新开会话首次对话（sessionId 为空）默认不预选任何模型，保持未选择状态，由用户自主决定。
- 尚未发送消息的新会话可以选择其他已安装的 CLI，选择模型后应用到该会话；已有会话或首条消息发送中禁止切换 CLI 类型，未安装的 CLI 不可选。
- 按当前渠道的 API Key 拉取模型，在可搜索下拉框中选择后点击”加入自选”，模型才计入下方自选列表；也支持手动添加模型 ID，不展示 `default` 占位模型。
- 自选列表按 CLI 和渠道保存，保留原有手动模型；加入或移出自选不切换当前使用的模型，点击自选模型行才应用选择。刷新候选列表不会清空自选。
- CLI 原生配置有 Base URL 时走供应商模型接口获取列表，没有 URL 才回退 CLI 内置目录。
- 插件激活和输入框挂载时预热 CLI 探测与供应商配置；打开弹窗先展示 CLI 列表（命中缓存则立刻可用，后台自动 SWR 静默探活以感知外部 CLI 升级或新安装）；切换渠道、选择模型与调节推理强度全面接入 0ms 即时乐观更新，去除全屏阻断性遮罩与失焦顿挫，改用顶部非阻塞流光微动效。
- 弹窗内置”刷新”按钮，一键强制穿透缓存，同时重新探测所有 CLI 安装可用状态与拉取最新原生/供应商模型。
- 渠道切换等待宿主确认后再应用模型和保存；宿主未确认时提示失败。切换过程中保留弹窗，避免模型列表保存覆盖渠道状态。
- 支持推理强度；所有 CLI 都可用 1M 开关，开启后给当前模型加上 `[1m]` 后缀。双向联动会话实际用量窗口（≥ 1M）与上下文缓存，保持开关与用量面板状态严格同步。
- 按宿主权威目录和模型协议元数据校验兼容性。模型名称、品牌或普通 `/models` 列表不能证明协议；缺少证据时允许自定义别名，实际调用是否成功由 CLI 和服务端决定。

模型选择会同步宿主会话状态和应用默认模型设置。已有其他会话的显式模型覆盖保持独立，没有显式覆盖的会话可能跟随应用默认值。

### 供应商与独立渠道

| 渠道来源或操作 | 当前行为 |
| --- | --- |
| 系统渠道 | 显示并可选中宿主已配置的供应商；详情只读，不可编辑或保存；API Key 默认掩码，可点眼睛查看明文；选中后同步宿主当前供应商 |
| CLI 原生配置 | 显示原生配置入口（DSH 为宿主服务配置）；详情只读，从宿主提供的 CLI 原生文件读取 Base URL、API Key 和模型，Key 默认掩码，可点眼睛查看；选中后按原生账号或配置发送 |
| 独立渠道 | 在插件中创建、编辑、保存名称、Base URL、API Key 和可选默认模型；同步到宿主供应商列表（ID 前缀 `plugin_model-switcher_`）；Key 同样默认掩码、可点眼睛查看。omp / pi 还需选择协议类型，并写入 `models.yml` / `models.json` |
| 切换渠道 | 同步宿主当前会话渠道；新版宿主在发送时将 Claude / Codex / Kimi / Grok 的渠道配置应用到本次 CLI 进程；OMP / PI 使用完整的供应商/模型 ID |
| 删除独立渠道 | 删除插件记录，并从宿主供应商列表移除；OMP / PI 同时从模型配置移除该供应商；若删的是当前项，切回可用的系统渠道或原生配置 |

CLI 配置如何应用取决于宿主版本：早期宿主可能改写原生文件，新版宿主在发送时注入渠道配置。Claude 的原生 settings 覆盖问题、Kimi 的环境变量及原生模型别名覆盖问题，需要宿主包含对应修复；仅更新插件无法修正旧宿主启动的 CLI 请求。OMP / PI 独立渠道仍会改写模型配置文件。暂不支持独立渠道的 CLI 可选择原生配置，并删除旧版保存的独立渠道。用户主动执行的提示词清洗另见下文。

### 全局主题与自由选色

点击弹窗右上角的调色盘图标进入“全局主题”。主题切换即时动态注入与清理样式，无需刷新整个应用窗口，不中断当前正在进行的流式对话或输入草稿。

- 内置 12 个主题选项：原生极简、深空雅致、赛博霓虹、北欧极夜、落樱浅绛、翡翠森林、石墨、潮汐、钴蓝、梅影、青柠终端、朱砂。
- 调色盘仅保留一个原生自由选色器，自动生成浅色、深色配色。为保证白色按钮文字可读，过亮的选色会在实际强调色中适当压暗。
- 主题跟随宿主浅色/深色模式，覆盖侧栏、聊天、表单、菜单和弹窗。
- 支持全局聚焦光晕、细滚动条和字体平滑开关。
- 旧版多色配置沿用已保存的浅色强调色，旧网格和斜纹背景按纯色处理。

### 应用背景

在主题设置的“应用背景”中选择纯色或图片/GIF。

- 图片背景覆盖整个应用的主要面板和侧栏。
- 支持本地 PNG、JPEG、WebP 和 GIF，单文件不超过 4 MB，解码尺寸不超过 4000 万像素。
- 支持铺满、完整显示和 0%–100% 阅读遮罩。
- 保留原始图片字节及 GIF/WebP 动画，媒体单独保存，重载后可继续使用。
- 可更换、移除图片，或暂时切回纯色而保留已导入图片。
- 系统启用“减少动态效果”时，GIF/WebP 应用背景会停用；输入框、状态色和代码区域保留各自的可读底色。


## 环境要求

| 项目 | 要求 |
| --- | --- |
| 宿主 | CC GUI，清单声明最低版本 `1.0.5`，插件 SDK 范围 `^0.3.11` |
| 平台 | Windows、macOS、Linux 桌面版；Web 模式不具备桌面执行桥能力 |
| Node.js | 提示词清洗需要宿主能从 PATH 找到 `node`，并授予 `exec:node` 权限 |
| 本地开发 | 推荐 Node.js 22、pnpm 10，与仓库 CI 配置一致 |

模型/会话同步依赖宿主内部 IPC、持久化结构及 React 组件回调；主题依赖宿主 DOM 结构。SDK 版本匹配不代表所有内部接口始终兼容，宿主升级后需要回归验证。

### 远程访问

在宿主提供的远程访问网页中，插件使用同源认证 WebSocket 读取宿主的 CLI、供应商配置和模型目录。模型接口请求也由宿主执行，因此渠道地址里的 `localhost` 指宿主电脑。模型 ID、渠道和推理强度跟随网页中当前打开的会话，支持窄屏布局。

部分宿主版本只开放插件存储读取，未开放写入；此时自选和主题等插件偏好保存在当前浏览器，继承宿主已有配置，但不回写桌面插件存储。网络错误仍会报告失败。

未开放 OMP/PI 配置管理的宿主版本仍可读取原生模型目录、选择已注册且未改动的渠道和模型；新增或修改其配置需要在桌面端完成。提示词清洗也仅在桌面端提供。

## 安装与更新

### 使用预构建版本（推荐）

1. 访问 [Releases](https://github.com/Guardian-J/ccgui-plugin-model-switcher/releases/latest) 下载最新的 `dist.zip`
2. 解压到本地目录
3. 在 CC GUI 插件管理中选择”从本地目录安装”，选择解压后的目录
4. 按宿主流程授予所需权限并启用插件

更新时下载新版 `dist.zip`，解压后重新安装或替换原目录，然后重载插件。

### 从源码构建

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm check:compatibility
pnpm build
```

1. 在 CC GUI 插件管理中选择”从本地目录安装”。
2. 选择当前仓库的 `dist` 目录，按宿主流程授予所需权限并启用插件。
3. 更新时重新构建并更新整个 `dist` 目录，然后重载插件。

不要仅替换 `main.js`：`manifest.json` 中的权限声明也需要一起更新。

构建会生成 `dist/main.js`、`dist/manifest.json` 等安装产物，并同步仓库根目录的 `main.js`。源码修改或本地构建不会自动安装到个人配置目录，也不会修改宿主源代码。

Git 仓库保留源码、兼容性验证脚本和依赖锁文件；`.gitignore` 排除依赖目录、构建产物、本地环境配置、日志及本地预览目录。从 Git 克隆项目后，需要先执行上述构建命令，再安装生成的 `dist` 目录。

## 权限与数据

实际授权以 [manifest.json](manifest.json) 为准。

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存独立渠道、模型记录、主题设置和背景媒体 |
| `ui:composer`、`ui:status-bar` | 模型弹窗入口与状态显示 |
| `theme` | 注入主题和时间线样式 |
| `exec:node` | 执行内嵌提示词清洗脚本 |
| `network:<host>` | 插件 HTTP 模型查询的域名与端口授权 |

清单还声明了 `ui:settings-section`、`ui:command`、`i18n` 和 `events`；这不代表当前版本一定提供对应的独立界面或命令。

插件数据由宿主插件存储管理：`state` 保存渠道和模型记录，`theme_config` 保存主题选项，`theme_background` 单独保存背景图片。独立渠道 API Key 随插件记录保存，插件未额外提供加密层，分享配置或诊断信息前应移除密钥。

模型拉取优先使用宿主查询接口，再尝试插件 HTTP 桥或浏览器请求。插件 HTTP 桥受清单域名授权约束，浏览器请求受跨域策略等限制。背景图片通过本地文件导入，不请求远程图片地址。

## 提示词清洗说明

这是默认关闭的可选本地文件操作，位于 Claude Code 的“提示词清洗”区域。打开弹窗不会检测或修改文件；只有用户主动点击“检测”“清洗”或“恢复”才执行对应操作。

清洗匹配以下 SDK 身份特征句：

```text
You are a Claude agent, built on Anthropic's Claude Agent SDK.
You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.
```

替换为：

```text
You are Claude Code, Anthropic's official CLI for Claude.
```

较短的替换内容以尾部空格保持原字节长度，写入后回读验证；检测和恢复优先匹配较长规则。旧特征已替换但新版原句仍存在时，不会报告全部清洗成功。

- 优先使用宿主设置的 `claudeBin`，否则解析 Node 进程继承的 PATH；支持可识别的 npm 启动器和原生可执行文件。
- 仅针对解析出的安装目标，不批量修改其他安装，不自动修改历史会话或宿主启动参数。
- 能否清洗取决于 CLI 版本、安装形式及文件权限；无法识别目标、文件占用或回读不符会报告失败。
- “本地特征已替换”表示磁盘检测结果，不保证旧会话或正在运行的进程已经使用新内容。
- 部分 CLI 会重放旧会话的系统提示词快照，建议在新会话验证；自行启动且版本支持时，可使用 `--system-prompt-snapshot off` 重新生成提示词。
- CLI 更新可能恢复原特征，更新后应重新检测。插件不修改任意中转站规则，也不保证所有中转站兼容。

部分中转站可能用 HTTP 429 表示自定义拦截，应结合响应正文和服务端规则判断。仓库已有本地模拟服务验证快照对请求的影响，但这不等同于对实际中转站的验证。

## 常见问题

| 问题 | 检查方式 |
| --- | --- |
| 切换渠道后 CLI 配置被改写 | 预期行为：插件切换/创建/删除渠道会同步宿主并改写 Claude / Codex / Kimi / Grok 的 CLI 原生文件 |
| 模型列表为空 | 检查当前实际渠道、Base URL、API Key 和模型接口响应；原生渠道无 URL 时才回退 CLI 内置目录，必要时重新拉取 |
| 已清洗仍出现 429 | 检查本地检测结果、旧进程和会话快照，并结合中转站响应判断；用新会话验证 |

## 开发与验证

### 本地预览

`preview/` 是本地开发目录，已由 `.gitignore` 排除，不随仓库提交。以下页面和浏览器检查脚本需要本地已有对应预览文件；仅克隆仓库并运行命令不会自动生成这些文件。

```sh
pnpm preview:ui
```

访问终端显示的本地地址，默认端口可用时为 `http://127.0.0.1:5173`。

| 页面 | 内容 | 主要验证脚本 |
| --- | --- | --- |
| `/preview/` | 模型与渠道弹窗 | `check-layout.js`、`check-selection.js`、`check-provider-protection.js`、`check-scrub.js` |
| `/preview/?sessions` | 会话状态显示 | `check-sessions.js` |
| `/preview/theme.html` | 全局主题 | `check-theme.js`、`check-theme-controls.js`、`check-custom-theme.js`、`check-tool-theme.js` |

上述脚本位于本地 `preview/`。预览使用模拟宿主接口，不能替代真实宿主集成验证。

仓库中的 `/scripts/check-remote-host.html` 可直接在 Vite 预览服务器中运行，覆盖无 Tauri 接口的远程读取、文本及二进制消息、断线重连、会话定位、浏览器保存回退和窄屏弹窗；使用模拟通道和假凭据，不连接真实宿主。

`/scripts/check-channel-switch.html` 验证渠道确认、重复点击、失败重试和保存顺序；加上 `?engine=dsh`（或 `agy`、`opencode`、`qoder`、`qoder-cn`）验证不支持的渠道被禁用、原生入口可选及最后一个旧渠道可删除。

安装 `agent-browser` 并准备浏览器后，可执行：

```sh
agent-browser --session model-switcher-ui open http://127.0.0.1:5173/preview/
agent-browser --session model-switcher-ui eval --stdin < preview/check-provider-protection.js
```

PowerShell 使用 UTF-8 管道：

```powershell
agent-browser --session model-switcher-ui open http://127.0.0.1:5173/preview/
$OutputEncoding = [System.Text.UTF8Encoding]::new()
Get-Content -Encoding utf8 -Raw preview/check-provider-protection.js | agent-browser --session model-switcher-ui eval --stdin
```

切换验证场景时打开对应页面，必要时刷新以恢复初始状态。没有本地预览文件时，可构建并将 `dist` 安装到 cc-gui，重载插件进行界面验证。

### 构建与兼容性检查

| 命令 | 用途 |
| --- | --- |
| `pnpm typecheck` | 检查 `src` 中的 TypeScript 类型 |
| `pnpm check:compatibility` | 验证渠道切换、模型协议、会话隔离、主题迁移和清洗逻辑 |
| `pnpm build` | 生成完整插件安装目录 |
| `pnpm dev` | 监听源码变化并重新构建，不启动 UI 预览服务器 |
| `pnpm preview:ui` | 启动 UI 预览服务器，页面需本地 `preview/` 文件 |

[兼容性 CI](.github/workflows/compatibility.yml) 在 Windows、macOS、Ubuntu 上配置依赖安装、类型检查、兼容性测试和构建。模拟测试使用临时数据，不读取或修改真实 CLI 配置；CI 矩阵不等同于三平台真实 GUI 与 CLI 集成验证。

已安装支持 `--system-prompt-snapshot` 的独立 Claude Code 可执行文件时，可额外运行：

```sh
node scripts/probe-scrub-request.cjs "CLI可执行文件路径"
```

该检查使用临时 CLI 副本、临时配置、假凭据和本机 HTTP 模拟服务，比对清洗及快照恢复前后的请求特征。不连接真实中转站，不修改已安装的 CLI，不进入默认 CI；依赖旁边包文件的 JS 入口不适用于副本探测。

## 项目结构

```text
manifest.json                             插件清单与权限
src/index.tsx                             插件激活、界面注册与卸载
src/components/CliModelFlyoutMenu.tsx      模型与渠道弹窗
src/components/ThemeSettingsPanel.tsx     主题设置
src/components/ThemeCustomizationPanel.tsx 自由选色与背景导入
src/system-bridge.ts                      宿主渠道读取与切换
src/selection-policy.ts                   会话与模型兼容性校验
src/session-display.ts                    当前会话显示适配
src/sync-host.ts                          模型与推理强度同步
src/theme-manager.ts                      主题生成、持久化与样式生命周期
src/theme-palette.ts                      内置主题与颜色变量
src/theme-customization.ts                自由选色
scripts/scrub-core.cjs                    提示词清洗核心
scripts/check-compatibility.mjs           模拟兼容性回归
preview/                                 本地预览页面与浏览器检查脚本（Git 忽略）
.github/workflows/compatibility.yml       跨平台 CI
dist/                                    构建生成的插件安装目录
```
