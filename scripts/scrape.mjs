// Süper Lig verisini ESPN'den çekip data/matches.json olarak kaydeder (yedek/önbellek).
// Kullanım: node scripts/scrape.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=';
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
const drop = new Set(['links', 'odds', 'records', 'leaders', 'statistics', 'headlines', 'broadcasts', 'geoBroadcasts', 'tickets']);

const map = new Map();
for (let n = -2; n <= 2; n++) {
  const r = await fetch(API + day(n));
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  for (const e of (await r.json()).events ?? []) map.set(e.id, e);
}
await mkdir('data', { recursive: true });
const out = JSON.stringify({ updated: new Date().toISOString(), events: [...map.values()] },
  (k, v) => (drop.has(k) ? undefined : v));
await writeFile('data/matches.json', out);
console.log(`${map.size} maç kaydedildi`);

// Sezon fikstürü (hafta menüsü için yedek)
const now = new Date(), y = now.getUTCFullYear(), sy = now.getUTCMonth() >= 5 ? y : y - 1;
const season = new Map();
for (const yy of [sy, sy + 1]) {
  const r = await fetch(`${API}${yy}&limit=500`);
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  for (const e of (await r.json()).events ?? []) if (e.season?.year === sy) season.set(e.id, e);
}
drop.add('details');
await writeFile('data/season.json', JSON.stringify({ updated: new Date().toISOString(), events: [...season.values()] },
  (k, v) => (drop.has(k) ? undefined : v)));
console.log(`${season.size} sezon maçı kaydedildi`);
