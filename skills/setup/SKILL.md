---
name: claude-code-slack-status
description: Show Claude Code quota and reset time in Slack status. Use when the user wants to display Claude Code usage on Slack, sync quota to Slack status, set up Slack status for Claude, show remaining quota in Slack, configure Claude quota notifications on Slack, change their Slack status format for Claude usage, or reinstall/reconfigure the integration. Also use when the user mentions "claude slack status", "quota on slack", "slack show quota", or "claude usage slack".
---

# Claude Code Slack Status

Syncs your Claude Code quota (5h + 7d remaining %, reset time) into your Slack custom status. The format is fully customizable — you generate it with the user through an interactive preview flow.

## What This Skill Does

1. **Builds** a hook handler from TypeScript source (esbuild)
2. **Generates** a custom `format.mjs` with the user (emoji, thresholds, time format — all customizable)
3. **Validates** everything in a tmp dir before touching anything
4. **Deploys** to `~/.claude/claude-code-slack-status/`
5. **Installs** hooks into `~/.claude/settings.json` for 4 Claude Code events

After setup, the user's Slack status automatically updates whenever they use Claude Code. When all sessions end, their original status is restored.

## Skill Root

All source, build config, and dependencies live in this skill's own directory (the one containing this SKILL.md). Resolve it first — do not hardcode paths.

## Prerequisites

Check each one. If any fails, help the user fix it before proceeding.

