# Agents

此目录用于存放 Claude Code agent 系统的 agent 定义文件。

## Agent 定义格式

Agent 定义文件使用独立的 `.md` 文件，包含 YAML frontmatter：

```markdown
---
name: agent-name
description: 简短描述此 agent 的功能
tools: ["Read", "Write", "Bash"]
model: sonnet
---

Agent 的具体指令写在这里...
```

## 可用工具

- Read, Write, Edit
- Bash
- Grep, Glob
- Agent (用于生成子 agent)
- 以及 Claude Code 环境中其他可用的工具

## 使用方式

调用已定义的 agent：

```
/agent agent-name "任务描述"
```

或通过 Agent 工具以编程方式调用：`subagent_type: "agent-name"`。

## 注意事项

- 保持 agent 指令专注且具体
- 明确定义 agent 任务所需的工具集
- 使用能清楚表达 agent 用途的描述性名称
