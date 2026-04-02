# claude-code-slack-status

Claude Code plugin that syncs quota usage and reset time into Slack custom status through local hooks with AI-generated formatting.

## Features

- Sync Claude Code 5h and 7d quota into Slack custom status
- Show reset time (absolute or relative, customizable)
- AI-generated format — dynamically built, not hardcoded
- Dynamic emoji thresholds — any number of levels, any emojis
- Restore previous Slack status when the last session ends
- Respect manual status changes (ownership detection)
- 15-minute status lease auto-expires if Claude dies

## Requirements

- Node 22+ (via [mise](https://mise.jdx.dev/))
- Slack user token (`xoxp-`) with `users.profile:read` and `users.profile:write` scopes
  - Set as `SLACK_STATUS_USER_TOKEN` or `SLACK_MCP_XOXP_TOKEN` env var
- Claude Code credentials (`~/.claude/.credentials.json` or macOS Keychain)

## Install

```bash
npx -y skills add VdustR/claude-code-slack-status -g
```

The setup skill will:

1. Check prerequisites
2. Build the hook handler (esbuild → single .mjs file)
3. Generate your custom format with AI-assisted preview
4. Deploy to `~/.claude/claude-code-slack-status/`
5. Install hooks into `~/.claude/settings.json`

## Architecture

```
skills/setup/                  Runtime (~/.claude/claude-code-slack-status/)
├── SKILL.md                   ├── hook.mjs    ← esbuild bundle
├── src/*.ts (source + tests)  ├── hook.sh     ← shell wrapper (mise + node)
├── package.json               ├── format.mjs  ← AI-generated format function
├── tsconfig.json              ├── config.json ← operational config
└── vitest.config.ts           ├── state.json  ← session + circuit breaker state
                               └── logs/events.jsonl
```

Source, build config, and tests all live in `skills/setup/` so they're available when installed via `npx skills add`. The setup skill builds everything dynamically in a tmp dir.

## Development

```bash
cd skills/setup
pnpm install
pnpm test          # run tests
pnpm typecheck     # type checking
pnpm build         # build hook.mjs to dist/
```

## License

MIT
