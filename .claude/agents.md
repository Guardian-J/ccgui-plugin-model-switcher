# Agents

This directory can contain agent definitions for the Claude Code agent system.

## Agent Definition Format

Agents are defined in individual `.md` files with YAML frontmatter:

```markdown
---
name: agent-name
description: Brief description of what this agent does
tools: ["Read", "Write", "Bash"]
model: sonnet
---

Agent instructions go here...
```

## Available Tools

- Read, Write, Edit
- Bash
- Grep, Glob
- Agent (for spawning subagents)
- And other tools available in the Claude Code environment

## Usage

To use a defined agent:

```
/agent agent-name "task description"
```

Or programmatically via the Agent tool with `subagent_type: "agent-name"`.

## Notes

- Keep agent instructions focused and specific
- Define clear tool sets needed for the agent's tasks
- Use descriptive names that indicate the agent's purpose
