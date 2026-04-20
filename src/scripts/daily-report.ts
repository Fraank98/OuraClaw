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
        path: parsed.pathname + parsed.search,
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
  const text = parsed?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error(`Unexpected Claude response: ${raw}`);
  }
  return text;
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
