---
description: Create a new Agent Skill for this codebase
argument-hint: [skill-name] [description]
---

# Write an Agent Skill

You are creating an **Agent Skill** - a structured capability that coding agents can discover and use to perform tasks more accurately and efficiently.

## What is an Agent Skill?

A skill is a folder of instructions, scripts, and resources that agents load on-demand. Unlike slash commands (single prompts), skills provide comprehensive, structured guidance for complex workflows.

**Key insight**: Skills are consumed by coding agents, not humans. Structure them so an agent can:
1. Quickly understand what the skill does (from `description`)
2. Load core instructions (from `SKILL.md`)
3. Access detailed references only when needed (from `references/`)

## Directory Structure

Create in `.claude/skills/<skill-name>/`:

```
skill-name/
├── SKILL.md              # Required - core instructions
└── references/           # Optional - detailed docs loaded on-demand
    ├── REFERENCE.md
    └── ...
```

## SKILL.md Format

### Frontmatter (Required)

```yaml
---
name: skill-name          # Lowercase, hyphens only, matches folder name
description: What this skill does and WHEN to use it. Include trigger keywords.
license: Proprietary      # Optional
metadata:                 # Optional
  author: autumn
  version: "1.0"
---
```

**Critical**: The `description` must tell the agent WHEN to activate this skill. Include specific keywords and scenarios.

### Body Structure

Write for an agent, not a human. Be direct and actionable.

```markdown
## What I do

[One sentence - what capability this provides]

## Before Starting

[Prerequisites, files to read first, setup requirements]

## Critical Rules

**DO:**
- [Concrete actions]

**DON'T:**
- [Common mistakes to avoid]

## Process / Template

[Step-by-step instructions or code templates]

## References

Load these on-demand for detailed information:

- [references/TOPIC.md](references/TOPIC.md) - Brief description
```

## Design Principles

1. **Progressive disclosure**: Keep `SKILL.md` under 500 lines. Move details to `references/`.

2. **Agent-first writing**: No fluff. Every line should help the agent do the task correctly.

3. **Include templates**: Agents work better with concrete examples and copy-paste templates.

4. **Trigger keywords**: The description should include words users might say that should activate this skill.

5. **Reference files**: Keep them focused and small. Agents load them on-demand, so smaller = less context used.

## Examples in This Codebase

Study these existing skills:

- `.claude/skills/linear-ticket/SKILL.md` - Simple skill, single file, uses MCP tools
- `.claude/skills/write-test/SKILL.md` - Complex skill with multiple reference files

## Your Task

1. **Ask** what the skill should do if `$ARGUMENTS` is empty or unclear
2. **Search** the codebase for patterns, existing implementations, and conventions
3. **Create** the skill directory and `SKILL.md`
4. **Add references** if the skill needs detailed documentation (keep `SKILL.md` focused)
5. **Verify** the skill follows the patterns in existing skills

## Naming Convention

- Folder: `.claude/skills/<skill-name>/`
- Name must be lowercase with hyphens only
- Name must match the folder name
- Keep names short but descriptive: `write-test`, `linear-ticket`, `code-review`
