(() => {
  const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard?';
  const TZ = 'Europe/Istanbul';
  const $ = (s) => document.querySelector(s);
  const list = $('#list'), statusEl = $('#status'), refreshBtn = $('#refresh');
  let day = 0, events = [], timer = null, fetchedAt = null, offline = false;
  const prevScores = new Map(), flash = new Set();

  // ---------- tarih yardımcıları (Türkiye saatine göre) ----------
  const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const shift = (d, n) => new Date(d.getTime() + n * 864e5);
  const dayKey = (n) => ymd(shift(new Date(), n));
  const fmtDay = (n) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'short' }).format(shift(new Date(), n));
  const fmtTime = (iso) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  const fmtLong = (iso) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(iso));
  const compact = (s) => s.replace(/-/g, '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  const espn = (q) => fetchJSON(`${BASE}${q}&_=${Date.now()}`);

  // ---------- günlük veri ----------
  async function load() {
    refreshBtn.classList.add('spin');
    const dates = [];
    for (let n = -2; n <= 2; n++) dates.push(compact(dayKey(n)));
    try {
      const res = await Promise.all(dates.map((d) => espn('dates=' + d)));
      const map = new Map();
      res.forEach((r) => (r.events || []).forEach((e) => map.set(e.id, e)));
      events = [...map.values()];
      fetchedAt = new Date(); offline = false;
    } catch (err) {
      try {
        const snap = await fetchJSON('data/matches.json');
        events = snap.events || [];
        fetchedAt = new Date(snap.updated); offline = true;
      } catch (e2) {
        events = []; fetchedAt = null; offline = true;
        statusEl.textContent = 'Veri alınamadı. Lütfen tekrar deneyin.';
      }
    }
    // gol olduysa kartı vurgula
    events.forEach((e) => {
      const c = e.competitions[0].competitors;
      const sc = c.map((x) => x.score).join('-');
      const old = prevScores.get(e.id);
      if (old && old !== sc && e.status.type.state === 'in') {
        flash.add(e.id);
        setTimeout(() => { flash.delete(e.id); render(); }, 8000);
      }
      prevScores.set(e.id, sc);
    });
    render();
    setTimeout(() => refreshBtn.classList.remove('spin'), 600);
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    const live = events.some((e) => e.status.type.state === 'in');
    timer = setTimeout(load, offline ? 10e3 : live ? 15e3 : 90e3);
  }

  // ---------- canlı dakika (ESPN gecikse de kendi saatimizle ilerler) ----------
  function liveMinute(ev) {
    const st = ev.status, now = Date.now();
    const base = (st.clock || 0) + (fetchedAt ? (now - fetchedAt.getTime()) / 1000 : 0);
    const since = (now - new Date(ev.date).getTime()) / 1000;
    const p2 = st.period >= 2;
    const est = p2 ? Math.max(since - 15 * 60, 45 * 60) : since;
    let sec = Math.max(base, est);
    const cap = p2 ? 90 * 60 : 45 * 60;
    if (sec < 0) sec = 0;
    if (sec <= cap) {
      return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    }
    const extra = Math.min(Math.floor((sec - cap) / 60) + 1, 9);
    return `${cap / 60}+${extra}'`;
  }
  function tickLive() {
    document.querySelectorAll('[data-live]').forEach((el) => {
      const ev = events.find((e) => e.id === el.dataset.live);
      if (ev) el.textContent = liveMinute(ev);
    });
    if (fetchedAt && !offline) {
      const s = Math.max(0, Math.round((Date.now() - fetchedAt.getTime()) / 1000));
      const live = events.some((e) => e.status.type.state === 'in');
      statusEl.innerHTML = `${live ? '<i class="pulse"></i>Canlı · ' : ''}${s < 5 ? 'Şimdi güncellendi' : s + ' sn önce güncellendi'}`;
    }
  }
  setInterval(tickLive, 1000);

  // ---------- kart ----------
  const lum = (h) => { const n = parseInt(h, 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
  const col = (c) => {
    const t = c.team || {}, a = (t.color || '').replace('#', ''), b = (t.alternateColor || '').replace('#', '');
    const ok = (x) => /^[0-9a-f]{6}$/i.test(x) && lum(x) > 60 && lum(x) < 235;
    return '#' + (ok(a) ? a : ok(b) ? b : 'e11d48');
  };
  const sides = (ev) => {
    const comp = ev.competitions[0];
    return [comp.competitors.find((c) => c.homeAway === 'home') || comp.competitors[0],
      comp.competitors.find((c) => c.homeAway === 'away') || comp.competitors[1]];
  };
  const logoHTML = (t, cls = '') => {
    const name = t.shortDisplayName || t.displayName || '?';
    return t.logo
      ? `<img class="${cls}" src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=ph>${esc(name[0])}</div>'">`
      : `<div class="ph ${cls}">${esc(name[0])}</div>`;
  };
  function teamHTML(c, lose) {
    const t = c.team || {};
    return `<div class="team${lose ? ' lose' : ''}">${logoHTML(t)}<span>${esc(t.shortDisplayName || t.displayName || '?')}</span></div>`;
  }

  function goalsHTML(ev, home, away) {
    const det = (ev.competitions[0].details || []).filter((d) => d.scoringPlay);
    if (!det.length) return '';
    const line = (d) => {
      const who = (d.athletesInvolved && d.athletesInvolved[0] && d.athletesInvolved[0].displayName) || 'Gol';
      const tag = d.ownGoal ? ' (K.K.)' : d.penaltyKick ? ' (P)' : '';
      return `<div>⚽ ${esc((d.clock && d.clock.displayValue) || '')} ${esc(who)}${tag}</div>`;
    };
    const h = det.filter((d) => d.team && d.team.id === home.team.id).map(line);
    const a = det.filter((d) => d.team && d.team.id === away.team.id).map(line);
    const rows = [];
    for (let i = 0; i < Math.max(h.length, a.length); i++) rows.push(h[i] || '<div></div>', a[i] || '<div></div>');
    return `<div class="goals">${rows.join('')}</div>`;
  }

  function cardHTML(ev, i) {
    const comp = ev.competitions[0];
    const [home, away] = sides(ev);
    const st = ev.status.type, state = st.state;
    const late = st.name === 'STATUS_POSTPONED' || st.name === 'STATUS_CANCELED';
    let badge, center;
    if (state === 'in') {
      badge = st.name === 'STATUS_HALFTIME'
        ? '<span class="badge live">Devre arası</span>'
        : `<span class="badge live"><span data-live="${esc(ev.id)}">${liveMinute(ev)}</span></span>`;
    } else if (state === 'post') {
      badge = `<span class="badge">${late ? 'Ertelendi' : 'Maç sonu'}</span>`;
    } else {
      badge = `<span class="badge">${late ? 'Ertelendi' : 'Başlamadı'}</span>`;
    }
    if (flash.has(ev.id)) badge = '<span class="badge goal">⚽ GOL!</span>';
    center = state === 'pre'
      ? `<div class="score time"><i>${fmtTime(ev.date)}</i></div>`
      : `<div class="score"><i>${esc(home.score)}</i><em>:</em><i>${esc(away.score)}</i></div>`;
    const done = state === 'post';
    const venue = comp.venue && comp.venue.fullName ? `<div class="venue">📍 ${esc(comp.venue.fullName)}</div>` : '';
    return `<article class="card${state === 'in' ? ' live' : ''}${flash.has(ev.id) ? ' goalflash' : ''}" style="--h:${col(home)};--a:${col(away)};animation-delay:${i * 60}ms">
      <div class="head">${badge}</div>
      <div class="row">${teamHTML(home, done && away.winner)}${center}${teamHTML(away, done && home.winner)}</div>
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
    const todays = events.filter((e) => ymd(new Date(e.date)) === key).sort((a, b) => new Date(a.date) - new Date(b.date));
    list.innerHTML = todays.length
      ? todays.map(cardHTML).join('')
      : `<div class="empty"><b>Bu gün maç yok</b>Süper Lig'de ${day === 0 ? 'bugün' : day < 0 ? 'dün' : 'yarın'} oynanan maç bulunmuyor.</div>`;
    if (fetchedAt && offline) {
      const t = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(fetchedAt);
      statusEl.textContent = `⚠ Canlı veriye ulaşılamadı, eski veri (${t}) · tekrar deneniyor`;
    } else tickLive();
  }

  // ---------- hafta menüsü ----------
  let season = null, selWeek = null, curWeek = null;
  const menu = $('#menu');

  async function loadSeason() {
    if (season) return season;
    const now = new Date();
    const [y, m] = ymd(now).split('-').map(Number);
    const sy = m >= 6 ? y : y - 1;
    let evs;
    try {
      const res = await Promise.all([sy, sy + 1].map((yy) => espn(`dates=${yy}&limit=500`)));
      evs = res.flatMap((r) => r.events || []);
    } catch (e) {
      evs = (await fetchJSON('data/season.json')).events || [];
    }
    const uniq = new Map();
    evs.filter((e) => e.season && e.season.year === sy).forEach((e) => uniq.set(e.id, e));
    const sorted = [...uniq.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
    const cnt = {}, weeks = {};
    sorted.forEach((e) => {
      const ids = e.competitions[0].competitors.map((c) => c.team.id);
      const r = Math.max(...ids.map((i) => cnt[i] || 0)) + 1;
      ids.forEach((i) => (cnt[i] = r));
      (weeks[r] = weeks[r] || []).push(e);
    });
    const today = dayKey(0);
    const nums = Object.keys(weeks).map(Number).sort((a, b) => a - b);
    const cur = nums.find((n) => weeks[n].some((e) => ymd(new Date(e.date)) >= today)) || nums[nums.length - 1];
    season = { weeks, nums, cur };
    return season;
  }

  function weekMatchHTML(ev) {
    const [home, away] = sides(ev);
    const st = ev.status.type, state = st.state;
    const late = st.name === 'STATUS_POSTPONED' || st.name === 'STATUS_CANCELED';
    const row = (c, win) => `<div class="mt${win ? ' win' : ''}">${logoHTML(c.team, 'sm')}<span>${esc(c.team.shortDisplayName || c.team.displayName)}</span><b>${state === 'pre' ? '' : esc(c.score)}</b></div>`;
    const tag = state === 'in' ? '<em class="tag live">Canlı</em>' : late ? '<em class="tag">Ertelendi</em>' : state === 'post' ? '<em class="tag">MS</em>' : '';
    return `<div class="wm${state === 'in' ? ' live' : ''}">
      <div class="when"><strong>${fmtTime(ev.date)}</strong>${tag}</div>
      <div class="teams">${row(home, state === 'post' && home.winner)}${row(away, state === 'post' && away.winner)}</div>
    </div>`;
  }

  function renderWeek() {
    const { weeks, nums, cur } = season;
    $('#current').innerHTML = `<div class="cur-card"><span class="cur-badge">Güncel hafta</span><b>${cur}. Hafta</b>${selWeek !== cur ? '<button class="link-btn" data-goto="' + cur + '">Güncele dön</button>' : ''}</div>`;
    $('#weeks').innerHTML = nums.map((n) =>
      `<button role="tab" data-week="${n}" class="${n === cur ? 'is-cur' : ''}" aria-selected="${n === selWeek}">${n}</button>`).join('');
    const evs = weeks[selWeek] || [];
    const groups = new Map();
    evs.forEach((e) => { const k = fmtLong(e.date); (groups.get(k) || groups.set(k, []).get(k)).push(e); });
    $('#weekList').innerHTML = `<h3 class="wk-title">${selWeek}. Hafta${selWeek === cur ? ' <span class="cur-badge">Güncel</span>' : ''}</h3>` +
      [...groups].map(([k, g]) => `<section class="dgroup"><h4>${esc(k)}</h4>${g.map(weekMatchHTML).join('')}</section>`).join('');
    const active = $('#weeks [aria-selected="true"]');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });
    $('#weekList').scrollTop = 0;
  }

  async function openMenu() {
    menu.hidden = false;
    document.body.classList.add('lock');
    requestAnimationFrame(() => menu.classList.add('open'));
    $('#weekList').innerHTML = '<div class="skel" style="height:90px;margin:12px 0"></div><div class="skel" style="height:90px"></div>';
    try {
      await loadSeason();
      if (selWeek === null) selWeek = season.cur;
      renderWeek();
    } catch (e) {
      $('#weekList').innerHTML = '<div class="empty"><b>Fikstür alınamadı</b>Lütfen daha sonra tekrar deneyin.</div>';
    }
  }
  function closeMenu() {
    menu.classList.remove('open');
    document.body.classList.remove('lock');
    setTimeout(() => { menu.hidden = true; }, 260);
  }
  $('#menuBtn').addEventListener('click', () => { selWeek = null; openMenu(); });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeMenu();
    const w = e.target.closest('[data-week],[data-goto]');
    if (w) { selWeek = +(w.dataset.week || w.dataset.goto); renderWeek(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) closeMenu(); });


  // ---------- puan durumu ----------
  const tsheet = $('#tableSheet'), tbody = $('#tableBody');
  async function openTable() {
    tsheet.hidden = false;
    document.body.classList.add('lock');
    requestAnimationFrame(() => tsheet.classList.add('open'));
    tbody.innerHTML = '<div class="skel" style="height:300px"></div>';
    try {
      const j = await fetchJSON('https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings?_=' + Date.now());
      const rows = (j.children[0].standings.entries || []).map((e) => {
        const st = {}; e.stats.forEach((x) => (st[x.name] = x));
        const v = (k) => (st[k] ? st[k].displayValue : '-');
        return { rank: +v('rank') || 99, t: e.team, c: e.note && e.note.color, g: e.note && e.note.description, o: v('gamesPlayed'), w: v('wins'), d: v('ties'), l: v('losses'), av: v('pointDifferential'), p: v('points') };
      }).sort((a, b) => a.rank - b.rank);
      const legend = [...new Map(rows.filter((r) => r.g).map((r) => [r.g, r.c])).entries()];
      tbody.innerHTML = `<div class="pt"><div class="pr ph0"><span>#</span><span>Takım</span><span>O</span><span>G</span><span>B</span><span>M</span><span>Av</span><span>P</span></div>
        ${rows.map((r) => `<div class="pr"><span class="rk" style="--z:${esc(r.c || 'transparent')}">${r.rank}</span><span class="tn">${r.t.logos && r.t.logos[0] ? `<img src="${esc(r.t.logos[0].href)}" alt="" loading="lazy">` : ''}${esc(r.t.shortDisplayName || r.t.displayName)}</span><span>${esc(r.o)}</span><span>${esc(r.w)}</span><span>${esc(r.d)}</span><span>${esc(r.l)}</span><span>${esc(r.av)}</span><b>${esc(r.p)}</b></div>`).join('')}</div>
        <div class="lg">${legend.map(([g, c]) => `<span><i style="background:${esc(c)}"></i>${esc(g)}</span>`).join('')}</div>`;
    } catch (e) {
      tbody.innerHTML = '<div class="empty"><b>Puan durumu alınamadı</b>Lütfen daha sonra tekrar deneyin.</div>';
    }
  }
  function closeTable() {
    tsheet.classList.remove('open');
    document.body.classList.remove('lock');
    setTimeout(() => { tsheet.hidden = true; }, 260);
  }
  $('#tableBtn').addEventListener('click', openTable);
  tsheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeTable(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !tsheet.hidden) closeTable(); });

  // ---------- olaylar ----------
  document.querySelectorAll('.tabs button').forEach((b) =>
    b.addEventListener('click', () => { day = +b.dataset.day; render(); }));
  refreshBtn.addEventListener('click', () => { statusEl.textContent = 'Yenileniyor…'; load(); });
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
