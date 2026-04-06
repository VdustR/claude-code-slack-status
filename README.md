# claude-code-slack-status

Show your Claude Code quota and reset time in Slack status — with AI-generated formatting you can customize.

```
🔋 95% (19:00) · 88% (4/8 00:00) @ 14:30         ← healthy
🪫 35% (16:30) · 25% (4/5 12:00) @ 14:30          ← warning
⚠️ 15% (12:25) · 10% (4/4 01:00) @ 14:30          ← critical
⛔ Quota exhausted (12:00) @ 14:30                  ← rate-limited
```

> Emoji, thresholds, time format, separator — everything is customizable during setup. Slack emoji (e.g., `:battery:`, `:parrot:`) are used in Slack; the preview above shows Unicode approximations.

## Install

```bash
npx -y skills add VdustR/claude-code-slack-status -g
```

### Prerequisites

Before running setup, make sure you have:

- **Node 22+** — install via [mise](https://mise.jdx.dev/) or your preferred version manager
- **Slack user token** (`xoxp-`) with `users.profile:read` and `users.profile:write` scopes, set as env var:
  - `SLACK_STATUS_USER_TOKEN` (preferred), or
  - `SLACK_MCP_XOXP_TOKEN` (fallback — shared with Slack MCP)
- **Claude Code credentials** — either `~/.claude/.credentials.json` or macOS Keychain

### Setup

In any Claude Code session, tell the AI to set up Slack status. For example:

> "Help me set up Claude Code Slack status"

The AI will:

1. Check prerequisites
2. Build the hook handler from source
3. Help you design your status format (emoji, thresholds, time display)
4. Preview multiple options for you to choose from
5. Deploy and install hooks

### Reconfigure

To change your status format later, just ask:

> "Change my Claude Slack status format"

No need to reinstall — only the format module gets updated.

### Uninstall

> "Remove the Claude Slack status integration"

## How It Works

When you use Claude Code, hooks fire on session events:

- **SessionStart** — saves your current Slack status, sets quota status
- **Stop** — updates quota (throttled to avoid API spam)
- **StopFailure** — shows rate-limited status if quota hit
- **SessionEnd** — restores your original Slack status

If you enable auto-close during setup, the status auto-expires as a safety net for crashes. If you manually change your Slack status while Claude is running, the integration detects this and won't overwrite it.

## Development

```bash
cd skills/setup
pnpm install
pnpm test          # run all tests
pnpm typecheck     # strict mode
pnpm build         # esbuild → dist/hook.mjs
```

## License

MIT
