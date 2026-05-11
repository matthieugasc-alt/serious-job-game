<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:skill-overrides -->
# User skill overrides

This workspace contains user-level overrides for some Anthropic-provided
skills. They live under `.claude/skills/<skill-name>/`.

**Rule** : whenever you invoke a skill that has an override folder here,
you MUST read the override files (especially `OVERRIDES.md` and anything
under `references/`) **AFTER** reading the original plugin skill, and
treat the override as authoritative on any conflict.

Currently overridden skills :
- `executive-priority-briefing` → `.claude/skills/executive-priority-briefing/`
  (adds Olivier Véran as operational partner for hospital prospection)
<!-- END:skill-overrides -->
