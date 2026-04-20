#!/usr/bin/env node
// Standalone daily Oura report — fetches data, asks Claude in Italian, prints result to stdout
import https from 'node:https';
import { writeFileSync } from 'node:fs';

const OURA_TOKEN = process.env.OURA_ACCESS_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!OURA_TOKEN) { console.error('OURA_ACCESS_TOKEN non impostato'); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error('ANTHROPIC_API_KEY non impostato'); process.exit(1); }

function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

const today = new Date();
const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
const start = fmt(sevenDaysAgo);
const end = fmt(tomorrow);

async function fetchOura(endpoint) {
  const url = `https://api.ouraring.com/v2/usercollection/${endpoint}?start_date=${start}&end_date=${end}`;
  return request(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${OURA_TOKEN}`, 'Content-Type': 'application/json' }
  }).catch(e => ({ error: e.message }));
}

console.error(`[report] Recupero dati Oura dal ${start} al ${fmt(today)}...`);

const [sleep, readiness, activity, stress] = await Promise.all([
  fetchOura('daily_sleep'),
  fetchOura('daily_readiness'),
  fetchOura('daily_activity'),
  fetchOura('daily_stress'),
]);

console.error('[report] Chiamata a Claude...');

const userContent = `Ecco i miei dati Oura Ring degli ultimi 7 giorni (dal ${start} al ${fmt(today)}):

SONNO:
${JSON.stringify(sleep, null, 2)}

PRONTEZZA (READINESS):
${JSON.stringify(readiness, null, 2)}

ATTIVITÀ:
${JSON.stringify(activity, null, 2)}

STRESS:
${JSON.stringify(stress, null, 2)}

Fornisci un report giornaliero in italiano con:
1. 😴 Qualità del sonno (punteggi e tendenze)
2. ⚡ Prontezza (readiness e consigli)
3. 🏃 Attività fisica
4. 🧠 Stress e recupero
5. 💡 Consigli e osservazioni per oggi`;

const anthropicBody = JSON.stringify({
  model: 'claude-sonnet-4-6',
  max_tokens: 1500,
  system: 'Sei un esperto di salute e benessere personale. Analizza i dati dell\'Oura Ring e fornisci report chiari, pratici e motivanti. Rispondi ESCLUSIVAMENTE in lingua italiana. Usa un tono amichevole e diretto.',
  messages: [{ role: 'user', content: userContent }]
});

const response = await request('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(anthropicBody)
  }
}, anthropicBody);

const reportText = response.content?.[0]?.text;
if (!reportText) { console.error('Risposta Claude vuota:', JSON.stringify(response)); process.exit(1); }

// Write to file so the workflow can read it cleanly
writeFileSync('report.txt', reportText, 'utf8');
console.error('[report] Report salvato in report.txt');
