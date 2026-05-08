---
description: Apply UI/UX Pro Max design intelligence to the project
---

1. Execute the following command to understand the UI/UX Pro Max skill capabilities and search methods:
```bash
cat .agents/skills/ui-ux-pro-max/SKILL.md
```

2. After reading the skill instructions, analyze the user's prompt (which immediately follows this workflow execution) and apply the design system reasoning rules. Always search the database via `python3 scripts/search.py` (ensure you adjust the path if the skill directory is symlinked from elsewhere) to get style, color, typography, and UX guidelines before writing any code.

3. Then, implement the user's UI/UX request.
