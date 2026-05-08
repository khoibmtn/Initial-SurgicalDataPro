# Superpowers for Antigravity

You have superpowers — a complete software development workflow built on composable skills.

## Quick Start

Read the core skill to understand how skills work:
- **Core skill**: `skills/using-superpowers/SKILL.md`
- **Tool mapping**: `skills/using-superpowers/references/antigravity-tools.md`

## How to Use Skills in Antigravity

1. **Read** the skill's `SKILL.md` file using `view_file`
2. **Follow** the instructions in the skill exactly
3. **Map** any Claude Code tool references using the tool mapping above

## Available Skills

| Skill | When to use | Path |
|-------|------------|------|
| **brainstorming** | Before writing any code — refine ideas into designs | `skills/brainstorming/SKILL.md` |
| **writing-plans** | After design approval — create detailed task plans | `skills/writing-plans/SKILL.md` |
| **executing-plans** | With a plan — execute tasks in batches | `skills/executing-plans/SKILL.md` |
| **test-driven-development** | During implementation — RED-GREEN-REFACTOR | `skills/test-driven-development/SKILL.md` |
| **systematic-debugging** | When debugging — 4-phase root cause process | `skills/systematic-debugging/SKILL.md` |
| **requesting-code-review** | Between tasks — review against plan | `skills/requesting-code-review/SKILL.md` |
| **receiving-code-review** | Responding to review feedback | `skills/receiving-code-review/SKILL.md` |
| **verification-before-completion** | Before declaring done — verify it works | `skills/verification-before-completion/SKILL.md` |
| **using-git-worktrees** | For parallel development branches | `skills/using-git-worktrees/SKILL.md` |
| **finishing-a-development-branch** | When tasks complete — merge/PR decision | `skills/finishing-a-development-branch/SKILL.md` |
| **writing-skills** | To create new skills | `skills/writing-skills/SKILL.md` |

## Important: Subagent Limitations

Antigravity's `browser_subagent` is browser-only. Skills referencing subagent dispatch (`subagent-driven-development`, `dispatching-parallel-agents`) should fall back to `executing-plans` for single-session execution.

## Workflows

Use these slash commands in Antigravity:
- `/superpowers-brainstorm` — Start brainstorming session
- `/superpowers-plan` — Write an implementation plan
- `/superpowers-execute` — Execute a plan
