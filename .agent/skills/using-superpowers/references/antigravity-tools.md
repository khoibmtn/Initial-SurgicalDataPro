# Antigravity Tool Mapping

Skills use Claude Code tool names. When you encounter these in a skill, use your Antigravity equivalent:

| Skill references | Antigravity equivalent |
|-----------------|----------------------|
| `Read` (file reading) | `view_file` |
| `Write` (file creation) | `write_to_file` |
| `Edit` (file editing) | `replace_file_content` or `multi_replace_file_content` |
| `Bash` (run commands) | `run_command` |
| `Grep` (search file content) | `grep_search` |
| `Glob` (search files by name) | `find_by_name` |
| `TodoWrite` (task tracking) | `task_boundary` tool + `task.md` artifact |
| `Skill` tool (invoke a skill) | `view_file` on the skill's `SKILL.md` |
| `WebSearch` | `search_web` |
| `WebFetch` | `read_url_content` |
| `Task` tool (dispatch subagent) | `browser_subagent` (browser-only) — see below |

## Subagent limitations

Antigravity's `browser_subagent` is **browser-only** — it can interact with web pages but cannot run arbitrary code, edit files, or execute shell commands like Claude Code's `Task` tool.

Skills that rely on general-purpose subagent dispatch (`subagent-driven-development`, `dispatching-parallel-agents`) should **fall back to single-session execution** via `executing-plans`.

When a skill instructs you to "dispatch a subagent" or "use the Task tool":
1. **Do NOT** use `browser_subagent` for code implementation tasks
2. **Instead**, execute the tasks sequentially in your current session
3. Follow the `executing-plans` skill for batch execution with human checkpoints

## Additional Antigravity tools

These tools are available in Antigravity but have no Claude Code equivalent:

| Tool | Purpose |
|------|---------|
| `list_dir` | List files and subdirectories |
| `find_by_name` | Search for files by name pattern (glob format) |
| `view_content_chunk` | View specific chunks of large documents |
| `generate_image` | Generate images from text prompts |
| `browser_subagent` | Perform browser-based actions (web testing, screenshots) |
| `task_boundary` | Structured task progress tracking with modes (PLANNING, EXECUTION, VERIFICATION) |
| `notify_user` | Communicate with user during task mode |
| `run_command` | Run terminal commands (requires user approval for unsafe commands) |
| `send_command_input` | Send input to running terminal commands |
| `command_status` | Check status of background commands |

## Antigravity task tracking

Instead of `TodoWrite`, Antigravity uses a structured task system:
- Call `task_boundary` to set current task name, status, and mode
- Create/update `task.md` artifact to track checklist items
- Use `notify_user` to communicate with the user and request review
- Modes: `PLANNING` → `EXECUTION` → `VERIFICATION`

## Antigravity artifacts

Antigravity has a built-in artifact system for creating structured documents:
- `implementation_plan.md` — Technical plans (equivalent to design docs)
- `task.md` — Task checklists (equivalent to TodoWrite)
- `walkthrough.md` — Post-completion summaries
