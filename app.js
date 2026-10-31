(() => {
  const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?dates=';
  const TZ = 'Europe/Istanbul';
  const $ = (s) => document.querySelector(s);
  const list = $('#list'), statusEl = $('#status');
  let day = 0, events = [], timer = null, updated = null, offline = false;

  // ---------- tarih yardımcıları (Türkiye saatine göre) ----------
  const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // 2026-10-31
  const shift = (d, n) => new Date(d.getTime() + n * 864e5);
  const dayKey = (n) => ymd(shift(new Date(), n));
  const fmtDay = (n) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'short' }).format(shift(new Date(), n));
  const fmtTime = (iso) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

  // ---------- veri ----------
  const compact = (s) => s.replace(/-/g, '');
  async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function load() {
    // UTC/TR gün farkı için komşu günleri de çekip Türkiye gününe göre süzüyoruz
    const dates = [];
    for (let n = -2; n <= 2; n++) dates.push(compact(dayKey(n)));
    try {
      const res = await Promise.all(dates.map((d) => fetchJSON(API + d)));
      const map = new Map();
      res.forEach((r) => (r.events || []).forEach((e) => map.set(e.id, e)));
      events = [...map.values()];
      updated = new Date(); offline = false;
    } catch (err) {
      try {
        const snap = await fetchJSON('data/matches.json');
        events = snap.events || [];
        updated = new Date(snap.updated); offline = true;
      } catch (e2) {
        events = []; updated = null; offline = true;
        statusEl.textContent = 'Veri alınamadı. Lütfen tekrar deneyin.';
      }
    }
    render();
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    const live = events.some((e) => e.status.type.state === 'in');
    timer = setTimeout(load, live ? 30e3 : 120e3);
  }

  // ---------- görünüm ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function teamHTML(c, lose) {
    const t = c.team || {};
    const name = t.shortDisplayName || t.displayName || '?';
    const logo = t.logo
      ? `<img src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=ph>${esc(name[0])}</div>'">`
      : `<div class="ph">${esc(name[0])}</div>`;
    return `<div class="team${lose ? ' lose' : ''}">${logo}<span>${esc(name)}</span></div>`;
  }

  function goalsHTML(ev, home, away) {
    const det = (ev.competitions[0].details || []).filter((d) => d.scoringPlay);
    if (!det.length) return '';
    const line = (d) => {
      const who = (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || 'Gol';
      const tag = d.ownGoal ? ' (K.K.)' : d.penaltyKick ? ' (P)' : '';
      return `<div>⚽ ${esc(who)}${tag} ${esc((d.clock && d.clock.displayValue) || '')}</div>`;
    };
    const h = det.filter((d) => d.team && d.team.id === home.team.id).map(line);
    const a = det.filter((d) => d.team && d.team.id === away.team.id).map(line);
    const rows = [];
    for (let i = 0; i < Math.max(h.length, a.length); i++) rows.push(h[i] || '<div></div>', a[i] || '<div></div>');
    return `<div class="goals">${rows.join('')}</div>`;
  }

  function cardHTML(ev, i) {
    const comp = ev.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === 'home') || comp.competitors[0];
    const away = comp.competitors.find((c) => c.homeAway === 'away') || comp.competitors[1];
    const st = ev.status.type, state = st.state; // pre | in | post
    let badge, center;
    if (state === 'in') {
      const half = st.name === 'STATUS_HALFTIME';
      badge = `<span class="badge live">${half ? 'Devre arası' : esc(ev.status.displayClock || 'Canlı')}</span>`;
    } else if (state === 'post') {
      const late = st.name === 'STATUS_POSTPONED' || st.name === 'STATUS_CANCELED';
      badge = `<span class="badge">${late ? 'Ertelendi' : 'Maç sonu'}</span>`;
    } else {
      badge = `<span class="badge">${st.name === 'STATUS_POSTPONED' ? 'Ertelendi' : 'Başlamadı'}</span>`;
    }
    if (state === 'pre') {
      center = `<div class="score time">${fmtTime(ev.date)}</div>`;
    } else {
      center = `<div class="score">${esc(home.score)} - ${esc(away.score)}</div>`;
    }
    const done = state === 'post';
    const hl = done && away.winner, al = done && home.winner;
    const venue = comp.venue && comp.venue.fullName ? `<div class="venue">${esc(comp.venue.fullName)}</div>` : '';
    return `<article class="card${state === 'in' ? ' live' : ''}" style="animation-delay:${i * 40}ms">
      <div class="head"><span>${fmtTime(ev.date)}</span>${badge}</div>
      <div class="row">${teamHTML(home, hl)}${center}${teamHTML(away, al)}</div>
      ${goalsHTML(ev, home, away)}${venue}
    </article>`;
  }

  function render() {
    [-1, 0, 1].forEach((n) => {
      const b = document.querySelector(`[data-day="${n}"] span`);
      if (b) b.textContent = fmtDay(n);
    });
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.day === day)));
    const key = dayKey(day);
    const todays = events
      .filter((e) => ymd(new Date(e.date)) === key)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!todays.length) {
      list.innerHTML = `<div class="empty"><b>Bu gün maç yok</b>Süper Lig'de ${day === 0 ? 'bugün' : day < 0 ? 'dün' : 'yarın'} oynanan maç bulunmuyor.</div>`;
    } else {
      list.innerHTML = todays.map(cardHTML).join('');
    }
    if (updated) {
      const t = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(updated);
      statusEl.textContent = offline ? `Önbellek verisi · ${t}` : `Güncellendi ${t}`;
    }
  }

  // ---------- olaylar ----------
  document.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => { day = +b.dataset.day; render(); }));
  $('#refresh').addEventListener('click', () => { statusEl.textContent = 'Yenileniyor…'; load(); });
  $('#theme').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    localStorage.setItem('theme', t);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

  list.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  render();
  load();
})();
