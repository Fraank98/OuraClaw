# Daily Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a daily GitHub Actions job that fetches Oura data, asks Claude for an Italian plain-text summary, and sends it to Telegram.

**Architecture:** A new script `src/scripts/daily-report.ts` imports the existing `fetchOuraData()` to pull sleep (today) and readiness/activity/stress (yesterday), calls the Anthropic Messages API via `https`, and posts the result to Telegram via `https`. The existing workflow file is replaced with correct Node.js steps.

**Tech Stack:** TypeScript, Node.js built-in `https`, Anthropic API v1/messages, Telegram Bot API, GitHub Actions

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/scripts/daily-report.ts` | Fetch Oura data, call Claude, send Telegram message |
| Modify | `.github/workflows/daily_report.yml` | Replace broken Swift steps with Node.js steps |

`tsconfig.json` already includes `src/**/*` so `src/scripts/daily-report.ts` compiles to `dist/scripts/daily-report.js` without changes.

---

## Task 1: Write the daily report script

**Files:**
- Create: `src/scripts/daily-report.ts`

- [ ] **Step 1: Write `src/scripts/daily-report.ts`**

```typescript
import https from "https";
import { fetchOuraData } from "../oura-client";
import {
  DailyActivity,
  DailyReadiness,
  DailySleep,
  DailyStress,
} from "../types";

function dateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

function httpsPost(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function callClaude(
  apiKey: string,
  userMessage: string,
): Promise<string> {
  const raw = await httpsPost(
    "https://api.anthropic.com/v1/messages",
    {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "Sei un assistente di salute personale. Analizza i dati Oura Ring forniti e scrivi un riassunto giornaliero in italiano. Scrivi in testo semplice senza markdown, senza asterischi, senza simboli di formattazione. Sii diretto e chiaro.",
      messages: [{ role: "user", content: userMessage }],
    },
  );
  const parsed = JSON.parse(raw);
  return parsed.content[0].text as string;
}

async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
): Promise<void> {
  await httpsPost(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {},
    { chat_id: chatId, text },
  );
}

async function main(): Promise<void> {
  const ouraToken = process.env.OURA_ACCESS_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const telegramToken = process.env.TELEGRAM_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!ouraToken || !anthropicKey || !telegramToken || !telegramChatId) {
    throw new Error(
      "Missing required env vars: OURA_ACCESS_TOKEN, ANTHROPIC_API_KEY, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID",
    );
  }

  const today = dateString(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dateString(yesterdayDate);

  console.log(`Fetching Oura data — sleep: ${today}, rest: ${yesterday}`);

  const [sleep, readiness, activity, stress] = await Promise.all([
    fetchOuraData<DailySleep>(ouraToken, "daily_sleep", today, today),
    fetchOuraData<DailyReadiness>(ouraToken, "daily_readiness", yesterday, yesterday),
    fetchOuraData<DailyActivity>(ouraToken, "daily_activity", yesterday, yesterday),
    fetchOuraData<DailyStress>(ouraToken, "daily_stress", yesterday, yesterday),
  ]);

  const userMessage = `Ecco i dati Oura Ring:

SONNO (notte del ${today}):
${JSON.stringify(sleep.data, null, 2)}

PRONTEZZA (${yesterday}):
${JSON.stringify(readiness.data, null, 2)}

ATTIVITÀ (${yesterday}):
${JSON.stringify(activity.data, null, 2)}

STRESS (${yesterday}):
${JSON.stringify(stress.data, null, 2)}

Scrivi un riassunto della giornata e della notte in italiano, in testo semplice senza markdown.`;

  console.log("Calling Claude...");
  const report = await callClaude(anthropicKey, userMessage);

  console.log("Sending to Telegram...");
  await sendTelegram(telegramToken, telegramChatId, report);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/dany/Developer/OuraClaw
npm run build
```

Expected: no errors, `dist/scripts/daily-report.js` is created.

If you see `error TS2307: Cannot find module '../oura-client'` — check that the file is at `src/scripts/daily-report.ts` (not `scripts/daily-report.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/scripts/daily-report.ts
git commit -m "feat: add daily report script"
```

---

## Task 2: Fix the GitHub Actions workflow

**Files:**
- Modify: `.github/workflows/daily_report.yml`

- [ ] **Step 1: Replace the workflow file content**

Replace the entire contents of `.github/workflows/daily_report.yml` with:

```yaml
name: OuraClaw Daily Report

on:
  schedule:
    - cron: '0 8 * * *'
  workflow_dispatch:

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Run daily report
        env:
          OURA_ACCESS_TOKEN: ${{ secrets.OURA_ACCESS_TOKEN }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          TELEGRAM_TOKEN: ${{ secrets.TELEGRAM_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
        run: node dist/scripts/daily-report.js
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/daily_report.yml
git commit -m "fix: update daily report workflow to use Node.js"
git push
```

- [ ] **Step 3: Trigger manually to verify**

Go to the GitHub repo → Actions → "OuraClaw Daily Report" → "Run workflow". Check the run logs for:
```
Fetching Oura data — sleep: <today>, rest: <yesterday>
Calling Claude...
Sending to Telegram...
Done.
```

And verify the Telegram message arrives in your chat.

---

## Self-Review Notes

- Spec requires sleep=today, readiness/activity/stress=yesterday ✓
- Italian plain text, no markdown — handled via system prompt ✓
- All 4 secrets already in repo ✓
- Error exits with `process.exit(1)` so workflow run fails visibly ✓
- No placeholder steps, all code is complete ✓
- `fetchOuraData` signature matches `src/oura-client.ts` exactly ✓
