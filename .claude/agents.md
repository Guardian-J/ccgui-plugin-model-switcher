# Agents

此目录用于存放 ccgui-plugin-model-switcher 项目的 agent 定义文件。

## Agent 定义格式

Agent 定义文件使用独立的 `.md` 文件，包含 YAML frontmatter：

```markdown
---
name: plugin-reviewer
description: 审查插件代码质量和兼容性
tools: ["Read", "Grep", "Glob"]
model: sonnet
---

审查 ccgui-plugin-model-switcher 的代码变更：
- 检查 manifest.json 版本号和权限声明
- 验证 CLI 渠道注入逻辑
- 检查主题样式和组件兼容性
- 确认构建产物完整性
```

## 可用工具

- **Read, Write, Edit** - 读写源码文件
- **Bash** - 执行构建、测试、打包命令
- **Grep, Glob** - 搜索代码模式和文件
- **Agent** - 生成子 agent 处理复杂任务

## 项目特定场景

### 发布前检查
```
/agent release-checker "检查 1.0.11 版本是否就绪"
```

审查内容：
- `manifest.json` 版本号是否更新
- `dist/` 构建产物是否包含所有文件
- SHA256 校验和是否计算
- README 功能描述是否同步

### CLI 兼容性验证
```
/agent cli-validator "验证新增 CLI 的渠道注入"
```

检查项目：
- `src/system-bridge.ts` 中的 CLI 类型定义
- 渠道注入逻辑是否正确（attribution + env）
- 原生配置读取路径
- 模型列表获取接口

### 主题样式审查
```
/agent theme-auditor "审查主题代码的性能和兼容性"
```

关注点：
- `src/theme-manager.ts` CSS 变量生成
- `src/tool-timeline-theme.ts` 玻璃效果样式
- 浏览器兼容性（backdrop-filter）
- 性能影响（大量 DOM 操作）

## 项目结构参考

```
src/
├── index.tsx                    插件入口
├── components/
│   ├── CliModelFlyoutMenu.tsx  模型与渠道弹窗
│   ├── ThemeSettingsPanel.tsx  主题设置
│   └── FileSearchPanel.tsx     文件搜索
├── system-bridge.ts            宿主渠道读取与切换
├── theme-manager.ts            主题生成与样式注入
└── types.ts                    类型定义

scripts/
├── file-index.cjs              文件索引脚本
├── open-browser.cjs            浏览器启动脚本
└── scrub-core.cjs              提示词清洗核心

dist/                           构建产物目录
├── main.js                     插件主文件
├── manifest.json               插件清单
└── *.cjs                       Node 脚本
```

## 常用命令

```bash
# 类型检查
pnpm typecheck

# 兼容性测试
pnpm check:compatibility

# 构建插件
pnpm build

# 生成 dist.zip
powershell -Command "Compress-Archive -Path dist\* -DestinationPath dist.zip -Force"

# 创建 release
gh release create 1.0.x dist.zip --title "v1.0.x" --notes "..."
```

## 注意事项

### 版本号规范
- manifest.json 中的 `version` 字段**不带 v 前缀**（如 `1.0.10`）
- Git tag 使用纯数字版本号（如 `1.0.10`）
- Release 标题可以带 v（如 `v1.0.10`）

### 渠道注入格式
Claude CLI 的渠道配置必须包含：
```json
{
  "settingsConfig": {
    "attribution": { "commit": "", "pr": "" },
    "env": {
      "ENABLE_TOOL_SEARCH": "true"
    }
  }
}
```

### 构建检查
- 所有 `.cjs` 脚本文件必须复制到 `dist/`
- `manifest.json` 必须同步到 `dist/`
- 生成的 `main.js` 大小通常在 300-400 KB
