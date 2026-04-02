# claude-code-slack-status

Show your Claude Code quota and reset time in Slack status — with AI-generated formatting you can customize.

```
:battery: 95% (4h 45m / 5h) ··· 88% (6d 3h / 7d)          ← healthy
:low_battery: 42% (2h 10m / 5h) ··· 35% (2d 11h / 7d)     ← warning
:empty_battery: 8% (25m / 5h) ··· 15% (1d 1h / 7d) [!]    ← critical
```

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

Your Slack status auto-expires after 15 minutes, so if Claude or your terminal dies, it won't stick forever. If you manually change your Slack status while Claude is running, the integration detects this and won't overwrite it.

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
