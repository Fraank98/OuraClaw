# Daily Report – Design Spec

**Date:** 2026-04-20

## Goal

Run a daily morning report via GitHub Actions that fetches Oura Ring health data and sends a plain-text Italian summary to Telegram.

## Data Fetched

| Endpoint | Date |
|---|---|
| `daily_sleep` | today (Oura assigns last night's sleep to the wake-up day) |
| `daily_readiness` | yesterday |
| `daily_activity` | yesterday |
| `daily_stress` | yesterday |

## Architecture

A new standalone script `scripts/daily-report.ts` is the sole entry point. It:

1. Calculates `today` and `yesterday` as `YYYY-MM-DD` strings at runtime
2. Calls the existing `fetchOuraData()` from `src/oura-client.ts` four times with the date ranges above, using `OURA_ACCESS_TOKEN` from env
3. Bundles all four results into one JSON object
4. Sends the JSON to Claude API (`claude-sonnet-4-6`) with a system prompt instructing it to write a daily health summary in Italian, plain text, no markdown
5. Posts Claude's response to Telegram via the Bot API (`sendMessage`)

No new abstractions. The script is self-contained and can be run locally with the right env vars.

## GitHub Actions Workflow

`daily_report.yml` is updated to:

```
checkout → npm ci → npx tsc → node dist/scripts/daily-report.js
```

Trigger: `schedule: cron: '0 8 * * *'` + `workflow_dispatch`

Runs on: `ubuntu-latest`

## Secrets Required

All already configured in the repo:

- `OURA_ACCESS_TOKEN` — Oura Personal Access Token
- `ANTHROPIC_API_KEY` — Claude API key
- `TELEGRAM_TOKEN` — Telegram bot token
- `TELEGRAM_CHAT_ID` — Target chat ID

## Error Handling

- If any Oura fetch fails (non-2xx), the script logs the error and exits with code 1 (fails the workflow run visibly)
- If Claude API fails, same behavior
- If Telegram send fails, same behavior
- No silent failures

## Out of Scope

- OAuth token refresh (Personal Access Token doesn't expire)
- Evening report
- Multiple Telegram recipients
- Retry logic
