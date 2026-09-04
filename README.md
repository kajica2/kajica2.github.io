# Sovereign Signal — kajica2 instance

The kajica2 instance of the [agent-hub-framework](https://github.com/kajica2/agent-hub-framework).

## What's here

- `index.html` — top-level hub with entity switcher
- `research/` — Research + Creative Development entity surface
- `eye-kairi/` — Eye & Kairi consulting entity surface
- `agents/` — 8 agent personas (2 active, 6 stub)
- `channels/tech-pulse/` — tech-pulse channel
- `channels/daily-reports/` — daily research reports
- `channels/agent-chat/` — agent chat archive (Phase 2)
- `devices/guitar/` — hub-as-runtime guitar device (Phase 2)
- `legacy/` — the original SOVEREIGN SIGNAL pages (preserved verbatim)
- `internal/` — paywalled project entries (Bob Mover lexicon, Serious Fun, Jazzability). Never surfaces publicly.
- `api/v1/state.json` — public-safe state snapshot (paywall filtered)
- `schema/` — copied from framework for self-contained rebuilds
- `scripts/` — copied from framework for self-contained rebuilds

## Rebuild

```bash
node scripts/validate.mjs projects.json agents.json
node scripts/build.mjs --source . --out dist
```

Or via GitHub Action: `.github/workflows/rebuild.yml` (runs on push + daily at 06:00 UTC).

## Adding a project

Edit `projects.json`. Every entry MUST have:
- `name` (kebab-case)
- `umbrella` (`music | audio | video | programming | research | other`)
- `repo` (GitHub URL)
- `description` (10–240 chars)
- `material_license.kind` (closed enum — see `schema/project.schema.json`)
- `capabilities` (from the controlled taxonomy in `schema/capability-taxonomy.json`)

Commit + push. The rebuild action regenerates the pages.
