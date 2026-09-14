# CC GUI Model Switcher

本项目是针对 [cc-gui（desktop-cc-gui）](https://github.com/zhukunpenglinyutong/desktop-cc-gui) 开发的扩展插件，需要在 cc-gui 宿主中安装使用。插件提供模型与 CLI 选择、供应商渠道切换、独立渠道管理、全局主题、会话模型显示、文件模糊搜索、幕布链接跳转，以及可选的 Claude Agent SDK 提示词清洗。

宿主项目地址：https://github.com/zhukunpenglinyutong/desktop-cc-gui

插件使用宿主发现的 CLI 和供应商配置，不内置个人供应商 ID、API Key 或本机路径。面向 Windows、macOS、Linux，使用同一份构建产物，安装时无需修改宿主源代码。

> **供应商切换：** 插件内选择系统渠道或独立渠道会同步宿主当前供应商（`set_current_provider`）；创建或编辑独立渠道会写入宿主供应商列表（`upsert_provider`）；删除独立渠道会调用 `delete_provider`。对 Claude / Codex / Kimi / Grok，这会改写 CLI 原生配置文件（`settings.json` / `config.toml` / `auth.json`），与宿主设置页渠道切换相同。Codex 独立渠道会写入 `settingsConfig`（`requires_openai_auth` + `auth.json` 的 `OPENAI_API_KEY`），不能只写扁平字段，否则 CLI 会按 `env_key` 去找环境变量并报 `Missing environment variable: OPENAI_API_KEY`。系统渠道详情只读，不在插件内编辑或删除。omp / pi 的独立渠道还会写入 `models.yml` / `models.json`，并必须指定协议类型（`api`：`openai-completions` / `openai-responses` / `anthropic-messages` / `google-generative-ai`），否则 CLI 会报错。dsh 的供应商在宿主侧多为仅展示。

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

从聊天输入框的模型按钮打开“模型与渠道”弹窗。

- 识别宿主提供的 Claude Code、Codex CLI、Kimi CLI、Grok CLI、PI CLI、OMP CLI 和 DeepSeek Harness；实际可用项取决于宿主及本机安装状态。
- 根据当前会话展示 CLI、模型、推理强度和 1M 上下文标记，状态栏同步显示当前会话信息。
- 尚未发送消息的新会话可以选择其他已安装的 CLI，选择模型后应用到该会话；已有会话或首条消息发送中禁止切换 CLI 类型，未安装的 CLI 不可选。
- 按当前渠道接口拉取模型、搜索模型及保存自定义模型 ID，不展示 `default` 占位模型。
- CLI 原生配置有 Base URL 时走供应商模型接口获取列表，没有 URL 才回退 CLI 内置目录。
- 插件激活和输入框挂载时预热 CLI 探测与供应商配置；打开弹窗先展示 CLI 列表（命中缓存则立刻可用，后台自动 SWR 静默探活以感知外部 CLI 升级或新安装）；模型加载使用局部动效；切换渠道时使用全局遮罩。
- 弹窗内置“刷新”按钮，一键强制穿透缓存，同时重新探测所有 CLI 安装可用状态与拉取最新原生/供应商模型。
- 支持推理强度；1M 开关仅用于 Claude 的 `[1m]` 选择语法。OMP/PI 等引擎保留原始模型 ID，上下文容量由 CLI 原生配置和模型能力决定，不会通过后缀强制扩大容量。
- 按宿主权威目录和模型协议元数据校验兼容性。模型名称、品牌或普通 `/models` 列表不能证明协议；缺少证据时允许自定义别名，实际调用是否成功由 CLI 和服务端决定。

模型选择会同步宿主会话状态和应用默认模型设置。已有其他会话的显式模型覆盖保持独立，没有显式覆盖的会话可能跟随应用默认值。

### 供应商与独立渠道

| 渠道来源或操作 | 当前行为 |
| --- | --- |
| 系统渠道 | 显示并可选中宿主已配置的供应商；详情只读，不可编辑或保存；API Key 默认掩码，可点眼睛查看明文；选中后同步宿主当前供应商 |
| CLI 原生配置 | 为适用的 CLI 显示原生配置入口；详情只读，从 CLI 原生文件读取 Base URL、API Key 和模型，Key 默认掩码，可点眼睛查看；模型列表优先按 Base URL 接口获取；选中后恢复官方配置备份 |
| 独立渠道 | 在插件中创建、编辑、保存名称、Base URL、API Key 和可选默认模型；同步到宿主供应商列表（ID 前缀 `plugin_model-switcher_`）；Key 同样默认掩码、可点眼睛查看。omp / pi 还需选择协议类型，并写入 `models.yml` / `models.json` |
| 切换渠道 | 同步宿主当前启用渠道；Claude / Codex / Kimi / Grok 会写入 CLI 原生配置，随后对话使用该渠道；omp / pi 独立渠道写入对应 models 配置 |
| 删除独立渠道 | 删除插件记录，并从宿主供应商列表移除；omp / pi 同时从 `models.yml` / `models.json` 去掉该供应商；若删的是当前项，再切回上次系统渠道或官方配置备份 |

插件内切换、创建或删除渠道会改写 Claude / Codex / Kimi / Grok 的 `settings.json` / `config.toml` / `auth.json`，与宿主设置页渠道切换相同。omp / pi 独立渠道会改写 `models.yml` / `models.json` 并写入 `api` 协议。dsh 的供应商在宿主侧多为仅展示。写入失败会提示错误，不会假装已生效。用户主动执行的提示词清洗另见下文。

### 全局主题与自由选色

点击弹窗右上角的调色盘图标进入“全局主题”。

- 内置 12 个主题选项：原生极简、深空毛玻璃、赛博霓虹、北欧极夜、落樱浅绛、翡翠森林、石墨、潮汐、钴蓝、梅影、青柠终端、朱砂。
- 调色盘仅保留一个原生自由选色器，自动生成浅色、深色配色。为保证白色按钮文字可读，过亮的选色会在实际强调色中适当压暗。
- 主题跟随宿主浅色/深色模式，覆盖侧栏、聊天、表单、菜单和弹窗。
- 支持毛玻璃、全局聚焦光晕、细滚动条、代码块精修和字体平滑开关。
- 旧版多色配置沿用已保存的浅色强调色，旧网格和斜纹背景按纯色处理。

### 幕布与时间线玻璃效果

启用“毛玻璃”和“时间线精修”后，过程摘要、工具步骤、思考内容、参数/结果面板及消息导航预览使用统一的玻璃样式。

- 半透明底色、柔和模糊、细高光边缘和主题色连接线。
- 收起后的过程摘要仍有样式，展开后新挂载的工具步骤继续生效。
- 命令使用等宽字体，长命令和路径自动换行，参数/结果保持一致的视觉层次。
- 保留宿主的展开收起、虚拟列表定位、错误状态颜色和原始命令文字。
- “幕布渲染”独立控制遮罩，浓度范围为 20%–80%，模糊范围为 0–16 px。
- 支持键盘焦点、减少动效及减少透明效果的系统设置；不支持背景模糊的环境使用实色回退。

### 应用背景

在主题设置的“应用背景”中选择纯色或图片/GIF。

- 图片背景覆盖整个应用的主要面板和侧栏；启用毛玻璃时，弹窗通过半透明模糊呈现背景。
- 支持本地 PNG、JPEG、WebP 和 GIF，单文件不超过 4 MB，解码尺寸不超过 4000 万像素。
- 支持铺满、完整显示和 0%–100% 阅读遮罩。
- 保留原始图片字节及 GIF/WebP 动画，媒体单独保存，重载后可继续使用。
- 可更换、移除图片，或暂时切回纯色而保留已导入图片。
- 系统启用“减少动态效果”时，GIF/WebP 应用背景会停用；输入框、状态色和代码区域保留各自的可读底色。

### 文件模糊搜索

右侧面板在“文件”旁增加“搜索”页签。

- 按当前工作区的文件名和相对路径模糊匹配，支持不连续字符、中文和大小写不敏感搜索。
- 高亮匹配字符，每次最多显示 100 个结果；方向键选择，回车打开，Esc 清空搜索。
- 结果通过宿主文件编辑器打开。切换工作区后重置搜索和索引，避免旧结果串入新工作区。
- 按需建立索引，支持手动刷新；新增、删除或重命名文件后可刷新索引获取最新结果。
- 默认跳过 `node_modules`、`dist`、`build`、`target`、`.next`、`.cache`、`__pycache__`、`.venv`、`vendor`，可勾选“包含依赖与构建目录”。始终跳过 `.git` 和符号链接/目录联接。
- 扫描仅读取目录和文件名，不做文件内容全文搜索，也不上传索引。

索引有文件数、目录数、时间及传输大小限制，最多收录 20,000 个文件，实际可能更少。达到上限或目录无法读取时会提示；当前过滤使用上述目录规则，不解析项目的 `.gitignore`。

### HTTP/HTTPS 链接跳转

- 识别 Markdown 正文及行内代码中的 HTTP/HTTPS 网址，支持本地地址、端口、查询参数和中文标点边界。
- 鼠标点击、中键或键盘回车可打开系统默认浏览器；Web 客户端使用新标签页。
- 连续点击期间避免重复启动，打开失败会显示提示。
- 文件链接仍交由宿主处理，不作为网页打开；代码块不会自动转换为链接。
- 仅接受有效 HTTP/HTTPS 网址，不接受带用户名/密码的地址。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| 宿主 | CC GUI，清单声明最低版本 `1.0.0`，插件 SDK 范围 `^0.3.1` |
| 平台 | Windows、macOS、Linux 桌面版；Web 模式不具备桌面执行桥能力 |
| Node.js | 文件索引、桌面浏览器跳转、提示词清洗需要宿主能从 PATH 找到 `node`，并授予 `exec:node` 权限 |
| 浏览器跳转 | Windows 使用 PowerShell，macOS 使用 `open`，Linux 使用 `xdg-open`；需配置默认浏览器 |
| 本地开发 | 推荐 Node.js 22、pnpm 10，与仓库 CI 配置一致 |

模型/会话同步和文件打开依赖宿主内部 IPC、持久化结构及 React 组件回调；主题依赖宿主 DOM 结构。SDK 版本匹配不代表所有内部接口始终兼容，宿主升级后需要回归验证。

## 安装与更新

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm check:compatibility
pnpm build
```

1. 在 CC GUI 插件管理中选择“从本地目录安装”。
2. 选择当前仓库的 `dist` 目录，按宿主流程授予所需权限并启用插件。
3. 更新时重新构建并更新整个 `dist` 目录，然后重载插件。

不要仅替换 `main.js`：`manifest.json` 中的权限声明也需要一起更新，尤其是文件搜索和链接增强使用的 `ui:panel-tab`、`ui:markdown`。

构建会生成 `dist/main.js`、`dist/manifest.json` 等安装产物，并同步仓库根目录的 `main.js`。源码修改或本地构建不会自动安装到个人配置目录，也不会修改宿主源代码。

Git 仓库保留源码、兼容性验证脚本和依赖锁文件；`.gitignore` 排除依赖目录、构建产物、本地环境配置、日志及本地预览目录。从 Git 克隆项目后，需要先执行上述构建命令，再安装生成的 `dist` 目录。

## 权限与数据

实际授权以 [manifest.json](manifest.json) 为准。

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存独立渠道、模型记录、主题设置和背景媒体 |
| `ui:composer`、`ui:status-bar` | 模型弹窗入口与状态显示 |
| `ui:panel-tab` | 文件搜索页签 |
| `ui:markdown` | 网址识别和链接增强 |
| `theme` | 注入主题、背景、幕布和时间线样式 |
| `exec:node` | 执行内嵌文件索引、浏览器启动及提示词清洗脚本 |
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
| 时间线没有玻璃效果 | 更新完整插件并重载，开启“毛玻璃”和“时间线精修”；同时检查系统减少透明效果设置及宿主版本兼容性 |
| 幕布模糊不明显 | 开启“幕布渲染”，调整浓度和模糊值；实色背景下玻璃效果较弱 |
| 背景导入失败 | 检查格式、4 MB 大小限制和 4000 万像素限制；SVG 和损坏文件不支持 |
| 文件搜索缺少结果 | 刷新索引，检查工作区、目录过滤、读取权限及索引上限；需要时包含依赖与构建目录 |
| 搜索结果无法打开 | 先打开宿主“文件”页签再重试；宿主组件变化可能影响编辑器回调适配 |
| HTTP 链接无法打开 | 检查 `exec:node` 权限、宿主 PATH、平台启动命令和默认浏览器；Web 模式检查弹窗限制 |
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
| `/preview/theme.html` | 全局主题、背景、幕布与时间线 | `check-theme.js`、`check-theme-controls.js`、`check-custom-theme.js`、`check-tool-theme.js`、`check-glass.js`、`check-timeline-coverage.js` |
| `/preview/files.html` | 文件搜索 | `check-files.js` |
| `/preview/links.html` | 网址识别和浏览器调用 | `check-links.js` |

上述脚本位于本地 `preview/`。预览使用模拟宿主接口；链接预览不会实际启动桌面浏览器，不能替代真实宿主集成验证。

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
| `pnpm check:compatibility` | 验证渠道切换、模型协议、会话隔离、主题迁移、媒体持久化、文件索引、浏览器参数和清洗逻辑 |
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
src/components/FileSearchPanel.tsx        文件搜索界面
src/system-bridge.ts                      宿主渠道读取与切换
src/selection-policy.ts                   会话与模型兼容性校验
src/session-display.ts                    当前会话显示适配
src/sync-host.ts                          模型与推理强度同步
src/theme-manager.ts                      主题生成、持久化与样式生命周期
src/theme-palette.ts                      内置主题与颜色变量
src/theme-customization.ts                自由选色和背景文件校验
src/tool-timeline-theme.ts                时间线与工具玻璃样式
src/chat-links.ts                         网址识别与打开交互
src/file-search.ts                        索引解码与模糊匹配
src/host-files.ts                         宿主编辑器打开适配
scripts/file-index.cjs                    只读文件名索引
scripts/open-browser.cjs                  跨平台默认浏览器启动
scripts/scrub-core.cjs                    提示词清洗核心
scripts/check-compatibility.mjs           模拟兼容性回归
preview/                                 本地预览页面与浏览器检查脚本（Git 忽略）
.github/workflows/compatibility.yml       跨平台 CI
dist/                                    构建生成的插件安装目录
```