1. **Node 22+**: Run `node -v`. If missing, suggest installing via [mise](https://mise.jdx.dev/) (`.mise.toml` is included in this skill's directory).
2. **pnpm**: Run `pnpm -v`. If missing, run `corepack enable` (the `packageManager` field in `package.json` handles the version).
3. **Dependencies**: Check that `node_modules` directory exists in skill root. If missing, run `pnpm install` from skill root.
4. **Slack user token**: One of these env vars must be set with an `xoxp-` prefix:
   - Check: `[ -n "${SLACK_STATUS_USER_TOKEN+x}" ] && echo "set:${#SLACK_STATUS_USER_TOKEN}" || echo "unset"`
   - Fallback: `[ -n "${SLACK_MCP_XOXP_TOKEN+x}" ] && echo "set:${#SLACK_MCP_XOXP_TOKEN}" || echo "unset"`
   - Required scopes: `users.profile:read`, `users.profile:write`
   - **Never print the token value** — only check existence and length.
5. **Claude credentials**: Verify `~/.claude/.credentials.json` exists or macOS Keychain has `Claude Code-credentials`.

## Build & Deploy Flow

All artifacts are built in a tmp dir first, validated, then deployed atomically.

### Step 1: Create tmp dir

```bash
BUILD_DIR=$(mktemp -d)
echo "Build dir: $BUILD_DIR"
```

### Step 2: Build hook.mjs

```bash
cd <SKILL_ROOT> && pnpm exec esbuild src/hook.ts \
  --bundle --platform=node --format=esm --target=node22 \
  --outfile="$BUILD_DIR/hook.mjs"
```

Validate the bundle loads:

```bash
node --input-type=module -e "import('file://$BUILD_DIR/hook.mjs').then(() => console.log('OK')).catch(e => { console.error(e); process.exit(1) })"
```

### Step 3: Generate format.mjs (interactive)

This is the creative part — work with the user to design their ideal status format. Start by showing them what data is available, then generate 3+ options with live previews. Iterate until they're happy.

**Ask the user** what info they want to see and how. Some prefer minimal (`5h:42% 7d:78%`), others want reset times (`42% (2h 10m / 5h)`), others want verbose. Don't assume — ask.

**Additional options — ask the user about each. All options are fully customizable; the defaults below are starting points.**

1. **Time format per field** (default: **absolute** for all)
   - Each time field can be individually set to absolute or relative:
     - `s.fiveHour.resetAt` / `s.fiveHour.resetIn` — default: absolute `HH:mm` (e.g., `16:30`). Alternative: relative (e.g., `2h 10m`).
     - `s.sevenDay.resetAt` / `s.sevenDay.resetIn` — default: absolute `M/D HH:mm` or `Mon D` (e.g., `4/5 00:00`). Alternative: relative (e.g., `3d 2h`).
     - `s.capturedAt` — default: absolute `HH:mm` (e.g., `14:30`). Alternative: relative (e.g., `2m ago`).
   - Use `Intl.DateTimeFormat` (Node.js built-in, no deps). Default: 24h format.
   - User may request: 12h format, include seconds, different locale, date-fns (if requested, suggest Intl instead — no bundling needed).
   - Ask: "All times default to absolute (e.g., 16:30). Want to change any to relative (e.g., 2h 10m)?"

2. **Last update time display** (default: **yes**)
   - Ask: "Want to show when the status was last updated?"
   - If yes: appended as `@ HH:mm` by default (customizable position and format).
   - Uses `s.capturedAt` — already available in `QuotaSnapshot`.

3. **Auto-close** (default: **no**)
   - Ask: "Want the Slack status to auto-expire after a timeout? (safety net if Claude crashes)"
   - If no: set `statusLeaseSeconds: 0` in config.json (status stays until SessionEnd restores it or user clears manually).
   - If yes: ask for timeout duration (default: 15 minutes = 900 seconds). Set `statusLeaseSeconds` accordingly.
   - Note: Even without auto-close, SessionEnd always restores the baseline status. Auto-close is a safety net for crashes/force-quits.

4. **Custom content** (default: **no**)
   - Ask: "Want to add any custom text or override messages?"
   - Sub-questions if yes:
     - **Position**: "Before or after the quota info?" (or wrapping it)
     - **Custom rate-limit message**: "Want a specific message when at 0%?" (e.g., `"☕ Taking a break — quota resets at {time}"`)
     - **Custom prefix/suffix**: Free-form text the user wants always shown (e.g., team name, project, a note)
   - Generate the format.mjs with the user's choices baked in.
   - User can make ANY adjustments — these are just common patterns to offer.

**Available data in `QuotaSnapshot` (the `s` parameter):**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `s.fiveHour.percentLeft` | `number` | 5h remaining % | `42` |
| `s.fiveHour.percentUsed` | `number` | 5h used % | `58` |
| `s.fiveHour.resetAt` | `Date` | 5h absolute reset time | `Date("2026-04-02T16:30:00Z")` |
| `s.fiveHour.resetIn` | `number` | ms until 5h reset | `7200000` |
| `s.sevenDay.percentLeft` | `number` | 7d remaining % | `78` |
| `s.sevenDay.percentUsed` | `number` | 7d used % | `22` |
| `s.sevenDay.resetAt` | `Date` | 7d absolute reset time | `Date("2026-04-05T00:00:00Z")` |
| `s.sevenDay.resetIn` | `number` | ms until 7d reset | `172800000` |
| `s.capturedAt` | `Date` | When quota was probed | — |

**Required export:**

```javascript
// format.mjs must export exactly this function signature
export function formatStatus(s) {
  return {
    statusText: "...",   // max 100 chars, Slack status text
    statusEmoji: "...",  // Slack emoji like ":battery:"
  };
}
```

**Design rules for format generation:**
- Emoji levels are fully dynamic — any number of breakpoints, any emojis
- Include comments showing users how to customize emojis and thresholds
- **Time formatting defaults to absolute** (`Intl.DateTimeFormat`) for all fields. Each field (5h reset, 7d reset, capturedAt) can be individually switched to relative/remaining. Include the relative formatter commented-out for easy switching.
- Default thresholds per-window: 5h ≤40% warning (2/5), ≤20% critical (1/5); 7d ≤29% warning (2/7), ≤14% critical (1/7); 0% rate-limited
- But user can request any number of levels with any breakpoints
- Generate 3+ options, validate EACH in tmp before presenting
- Show previews for multiple scenarios: healthy, warning, critical, rate-limited
- Separator: `·` (single centered dot)
- **Everything is freely customizable** — the defaults are starting points, not constraints

**Sample format option (Option D from design):**

```javascript
// Auto-generated by claude-code-slack-status setup skill
// Re-run the skill to regenerate, or edit this file directly.

// Per-window severity: 0=healthy 1=warning 2=critical 3=rate-limited
// Adjust thresholds per window — values are percentLeft after Math.round
const sev = (pct, warn, crit) =>
  pct < 1 ? 3 : pct <= crit ? 2 : pct <= warn ? 1 : 0;

// Emoji per severity level — adjust freely
const emojis = [":battery:", ":low_battery:", ":warning:", ":no_entry:"];

// Time formatters — each field uses absolute by default
// Switch any to relative by changing the corresponding function below

// Absolute time: HH:mm (24h). Change to { hour12: true } for 12h format.
const fmtTime = (date) =>
  new Intl.DateTimeFormat("default", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);

// Absolute date+time for 7d window: M/D HH:mm. Customize as needed.
const fmtDateTime = (date) =>
  new Intl.DateTimeFormat("default", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);

// Relative time formatter — uncomment and use for any field you want as relative/remaining
// const fmtRelative = (ms) => {
//   const m = Math.floor(ms / 60000);
//   const d = Math.floor(m / 1440);
//   const h = Math.floor((m % 1440) / 60);
//   const mm = m % 60;
//   if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
//   if (h > 0) return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
//   return `${mm}m`;
// };

export function formatStatus(s) {
  const p5 = Math.round(s.fiveHour.percentLeft);
  const p7 = Math.round(s.sevenDay.percentLeft);

  // Worst severity across both windows
  const level = Math.max(
    sev(p5, 40, 20),  // 5h: warn ≤ 40% (2/5), crit ≤ 20% (1/5)
    sev(p7, 29, 14),  // 7d: warn ≤ 29% (2/7), crit ≤ 14% (1/7)
  );

  // Last update time
  const updated = ` @ ${fmtTime(s.capturedAt)}`;

  // Custom rate-limit message — shown when at 0%
  if (level === 3) {
    return {
      statusText: `Quota exhausted (${fmtTime(s.fiveHour.resetAt)})${updated}`,
      statusEmoji: emojis[3],
    };
  }

  // 5h reset: absolute time (e.g., "16:30"). To use relative: fmtRelative(s.fiveHour.resetIn)
  const r5 = fmtTime(s.fiveHour.resetAt);
  // 7d reset: absolute date+time (e.g., "4/5 00:00"). To use relative: fmtRelative(s.sevenDay.resetIn)
  const r7 = fmtDateTime(s.sevenDay.resetAt);

  return {
    statusText: `${p5}% (${r5}) · ${p7}% (${r7})${updated}`,
    statusEmoji: emojis[level],
  };
}
```

**Validation (run for EACH option before presenting to user):**

Write format code to `$BUILD_DIR/format.mjs`, then:

```bash
node --input-type=module -e "
  import { formatStatus } from 'file://$BUILD_DIR/format.mjs';
  const scenarios = [
    { name: 'healthy',  s: { fiveHour: { percentLeft: 95, percentUsed: 5, resetAt: new Date('2026-04-02T19:00:00Z'), resetIn: 16200000 }, sevenDay: { percentLeft: 88, percentUsed: 12, resetAt: new Date('2026-04-08T00:00:00Z'), resetIn: 475200000 }, capturedAt: new Date() } },
    { name: 'warning',  s: { fiveHour: { percentLeft: 35, percentUsed: 65, resetAt: new Date('2026-04-02T16:30:00Z'), resetIn: 7200000 }, sevenDay: { percentLeft: 25, percentUsed: 75, resetAt: new Date('2026-04-05T12:00:00Z'), resetIn: 259200000 }, capturedAt: new Date() } },
    { name: 'critical', s: { fiveHour: { percentLeft: 15, percentUsed: 85, resetAt: new Date('2026-04-02T12:25:00Z'), resetIn: 1500000 }, sevenDay: { percentLeft: 10, percentUsed: 90, resetAt: new Date('2026-04-04T01:00:00Z'), resetIn: 90000000 }, capturedAt: new Date() } },
    { name: 'rateLimit', s: { fiveHour: { percentLeft: 0, percentUsed: 100, resetAt: new Date('2026-04-02T12:00:00Z'), resetIn: 0 }, sevenDay: { percentLeft: 15, percentUsed: 85, resetAt: new Date('2026-04-04T01:00:00Z'), resetIn: 90000000 }, capturedAt: new Date() } },
  ];
  for (const { name, s } of scenarios) {
    const r = formatStatus(s);
    if (typeof r.statusText !== 'string' || typeof r.statusEmoji !== 'string') {
      console.error('FAIL: ' + name);
      process.exit(1);
    }
    console.log(name + ': ' + r.statusEmoji + ' ' + r.statusText);
  }
  console.log('ALL OK');
"
```

If validation fails, fix the code and retry. Only present options that pass all 4 scenarios.

**Presenting to the user:** Show each option with all 4 scenario previews. Convert Slack emoji codes to Unicode for terminal display. **Do not use a hardcoded emoji map.** Since you generate format.mjs and know which Slack emoji codes are used, dynamically generate the mapping for just those codes in the preview script. For example, if the format uses `:battery:`, `:low_battery:`, `:warning:`, `:no_entry:`, generate:

```javascript
const emojiMap = { ":battery:": "🔋", ":low_battery:": "🪫", ":warning:": "⚠️", ":no_entry:": "⛔" };
const toUnicode = (code) => emojiMap[code] ?? code;
```

The mapping is generated fresh each time based on the actual codes — if the user picks different emoji, the mapping changes accordingly.

> Note: Preview shows Unicode emoji approximations. In Slack, these render as Slack emoji — you can use any Slack custom emoji (e.g., `:parrot:`) but custom emoji won't render in this preview.

Expected default preview output:
```
🔋 95% (19:00) · 88% (4/8 00:00) @ 14:30         ← healthy
🪫 35% (16:30) · 25% (4/5 12:00) @ 14:30          ← warning
⚠️ 15% (12:25) · 10% (4/4 01:00) @ 14:30          ← critical
⛔ Quota exhausted (12:00) @ 14:30                  ← rate-limited
```

### Step 4: Generate hook.sh

```bash
cat > "$BUILD_DIR/hook.sh" << 'HOOKEOF'
#!/usr/bin/env bash
set -euo pipefail
eval "$(mise activate bash --shims 2>/dev/null)" || true
exec node "$HOME/.claude/claude-code-slack-status/hook.mjs" hook
HOOKEOF
chmod +x "$BUILD_DIR/hook.sh"
```

Validate: `bash -n "$BUILD_DIR/hook.sh" && echo "syntax OK"`

### Step 5: Deploy

Only after ALL validations pass:

```bash
DEPLOY_DIR="$HOME/.claude/claude-code-slack-status"
mkdir -p "$DEPLOY_DIR/logs"
cp "$BUILD_DIR/hook.mjs" "$DEPLOY_DIR/hook.mjs"
cp "$BUILD_DIR/hook.sh" "$DEPLOY_DIR/hook.sh"
chmod +x "$DEPLOY_DIR/hook.sh"
cp "$BUILD_DIR/format.mjs" "$DEPLOY_DIR/format.mjs"
[ -f "$DEPLOY_DIR/config.json" ] || echo '{"version":1,"probeIntervalMs":60000,"throttleIntervalMs":30000,"statusLeaseSeconds":0}' > "$DEPLOY_DIR/config.json"
rm -rf "$BUILD_DIR"
```

### Step 6: Install hooks into settings.json

Read `~/.claude/settings.json`, add managed hooks for 4 events, write back. Preserve all unrelated hooks.

The hook command is the absolute path to `hook.sh`: `$HOME/.claude/claude-code-slack-status/hook.sh`

Identify managed hooks by checking if `command` contains `claude-code-slack-status`.

Each event gets a hook entry with:
```json
{
  "matcher": ".*",
  "hooks": [{ "type": "command", "command": "<hook.sh path>", "timeout": 30 }]
}
```

For the 4 events: `SessionStart`, `Stop`, `StopFailure`, `SessionEnd`.

**After install, verify:**

```bash
node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  const s = JSON.parse(readFileSync(process.env.HOME + '/.claude/settings.json', 'utf8'));
  const events = ['SessionStart', 'Stop', 'StopFailure', 'SessionEnd'];
  const found = events.filter(e => s.hooks?.[e]?.some(c => c.hooks?.some(h => h.command?.includes('claude-code-slack-status'))));
  console.log('Installed hooks:', found.length, '/ 4');
  if (found.length !== 4) process.exit(1);
"
```

## Reconfigure Format

If the user just wants to change their status format (emoji, thresholds, time style) without a full reinstall:

1. Run Step 3 only — generate new `format.mjs` in a tmp dir
2. Validate with all 4 scenarios
3. Copy only `format.mjs` to `~/.claude/claude-code-slack-status/`
4. Done — hooks load `format.mjs` dynamically, no restart needed

## Uninstall

1. Remove managed hooks from `~/.claude/settings.json` — only remove hooks whose `command` contains `claude-code-slack-status`. Preserve all other hooks.
2. Ask the user if they want to restore their original Slack status.
3. Ask the user if they want to clean up `~/.claude/claude-code-slack-status/`.

## Safety Rules

- **Never print Slack tokens or Claude credentials.** Only check existence and length.
- **Preserve unrelated hooks** in `settings.json` — only touch hooks managed by this tool.
- **Validate before deploying** — all artifacts must pass validation in the tmp dir before being copied to the deploy directory.
- **Respect manual status changes** — if the user changed their Slack status while Claude Code was running, don't overwrite it on session end.
- **Status lease** — if auto-close is enabled during setup, Slack status auto-expires after the configured duration as a safety net. Without auto-close, the status is cleared when all sessions end.
