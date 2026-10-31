# Canlı Maç

Trendyol Süper Lig için dün / bugün / yarın maçları. Saf HTML + CSS + JS (build yok), GitHub Pages'e doğrudan yayınlanır.

- Veri: ESPN herkese açık skor API'si, tarayıcıdan çekilir; canlı maç varsa 30 sn'de bir yenilenir.
- Yedek: `node scripts/scrape.mjs` → `data/matches.json` (API erişilemezse kullanılır).
- Açık/koyu tema, tam responsive.
