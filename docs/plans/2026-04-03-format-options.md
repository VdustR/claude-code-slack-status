# Format Options Enhancement

## Context

User wants to enhance the SKILL.md interactive format generation (Step 3) with more configurability:
1. **Time format per field** — default all times to absolute (`Intl.DateTimeFormat`), each individually switchable to relative/remaining
2. **Last update time** — optionally show `capturedAt` (default: yes)
3. **Auto-close** — optionally set `status_expiration` (default: no = 0 = no expiration)
4. **Custom content** — user can append/prepend text, override rate-limit message, etc.

Core principle: **everything is freely customizable** — defaults are starting points.

## Format Defaults

- Rate-limit: `Quota exhausted (12:00) @ 14:30` (simple parenthetical, same structure as normal)
- Preview to user: show **Unicode emoji** (🔋 🪫 ⚠️ ⛔) not Slack codes — note that Slack custom emoji won't render in preview

Example default output:
```
🔋 95% (19:00) · 88% (4/8 00:00) @ 14:30         ← healthy
🪫 42% (16:30) · 35% (4/5 12:00) @ 14:30          ← warning
⚠️ 8% (12:25) · 15% (4/4 01:00) @ 14:30           ← critical
⛔ Quota exhausted (12:00) @ 14:30                  ← rate-limited
```

## Code Changes

### 1. `skills/setup/src/hook.ts` — support `statusLeaseSeconds: 0`

Add helper + use it in 2 places:

```typescript
function computeExpiration(nowMs: number, leaseSeconds: number): number {
  return leaseSeconds > 0 ? Math.floor(nowMs / 1000) + leaseSeconds : 0;
}
```

Replace at line ~203-205 (`updateSlackForSession`):
```typescript
status_expiration: computeExpiration(runtime.now(), config.statusLeaseSeconds),
```

Replace at line ~141-144 (`StopFailure` handler):
```typescript
status_expiration: computeExpiration(now, config.statusLeaseSeconds),
```

### 2. `skills/setup/src/config.ts:9` — change default

```typescript
statusLeaseSeconds: 0,  // was: 900
```

### 3. `skills/setup/src/hook.test.ts` — add test

New test: write `config.json` with `statusLeaseSeconds: 0`, fire `SessionStart`, assert `status_expiration === 0`.

### 3b. `skills/setup/src/config.test.ts:23` — update assertion

Change `expect(config.statusLeaseSeconds).toBe(900)` → `expect(config.statusLeaseSeconds).toBe(0)` to match new default.

### 4. `skills/setup/SKILL.md` — main changes

#### Step 3: Add interactive questions (after line ~67)

Insert 4 new question blocks:

1. **Time format per field** (default: absolute for all)
   - 5h reset: `Intl` HH:mm (absolute) or relative `2h 10m`
   - 7d reset: `Intl` M/D HH:mm (absolute) or relative `3d 2h`
   - capturedAt: `Intl` HH:mm (absolute) or relative `2m ago`
   - Each independently configurable

2. **Last update time display** (default: yes)
   - Show `capturedAt` as `@ HH:mm`

3. **Auto-close** (default: no)
   - No → `statusLeaseSeconds: 0` in config.json
   - Yes → ask duration (default: 15min = 900s)

4. **Custom content** (default: no)
   - Position: before/after quota info
   - Rate-limit override message
   - Free-form prefix/suffix

#### Update design rules (line ~96-101)

- Time formatting defaults to absolute, include commented-out relative formatter
- Separator: `·` (single centered dot)
- No `↻` prefix, no `[!]` tag
- Rate-limit: simple `Quota exhausted (time) @ updated` format
- Everything freely customizable

#### Replace sample format.mjs (line ~107-141)

New sample uses:
- `Intl.DateTimeFormat` for all times (absolute by default)
- Commented-out `fmtRelative` for easy switching
- Per-field comments showing how to switch
- `·` separator between 5h and 7d
- Rate-limit: `Quota exhausted (resetTime) @ capturedAt`
- `capturedAt` display as `@ HH:mm`

Example output: `95% (19:00) · 88% (4/8 00:00) @ 14:30`

#### Preview with Unicode emoji

When showing preview scenarios to the user during setup, convert Slack emoji codes to Unicode for terminal display. **Do not use a hardcoded emoji map.** Since the AI generates format.mjs and knows exactly which Slack emoji codes are used, it should dynamically generate the mapping for just those codes in the validation/preview script. For example, if the format uses `:battery:`, `:low_battery:`, `:warning:`, `:no_entry:`, the AI generates:

```javascript
const emojiMap = { ":battery:": "🔋", ":low_battery:": "🪫", ":warning:": "⚠️", ":no_entry:": "⛔" };
const toUnicode = (code) => emojiMap[code] ?? code;
```

The mapping is generated fresh each time based on the actual codes in the format — if the user picks different emoji, the mapping changes accordingly.

Add a note in the preview output:
> Note: Preview shows Unicode emoji approximations. In Slack, these render as Slack emoji — you can use any Slack custom emoji (e.g., `:parrot:`) but custom emoji won't render in this preview.

#### Update Safety Rules (line ~253)

Change: "Status lease — Slack status expires after 15 minutes automatically, so if Claude or the terminal dies, the status won't stick forever."
To: "Status lease — if auto-close is enabled during setup, Slack status auto-expires after the configured duration as a safety net. Without auto-close, the status is cleared when all sessions end."

#### Update deploy config template (line ~197)

Change `statusLeaseSeconds` from 900 to 0.

### 5. `README.md` — update examples + emoji note

Update the example block to match new defaults:
```
🔋 95% (19:00) · 88% (4/8 00:00) @ 14:30         ← healthy
🪫 42% (16:30) · 35% (4/5 12:00) @ 14:30          ← warning
⚠️ 8% (12:25) · 15% (4/4 01:00) @ 14:30           ← critical
⛔ Quota exhausted (12:00) @ 14:30                  ← rate-limited
```

Add note after examples:
> Emoji, thresholds, time format, separator — everything is customizable during setup. Slack emoji (e.g., `:battery:`, `:parrot:`) are used in Slack; the preview above shows Unicode approximations.

Update "How It Works" section: remove the "auto-expires after 15 minutes" mention (now optional, default off). Replace with: "If you enable auto-close during setup, the status auto-expires as a safety net."

## Files Changed

| File | Change |
|------|--------|
| `skills/setup/src/hook.ts` | `computeExpiration()` helper, use in 2 places |
| `skills/setup/src/hook.test.ts` | Test for `statusLeaseSeconds: 0` |
| `skills/setup/src/config.ts` | Default `statusLeaseSeconds: 0` |
| `skills/setup/src/config.test.ts` | Update assertion from 900 to 0 |
| `skills/setup/SKILL.md` | 4 interactive questions, new sample format, emoji preview, updated config |
| `README.md` | Updated examples with Unicode emoji + absolute times, emoji note, auto-close wording |

## Files NOT Changed

- `types.ts` — `capturedAt` already exists, `number` already supports 0
- `slack.ts` — Slack API natively accepts `status_expiration: 0`
- `format.mjs` (deployed) — re-generated per user during setup

## Verification

```bash
cd skills/setup
pnpm typecheck        # No errors
pnpm test             # All pass (including new statusLeaseSeconds=0 test)
pnpm build            # dist/hook.mjs created
node --input-type=module -e "import('file://$(pwd)/dist/hook.mjs').then(() => console.log('OK'))"
```
