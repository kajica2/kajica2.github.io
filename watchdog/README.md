# Watchdog — one-step-at-a-time relay agent

The watchdog sits at the end of the rope. It does NOT poll, does NOT scan
everything, does NOT auto-loop. It wakes on three triggers:

1. **Done** — a delegated task completes (PR merged / push to main)
2. **Stuck** — an agent is blocked and needs a human decision
3. **Heartbeat** — every 8 hours, just to say "alive"

When it wakes, it sends ONE message to Kai (Telegram, falls back to iMessage
on macOS). Then it idles.

## Configure

Edit `~/.hermes/config.yaml`:

```yaml
telegram:
  bot_token: <token from @BotFather>
  chat_id:   <your numeric chat id>
```

Or set env vars:

```bash
export TELEGRAM_BOT_TOKEN="..."
export TELEGRAM_CHAT_ID="..."
```

For iMessage fallback (macOS), Messages.app must be signed in.

## Use

From any agent:

```bash
node watchdog/watchdog.mjs \
  --mode done \
  --step 3 \
  --summary "Built hub instance from framework template" \
  --artifacts "https://kajica2.github.io/" \
  --handoff "Click around. Tell me what to tweak next."
```

When blocked:

```bash
node watchdog/watchdog.mjs \
  --mode stuck \
  --step 5 \
  --reason "Need Vercel token to wire daily pipeline cron" \
  --tried "Read Vercel env, no token present" \
  --need "VERCEL_TOKEN + cron auth, paste into ~/.hermes/config.yaml" \
  --default "Skip Step 5 until token available, move to Step 6"
```

## Run modes

- `--mode done` — green check, summary, next step. Idles after.
- `--mode stuck` — warning, reason, what was tried, what's needed, suggested fallback.
- `--mode heartbeat` — heart emoji, summary, "alive, no action needed".

## GitHub Actions

`.github/workflows/watchdog.yml` is wired to:

**Fires watchdog on (meaningful events only):**
- **PR merged to main** — primary "something happened" trigger
- **Push to specific paths**: `PURPOSE.md`, `AGENTS.md`, `prompts/`, `plans/`, `_bootstrap/draft/`, `schema/`, `scripts/`, `watchdog/`, `examples/`, `components/`
- **Schedule**: every 8 hours (heartbeat)
- **Manual trigger** (workflow_dispatch): configurable

**Does NOT fire on (avoid spam):**
- Loop rotation commits (`loop/growth-reports/`, `loop/state.json`)
- Daily report ingestion (`channels/daily-reports/`)
- Watchdog's own commits (`watchdog/`)
- Routine workflow files

The workflow calls `node watchdog/watchdog.mjs` with args derived from the
GitHub event. Configure `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` as
repo secrets to enable Telegram delivery. iMessage fallback works on macOS.


## Adding the Telegram bot to your repo

Once you have the bot token + chat ID from the @BotFather setup:

```bash
# Set secrets on the framework repo
gh secret set TELEGRAM_BOT_TOKEN --repo kajica2/agent-hub-framework
gh secret set TELEGRAM_CHAT_ID --repo kajica2/agent-hub-framework

# Also set on the instance repo if you want watchdog pings for instance changes
gh secret set TELEGRAM_BOT_TOKEN --repo kajica2/kajica2.github.io
gh secret set TELEGRAM_CHAT_ID --repo kajica2/kajica2.github.io

# Or set locally so watchdog can be invoked from CLI
gh secret set TELEGRAM_BOT_TOKEN
gh secret set TELEGRAM_CHAT_ID
```

AfterThen trigger a test:
- Go to repo → Actions → watchdog → Run workflow → mode: heartbeat, step: test, summary: manual test
- Or: `gh workflow run watchdog.yml --repo kajica2/agent-hub-framework -f mode=heartbeat`
