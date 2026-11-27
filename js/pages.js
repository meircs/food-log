'use strict';
/* Bevel-style detail pages opened from Home:
   - full pages for Strain, Recovery, Sleep, Stress and Energy Bank (Body Battery)
   - metric sheets (value vs your normal range, chart with 30D/3M/6M/1Y, trends analysis)
   - Cardio and Muscular Load sheet
   Everything is computed from the Garmin data already synced; the Body Battery
   and heart-rate day curves come from data/intraday/<date>.json when present. */

// ---------- small helpers ----------
const fmtHM = m => m == null ? '–' : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
const fmtClock = m => { if (m == null) return '–'; m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const hmToMin = t => t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null;
const daysBack = (end, n) => Array.from({ length: n }, (_, i) => addDays(end, -(n - 1) + i));
// Sleep need (hours a night) for the sleep bank and target bedtime: your own setting, or worked out
// as the typical sleep before mornings when recovery was high (66%+), from the last 90 days.
function sleepNeed() {
  if (settings.sleepNeed) return { h: settings.sleepNeed, auto: false };
  const good = daysBack(addDays(todayStr(), -1), 90).filter(d => H(d, 'hrs') != null && (scoreOn(d).recovery ?? 0) >= 66).map(d => H(d, 'hrs')).sort((a, b) => a - b);
  if (good.length < 6) return { h: 8, auto: true, n: good.length, fallback: true };
  const med = good[Math.floor(good.length / 2)];
  return { h: Math.max(6.5, Math.min(9.5, Math.round(med * 4) / 4)), auto: true, n: good.length };
}
const needTxt = n => `${Math.floor(n.h)}h${n.h % 1 ? ' ' + pad(Math.round(n.h % 1 * 60)) + 'm' : ''}`;

// Score history (Strain/Recovery/Sleep per day), memoised until new data arrives.
let _scoreMemo = { key: '', m: {} };
function scoreOn(d) {
  const key = Object.keys(health).length + ':' + acts.length + ':' + todayStr() + ':' + JSON.stringify(store.get('actStatus', null));
  if (_scoreMemo.key !== key) _scoreMemo = { key, m: {} };
  return _scoreMemo.m[d] || (_scoreMemo.m[d] = homeScores(d));
}
const H = (d, k) => (health[d] || {})[k] ?? null;
const exMin = d => { const a = acts.filter(x => x.date === d); return a.length ? a.reduce((s, x) => s + (x.dur || 0), 0) : (health[d] ? 0 : null); };
function sleepBank(d) {
  const v = daysBack(d, 7).map(x => H(x, 'hrs')).filter(x => x != null);
  const need = sleepNeed().h; return v.length >= 3 ? v.reduce((s, x) => s + (x - need), 0) * 60 : null;
}
const bedClock = d => { const m = hmToMin(H(d, 'bed')); return m == null ? null : m < 720 ? m + 1440 : m; };   // after-midnight bedtimes sort after 23:59

// ---------- metric registry ----------
// get(d) -> number|null; fmt(v) -> text; good: 'up' | 'down' | null (which direction is better)
const M = {
  strain:   { n: 'Strain', u: '%', get: d => scoreOn(d).strain, fmt: v => r0(v), good: null, c: '#f59a2a',
              info: 'How hard your heart worked during the day: minutes in higher heart-rate zones count more, plus everyday steps. 0–100, and the scale flattens near the top.' },
  strainPerf: { n: 'Strain performance', u: '%', get: d => { const s = scoreOn(d); return s.strain == null ? null : s.strain - s.target; }, fmt: v => (v > 0 ? '+' : '') + r0(v), good: null, c: '#8a7cf0',
              info: 'Strain minus the day\'s target. Near zero means you matched what your recovery allowed.' },
  recovery: { n: 'Recovery', u: '%', get: d => scoreOn(d).recovery, fmt: v => r0(v), good: 'up', c: '#5fc21a',
              info: 'How ready your body is for effort: HRV and resting heart rate against your last 30 days, last night\'s sleep, and Body Battery at its peak.' },
  sleep:    { n: 'Sleep score', u: '', get: d => H(d, 'score'), fmt: v => r0(v), good: 'up', c: '#6e5ae6', info: 'Garmin\'s sleep score (0–100) for the night ending that morning.' },
  resp:     { n: 'Respiratory Rate', short: 'RR', u: 'rpm', get: d => H(d, 'resp'), fmt: v => r1(v), good: null, c: '#3fc28a',
              info: 'Breaths per minute, averaged over the day and night. It is usually very stable, so a clear rise can be an early sign of illness, overtraining, alcohol or altitude.' },
  rhr:      { n: 'Resting HR', short: 'RHR', u: 'bpm', get: d => H(d, 'rhr'), fmt: v => r0(v), good: 'down', c: '#e5484d',
              info: 'Your heart rate at full rest. Lower generally means a fitter heart. A jump of 5+ bpm above your normal often means fatigue, stress, alcohol or getting sick.' },
  hrv:      { n: 'Resting HRV', short: 'HRV', u: 'ms', get: d => H(d, 'hrv'), fmt: v => r0(v), good: 'up', c: '#4c9be8',
              info: 'Overnight heart-rate variability: the small changes in time between heartbeats. Higher than your own normal means well recovered; a drop can mean poor sleep, stress or hard training. Compare with yourself, not with others.' },
  spo2:     { n: 'Oxygen Saturation', short: 'SpO2', u: '%', get: d => H(d, 'spo2'), fmt: v => r1(v), good: 'up', c: '#38b6d8',
              info: 'How much oxygen your blood carries, measured at the wrist. 95–100% is typical; wrist readings run lower and vary with fit and movement.' },
  hrs:      { n: 'Time Asleep', u: '', get: d => H(d, 'hrs') == null ? null : H(d, 'hrs') * 60, fmt: v => fmtHM(v), good: 'up', c: '#6e5ae6',
              info: 'Total time in light, deep and REM sleep. Adults usually need 7–9 hours. Going to bed earlier and cutting late caffeine, food and alcohol help most.' },
  inbed:    { n: 'Time in Bed', u: '', get: d => H(d, 'hrs') == null ? null : (H(d, 'hrs') + (H(d, 'awake') || 0)) * 60, fmt: v => fmtHM(v), good: null, c: '#8a7cf0', info: 'Time asleep plus time awake during the night.' },
  deep:     { n: 'Deep Sleep', u: '', get: d => H(d, 'deep') == null ? null : H(d, 'deep') * 60, fmt: v => fmtHM(v), good: 'up', c: '#3c5fb8',
              info: 'Deep sleep is when the body repairs muscle and restores energy. It comes mostly in the first half of the night, so a late bedtime cuts it most.' },
  rem:      { n: 'REM Sleep', u: '', get: d => H(d, 'rem') == null ? null : H(d, 'rem') * 60, fmt: v => fmtHM(v), good: 'up', c: '#c070b0',
              info: 'REM sleep supports memory and mood. It comes mostly in the last hours of the night, so waking early and alcohol cut it most.' },
  light:    { n: 'Light Sleep', u: '', get: d => H(d, 'light') == null ? null : H(d, 'light') * 60, fmt: v => fmtHM(v), good: null, c: '#628ee0', info: 'Light sleep makes up about half the night and links the other stages.' },
  awake:    { n: 'Awake Time', u: 'min', get: d => H(d, 'awake') == null ? null : H(d, 'awake') * 60, fmt: v => r0(v), good: 'down', c: '#c9922c', info: 'Minutes awake after first falling asleep.' },
  sleepHr:  { n: 'Sleeping HR', u: 'bpm', get: d => H(d, 'sleepHr'), fmt: v => r0(v), good: 'down', c: '#e5484d', info: 'Average heart rate while asleep. It rises after alcohol, late meals, hard evening workouts and illness.' },
  sleepStress: { n: 'Sleep Stress', u: '', get: d => H(d, 'sleepStress'), fmt: v => r0(v), good: 'down', c: '#3fb3a8', info: 'Average stress level while asleep. Low (under ~15) means your body was able to switch off.' },
  bank:     { n: 'Sleep Bank', u: '', get: d => sleepBank(d), fmt: v => (v < 0 ? '−' : '+') + fmtHM(Math.abs(v)), good: 'up', c: '#e8963c',
              get info() { return `Sleep over the last 7 nights minus your sleep need (${needTxt(sleepNeed())} a night). Negative means sleep debt; a couple of earlier nights pays it back.`; } },
  bed:      { n: 'Bedtime', u: '', get: d => bedClock(d), fmt: v => fmtClock(v), good: null, c: '#8a7cf0', info: 'When you fell asleep. A steady bedtime (within about 30 minutes) improves sleep quality.' },
  wake:     { n: 'Wake Time', u: '', get: d => hmToMin(H(d, 'wake')), fmt: v => fmtClock(v), good: null, c: '#f2b51d', info: 'When you woke up for the day.' },
  stress:   { n: 'Stress Score', u: '', get: d => H(d, 'stress'), fmt: v => r0(v), good: 'down', c: '#3fb3a8',
              info: 'Garmin\'s average stress for the day (0–100), from heart-rate variability. 0–25 rest, 26–50 low, 51–75 medium, 76–100 high. Exercise is not counted.' },
  maxStress:{ n: 'Highest Stress', u: '', get: d => H(d, 'maxStress'), fmt: v => r0(v), good: 'down', c: '#e5484d', info: 'The highest stress reading of the day.' },
  restMin:  { n: 'Rest Time', u: '', get: d => H(d, 'sRest'), fmt: v => fmtHM(v), good: 'up', c: '#4c9be8', info: 'Time in the rest zone (stress 0–25), mostly sleep and quiet time.' },
  steps:    { n: 'Step Count', u: '', get: d => H(d, 'steps'), fmt: v => fmt(v), good: 'up', c: '#f59a2a', info: 'Steps for the day from your watch.' },
  energy:   { n: 'Total Energy', u: 'kcal', get: d => H(d, 'total') ?? (garmin[d] || {}).total ?? null, fmt: v => fmt(v), good: null, c: '#f59a2a', info: 'Calories burned for the day: resting metabolism plus activity.' },
  exercise: { n: 'Exercise Duration', u: '', get: d => exMin(d), fmt: v => fmtHM(v), good: 'up', c: '#f59a2a', info: 'Total time of recorded workouts.' },
  bbHi:     { n: 'Energy Peak', u: '', get: d => H(d, 'bbHi'), fmt: v => r0(v), good: 'up', c: '#f2b51d', info: 'Body Battery at its highest, usually right after sleep. Above ~75 is a well-charged morning.' },
  bbLo:     { n: 'Energy Low', u: '', get: d => H(d, 'bbLo'), fmt: v => r0(v), good: 'up', c: '#c9922c', info: 'Body Battery at its lowest, usually at bedtime.' },
  bbCh:     { n: 'Total Charged', u: '', get: d => H(d, 'bbCh'), fmt: v => '+' + r0(v), good: 'up', c: '#5fc21a', info: 'Body Battery gained, mostly from sleep and rest.' },
  bbDr:     { n: 'Total Drained', u: '', get: d => H(d, 'bbDr'), fmt: v => '−' + r0(v), good: null, c: '#e5484d', info: 'Body Battery used by activity and stress.' },
};
const MIN_KEYS = ['hrs', 'inbed', 'deep', 'rem', 'light', 'bank', 'bed', 'wake', 'restMin', 'exercise'];
const MON_KEYS = ['resp', 'rhr', 'hrv', 'spo2', 'hrs', 'stress'];

// Your normal range: mean ± 1 sd of the 30 days before d (needs 7 days of data).
function normalOf(k, d) {
  const v = daysBack(addDays(d, -1), 30).map(x => M[k].get(x)).filter(x => x != null);
  if (v.length < 7) return null;
  const m = mean(v), s = sd(v) || Math.abs(m) * 0.05 || 1;
  return { lo: m - s, hi: m + s, m, s, n: v.length };
}
function statusOf(k, d, v = M[k].get(d)) {
  const nr = normalOf(k, d);
  if (v == null || !nr) return { t: v == null ? 'No data' : 'Building your range', c: 'var(--muted)', ic: '' };
  const g = M[k].good;
  if (v > nr.hi) return g === 'up' ? { t: 'Above normal', c: '#3fb37f', ic: '✓' } : g === 'down' ? { t: 'Above normal', c: '#e5484d', ic: '!' } : { t: 'Above normal', c: '#4c9be8', ic: '↑' };
  if (v < nr.lo) return g === 'down' ? { t: 'Below normal', c: '#3fb37f', ic: '✓' } : g === 'up' ? { t: 'Below normal', c: '#e5484d', ic: '!' } : { t: 'Below normal', c: '#4c9be8', ic: '↓' };
  return { t: 'Normal range', c: '#3fb37f', ic: '✓' };
}
function roll7(k, d) { const v = daysBack(d, 7).map(x => M[k].get(x)).filter(x => x != null); return v.length >= 3 ? mean(v) : null; }

// ---------- tiny charts ----------
function sparkSVG(vals, color, w = 120, h = 44) {
  const pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null);
  if (pts.length < 2) return `<svg viewBox="0 0 ${w} ${h}" class="spark"></svg>`;
  const lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1])), rg = hi - lo || 1;
  const X = i => 2 + i / (vals.length - 1) * (w - 10), Y = v => h - 4 - (v - lo) / rg * (h - 10);
  const line = pts.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const last = pts[pts.length - 1], id = 'sp' + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 ${w} ${h}" class="spark"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line}L${X(last[0]).toFixed(1)},${h}L${X(pts[0][0]).toFixed(1)},${h}Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="3.5" fill="var(--card)" stroke="${color}" stroke-width="2"/></svg>`;
}
function trendCard(k, d) {
  const v = M[k].get(d), st = statusOf(k, d, v);
  return `<button class="ptrend" data-met="${k}"><div class="ptl"><div class="ptn">${esc(M[k].n)}</div>
    <div class="ptv">${v == null ? 'No data' : esc(M[k].fmt(v))}${v != null && M[k].u ? `<small> ${M[k].u}</small>` : ''}</div>
    <div class="pts" style="color:${st.c}">${st.ic ? `<i style="background:${st.c}">${st.ic}</i>` : ''}${st.t}</div></div>
    ${sparkSVG(daysBack(d, 30).map(x => M[k].get(x)), M[k].c)}<span class="parr">›</span></button>`;
}
function tile(label, value, sub) { return `<div class="ptile"><div class="ptk">${label}</div><div class="ptvv">${value}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`; }
function wireTrends(root, d, group) { root.querySelectorAll('[data-met]').forEach(b => b.onclick = () => openMetric(b.dataset.met, d, group)); }

// ---------- full pages ----------
// A page slides in from the right over the app, with a back button; swipe from the left edge to go back.
function openPage(title, html, mount, tint) {
  const old = $('#pg'); if (old) old.remove();
  const pg = document.createElement('div'); pg.className = 'page'; pg.id = 'pg';
  pg.style.setProperty('--tint', tint || 'transparent');
  pg.innerHTML = `<div class="pghead"><button class="pgback" aria-label="Back">‹</button><div class="pgtitle">${esc(title)}</div><span style="width:38px"></span></div><div class="pgbody">${html}<div style="height:40px"></div></div>`;
  document.body.appendChild(pg); lockPage();
  const close = () => { pg.classList.add('out'); setTimeout(() => { pg.remove(); if (!$('#bd')) unlockPage(); }, 240); };
  pg.querySelector('.pgback').onclick = close;
  pg.addEventListener('scroll', () => pg.classList.toggle('scrolled', pg.scrollTop > 120), { passive: true });
  let x0 = null, dx = 0;
  pg.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX < 28 ? t.clientX : null; dx = 0; }, { passive: true });
  pg.addEventListener('touchmove', e => { if (x0 == null) return; dx = Math.max(0, e.touches[0].clientX - x0); pg.style.transform = `translateX(${dx}px)`; pg.style.transition = 'none'; }, { passive: true });
  pg.addEventListener('touchend', () => { if (x0 == null) return; pg.style.transition = ''; if (dx > 90) close(); else pg.style.transform = ''; x0 = null; });
  mount && mount(pg);
  return pg;
}
function bigRing(pct, c1, c2, label, target) {
  return `<div class="pring">${ringSVGHome('big' + label, pct, c1, c2, target).replace('class="hring"', 'class="hring pbig"')}<div class="pringl">${label}</div></div>`;
}
const dateSub = d => esc(d === todayStr() ? `Today, ${shortDay(d, true).replace(/^\w+, /, '')}` : shortDay(d, true));

function scorePage(k, d) {
  const s = scoreOn(d), h = health[d] || {};
  if (k === 'strain') {
    const today = acts.filter(a => a.date === d), en = M.energy.get(d);
    const html = `<div class="phero"><h1>Strain</h1><div class="psub">${dateSub(d)}</div>${bigRing(s.strain, '#ffd36b', '#f59a2a', 'Strain', s.target)}
      <div class="ptarget">Target strain <b>${Math.max(0, s.target - 10)}–${Math.min(100, s.target + 10)}%</b></div></div>
      <div class="ptiles">${tile('⏱ Duration', fmtHM(exMin(d) || 0))}${tile('🔥 Total Energy', en ? `${fmt(en)}<small> kcal</small>` : '–')}</div>
      <div class="pcoach"><div class="small muted">Coaching</div>${esc(homeCoach(s, h, d))}</div>
      <h2 class="psec">Strain Timeline</h2><div class="small muted psecsub">${today.length} event${today.length === 1 ? '' : 's'}</div>
      <div class="pcard">${today.length ? today.map((a, i) => `<button class="ptl1" data-a="${i}"><span class="htli">${WK_ICON(a.type)}</span><span class="grow"><span class="small muted">${esc(a.start)}</span><b>${esc(a.name || wkWords(a.type))}</b>
        <span class="small muted">${[a.dur && `${r0(a.dur)} min`, a.km && `${r1(a.km)} km`, a.kcal && `${r0(a.kcal)} kcal`].filter(Boolean).join(' · ')}</span></span><span class="parr">›</span></button>`).join('') : '<div class="small muted">No workouts recorded.</div>'}</div>
      <h2 class="psec">Trends</h2>${['strain', 'exercise', 'energy', 'steps', 'strainPerf'].map(x => trendCard(x, d)).join('')}`;
    openPage('Strain', html, pg => { wireTrends(pg, d, ['strain', 'exercise', 'energy', 'steps', 'strainPerf']);
      pg.querySelectorAll('[data-a]').forEach(b => b.onclick = () => actDetail(today[+b.dataset.a])); }, 'rgba(245,154,42,.22)');
  } else if (k === 'recovery') {
    const P = s.parts, rc = s.recovery;
    const coach = rc == null ? 'Sync from Garmin to see your recovery.' : `${rc >= 66 ? 'Recovery is high today: a good day to train hard.' : rc >= 35 ? 'Recovery is fair today: train as planned and keep the hard efforts short.' : 'Recovery is low today: keep it easy and prioritise sleep.'}${h.score != null ? ` Your sleep score (${h.score}) is ${(() => { const n = normalOf('sleep', d); return !n ? 'in' : h.score < n.lo ? 'below' : h.score > n.hi ? 'above' : 'near'; })()} your usual.` : ''}`;
    const html = `<div class="phero"><h1>Recovery</h1><div class="psub">${dateSub(d)}</div>${bigRing(rc, '#e3ea3f', '#5fc21a', 'Recovered')}</div>
      <div class="ptiles">${tile('〰️ Resting HRV', h.hrv != null ? `${r0(h.hrv)}<small> ms</small>` : '–')}${tile('❤️ Resting HR', h.rhr != null ? `${r0(h.rhr)}<small> bpm</small>` : '–')}</div>
      <div class="pcoach"><div class="small muted">Coaching</div>${esc(coach)}</div>
      <h2 class="psec">What went into it</h2><div class="pcard">${Object.entries({ hrv: 'HRV · 35%', rhr: 'Resting heart rate · 25%', sleep: 'Sleep · 25%', bb: 'Body Battery · 15%' }).map(([kk, l]) => P[kk] ? `<div class="pbrk"><span>${l}<div class="small muted">${esc(P[kk].txt)}</div></span><div class="pbrkbar"><i style="width:${P[kk].v}%;background:${P[kk].v >= 66 ? '#5fc21a' : P[kk].v >= 35 ? '#e3c23f' : '#e5484d'}"></i></div><b>${P[kk].v}</b></div>` : '').join('') || '<div class="small muted">Not enough data yet.</div>'}</div>
      <h2 class="psec">Trends</h2>${['recovery', 'hrv', 'rhr', 'resp', 'spo2', 'bbHi'].map(x => trendCard(x, d)).join('')}`;
    openPage('Recovery', html, pg => wireTrends(pg, d, ['recovery', 'hrv', 'rhr', 'resp', 'spo2', 'bbHi']), 'rgba(95,194,26,.2)');
  } else sleepPage(d);
}

// ---------- Sleep ----------
function sleepPage(d) {
  const s = scoreOn(d), h = health[d] || {};
  const wakes = daysBack(d, 14).map(x => hmToMin(H(x, 'wake'))).filter(x => x != null);
  const wakeT = wakes.length >= 3 ? [...wakes].sort((a, b) => a - b)[Math.floor(wakes.length / 2)] : 7 * 60;
  const need = sleepNeed(), target = wakeT - need.h * 60, wind = target - 30;
  const bank = sleepBank(d);
  const coach = h.hrs == null ? 'No sleep recorded for this night.' : [
    h.score != null && (h.score >= 80 ? 'Great sleep last night.' : h.score >= 60 ? 'Fair sleep last night.' : 'You had poor sleep last night.'),
    h.rem != null && h.hrs && h.rem / h.hrs < 0.18 ? 'Your REM sleep was short; it comes late in the night, so a steady wake time and no late alcohol help.' : null,
    h.deep != null && h.hrs && h.deep / h.hrs < 0.13 ? 'Deep sleep was low; an earlier, cooler, darker bedroom helps most.' : null,
    bank != null && bank < -120 ? `You're carrying about ${fmtHM(-bank)} of sleep debt this week. Aim for bed by ${fmtClock(target)} tonight.` : `Aim to wind down at ${fmtClock(wind)} and be asleep by ${fmtClock(target)}.`,
  ].filter(Boolean).join(' ');
  const st = [['Deep', h.deep, 'var(--sd)'], ['REM', h.rem, 'var(--sr)'], ['Light', h.light, 'var(--sl)'], ['Awake', h.awake, 'var(--sa)']], stT = st.reduce((a, x) => a + (x[1] || 0), 0);
  // Weekly distribution: average sleep for each weekday over the last 8 weeks
  const wd = Array.from({ length: 7 }, () => []);
  daysBack(d, 56).forEach(x => { const v = H(x, 'hrs'); if (v != null) { const [y, m, dd] = x.split('-').map(Number); wd[(new Date(y, m - 1, dd).getDay() + 6) % 7].push(v); } });
  const wavg = wd.map(a => a.length ? mean(a) : null), wAll = mean(wavg.filter(x => x != null));
  const keys = ['hrs', 'rem', 'deep', 'light', 'awake', 'sleepHr', 'sleepStress', 'bank', 'bed', 'wake'];
  const html = `<div class="phero"><h1>Sleep</h1><div class="psub">${dateSub(d)}</div>${bigRing(s.sleep, '#9fd0ff', '#6e5ae6', 'Quality')}</div>
    <div class="ptiles">${tile('🛏 Time in Bed', fmtHM(M.inbed.get(d)))}${tile('🌙 Time Asleep', fmtHM(M.hrs.get(d)))}</div>
    <div class="pcoach"><div class="small muted">Coaching</div>${esc(coach)}</div>
    ${stT ? `<div class="pcard"><b>Stages</b><div class="wkbar" style="height:14px">${st.map(x => x[1] ? `<i style="width:${x[1] / stT * 100}%;background:${x[2]}"></i>` : '').join('')}</div>
      <div class="hsleg small muted">${st.map(x => `<span><i style="background:${x[2]}"></i>${x[0]} ${fmtHM((x[1] || 0) * 60)}</span>`).join('')}</div></div>` : ''}
    <div class="pcard pbed"><div class="pbedt"><div><div class="small muted">Wind down</div><b>${fmtClock(wind)}</b></div><div><div class="small muted">Target bedtime</div><b>${fmtClock(target)}</b></div></div>
      ${sleepDial(h, target, wakeT)}<div class="small muted" style="text-align:center">Based on your usual wake time (${fmtClock(wakeT)}) and your sleep need. Purple is last night; the dashed arc is your target.</div>
      <button class="pneed" id="pneed"><span>Sleep need</span><b>${needTxt(need)}</b><span class="small muted">${need.auto ? (need.fallback ? 'default until there are 6 well-recovered nights' : `auto · from ${need.n} well-recovered nights`) : 'set by you'}</span><span class="parr">›</span></button></div>
    <div class="ptiles">${tile('🏦 Sleep Bank', bank == null ? '–' : `<span style="color:${bank < -60 ? '#e8963c' : '#3fb37f'}">${M.bank.fmt(bank)}</span>`, bank == null ? '' : bank < -60 ? 'Debt this week' : 'On track')}
      ${tile('😴 Sleep Stress', h.sleepStress != null ? r0(h.sleepStress) : '–', h.sleepHr ? `HR ${r0(h.sleepHr)} bpm asleep` : '')}</div>
    <h2 class="psec">Weekly sleep distribution</h2><div class="pcard"><div class="pweek">${'Mon Tue Wed Thu Fri Sat Sun'.split(' ').map((n, i) => `<div><div class="pwk" style="opacity:${wavg[i] == null ? .15 : .35 + Math.max(0, Math.min(1, (wavg[i] - wAll + 1) / 2)) * .65}"></div><span>${n}</span><small>${wavg[i] == null ? '–' : r1(wavg[i]) + 'h'}</small></div>`).join('')}</div>
      <div class="small muted" style="margin-top:6px">Average over the last 8 weeks. Brighter = more sleep.</div></div>
    <h2 class="psec">Trends</h2>${keys.map(x => trendCard(x, d)).join('')}`;
  openPage('Sleep', html, pg => { wireTrends(pg, d, keys); pg.querySelector('#pneed').onclick = () => needSheet(() => { pg.remove(); sleepPage(d); }); }, 'rgba(110,90,230,.24)');
}
function needSheet(done) {
  const cur = settings.sleepNeed || 0, auto = (() => { const o = settings.sleepNeed; settings.sleepNeed = null; const n = sleepNeed(); settings.sleepNeed = o; return n; })();
  const opts = [[0, `Auto (${needTxt(auto)})`, auto.fallback ? 'Uses 8 h until there are 6 nights before a 66%+ recovery' : `Your typical sleep before ${auto.n} well-recovered mornings`], ...[6.5, 7, 7.5, 8, 8.5, 9].map(h => [h, needTxt({ h }), ''])];
  openSheet(`<div class="acthead">Sleep need</div><div class="small muted" style="text-align:center;margin:-8px 0 12px">Sets your sleep bank and target bedtime.</div>
    <div class="actlist">${opts.map(([v, l, sub]) => `<label class="actrow"><span class="grow"><b>${l}</b>${sub ? `<small>${sub}</small>` : ''}</span><input type="radio" name="need" value="${v}"${v === cur ? ' checked' : ''}></label>`).join('')}</div>
    <button class="btn actbtn" id="needok">Save</button>`, sh => {
    sh.querySelector('#needok').onclick = () => { const v = +sh.querySelector('input[name=need]:checked').value; settings.sleepNeed = v || null; saveSettings(); closeSheet(); toast(`Sleep need: ${needTxt(sleepNeed())}`); done && done(); };
  });
}
function sleepDial(h, target, wakeT) {
  const R = 92, C = 120, ang = m => (m / 1440) * 2 * Math.PI - Math.PI / 2, P = (m, r) => [C + r * Math.cos(ang(m)), C + r * Math.sin(ang(m))];
  const arc = (a, b, r) => { let span = ((b - a) % 1440 + 1440) % 1440; const [x1, y1] = P(a, r), [x2, y2] = P(a + span, r); return `M${x1.toFixed(1)},${y1.toFixed(1)}A${r},${r} 0 ${span > 720 ? 1 : 0} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`; };
  const b = hmToMin(h.bed), w = hmToMin(h.wake);
  const ticks = Array.from({ length: 24 }, (_, i) => { const [x1, y1] = P(i * 60, R - 18), [x2, y2] = P(i * 60, R - (i % 6 ? 22 : 28)); return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--muted)" stroke-width="${i % 6 ? 1 : 2}" opacity=".6"/>`; }).join('');
  const lab = [[0, '12AM'], [360, '6AM'], [720, '12PM'], [1080, '6PM']].map(([m, t]) => { const [x, y] = P(m, m % 720 ? R - 46 : R - 40); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${m === 360 ? 'end' : m === 1080 ? 'start' : 'middle'}" font-size="10" fill="var(--muted)">${t}</text>`; }).join('');
  return `<svg viewBox="0 0 240 240" class="pdial"><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--ringtrack)" stroke-width="16"/>
    <path d="${arc(target, wakeT, R + 13)}" fill="none" stroke="#8a7cf0" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"/>
    ${b != null && w != null ? `<path d="${arc(b, w, R)}" fill="none" stroke="#6e5ae6" stroke-width="16" stroke-linecap="round"/>` : ''}
    ${ticks}${lab}<text x="${C}" y="${C - 12}" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)">${h.hrs != null ? fmtHM(h.hrs * 60) : '–'}</text>
    <text x="${C}" y="${C + 26}" text-anchor="middle" font-size="10" fill="var(--muted)">${b != null ? `${h.bed}–${h.wake}` : 'asleep'}</text></svg>`;
}

// ---------- intraday (stress + Body Battery through the day) ----------
async function loadIntraday(d) {
  const cache = store.get('intra', {});
  if (settings.ghToken && navigator.onLine && (!cache[d] || d === todayStr() || Date.now() - cache[d].at > 6 * 3600e3)) {
    try {
      const g = await gh('GET', null, settings.ghPath.replace(/[^/]*$/, '') + `intraday/${d}.json`);
      if (g.ok) {
        cache[d] = { v: JSON.parse(b64ToText((await g.json()).content || '')), at: Date.now() };
        store.set('intra', Object.fromEntries(Object.entries(cache).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10)));
      }
    } catch (e) { /* offline: use cache */ }
  }
  return cache[d] ? cache[d].v : null;
}
const intraCached = d => (store.get('intra', {})[d] || {}).v || null;
const STRESS_COL = v => v <= 25 ? '#4c9be8' : v <= 50 ? '#c9c24a' : v <= 75 ? '#e8963c' : '#e5484d';
function dayAxis(W) { return [0, 6, 12, 18, 24].map(hh => `<text x="${(hh / 24 * W).toFixed(0)}" y="${'{Y}'}" text-anchor="${hh === 0 ? 'start' : hh === 24 ? 'end' : 'middle'}" font-size="10" fill="var(--muted)">${pad(hh % 24)}:00</text>`).join(''); }
function actMarks(d, W, y) { return acts.filter(a => a.date === d && a.start).map(a => { const x = hmToMin(a.start) / 1440 * W; return `<line x1="${x.toFixed(1)}" y1="${y}" x2="${x.toFixed(1)}" y2="${y + 200}" stroke="#e5487f" stroke-width="1" stroke-dasharray="2 3" opacity=".7"/><text x="${x.toFixed(1)}" y="${y - 2}" text-anchor="middle" font-size="13">${WK_ICON(a.type)}</text>`; }).join(''); }
function stressDayChart(d, it) {
  const W = 320, Hh = 130;
  if (it && (it.stress || []).length) {   // stress readings (not in Garmin's Personal API today, kept for later)
    const bars = it.stress.filter(p => p[1] >= 0).map(p => { const x = p[0] / 1440 * W, hh = Math.max(1.5, p[1] / 100 * (Hh - 24)); return `<rect x="${x.toFixed(1)}" y="${(Hh - hh).toFixed(1)}" width="1.6" height="${hh.toFixed(1)}" fill="${STRESS_COL(p[1])}"/>`; }).join('');
    return `<svg viewBox="0 -18 ${W} ${Hh + 34}" class="pday">${bars}${actMarks(d, W, 6)}${dayAxis(W).replace(/\{Y\}/g, Hh + 14)}</svg>`;
  }
  if (!it || !(it.hr || []).length) return `<div class="pempty">The heart-rate curve appears after the next Garmin sync.</div>`;
  return hrDayChart(d, it.hr, W, Hh);
}
// Heart rate through the day: above-resting minutes tinted by how far above your resting HR they are.
function hrDayChart(d, hr, W, Hh) {
  const rhr = H(d, 'rhr') || Math.min(...hr.map(p => p[1])), hi = Math.max(...hr.map(p => p[1]), rhr + 40), lo = Math.max(30, rhr - 15);
  const X = m => m / 1440 * W, Y = v => Hh - (v - lo) / (hi - lo) * (Hh - 20);
  const segs = [];
  for (let i = 1; i < hr.length; i++) { const [m0, v0] = hr[i - 1], [m1, v1] = hr[i]; if (m1 - m0 > 20) continue;
    const e = (v0 + v1) / 2 - rhr, c = e < 15 ? '#4c9be8' : e < 30 ? '#c9c24a' : e < 50 ? '#e8963c' : '#e5484d';
    segs.push(`<line x1="${X(m0).toFixed(1)}" y1="${Y(v0).toFixed(1)}" x2="${X(m1).toFixed(1)}" y2="${Y(v1).toFixed(1)}" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`); }
  return `<svg viewBox="0 -18 ${W} ${Hh + 34}" class="pday"><line x1="0" x2="${W}" y1="${Y(rhr).toFixed(1)}" y2="${Y(rhr).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="3 4" opacity=".7"/>
    <text x="${W}" y="${(Y(rhr) - 4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">resting ${r0(rhr)}</text>
    <text x="${W}" y="${(Y(hi) + 10).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${r0(hi)} bpm</text>
    ${segs.join('')}${actMarks(d, W, 6)}${dayAxis(W).replace(/\{Y\}/g, Hh + 14)}</svg>`;
}

// ---------- Stress ----------
function stressPage(d) {
  const h = health[d] || {}, it = intraCached(d);
  const parts = [['High', h.sHigh, '#e5484d'], ['Medium', h.sMed, '#e8963c'], ['Low', h.sLow, '#c9c24a'], ['Rest', h.sRest, '#4c9be8']], tot = parts.reduce((a, x) => a + (x[1] || 0), 0);
  const nr = normalOf('stress', d);
  const coach = h.stress == null ? 'No stress data for this day.' : !nr ? `Average stress ${h.stress}.` : h.stress > nr.hi ? 'Your stress is higher than usual today. Short breaks, a walk outside and slow breathing (4 seconds in, 6 out) bring it down.'
    : h.stress < nr.lo ? 'Stress is lower than usual today. Nice and calm.' : 'Your stress is within its normal range. Keep taking regular breaks to hold it there.';
  const lastAct = it && it.hr && it.hr.length ? it.hr[it.hr.length - 1] : null;
  const html = `<div class="phero"><h1>Stress</h1><div class="psub">${dateSub(d)}</div><div class="pgauge">${stressGauge(h.stress)}</div></div>
    <div class="ptiles">${tile('〰️ Last night HRV', h.hrv != null ? `${r0(h.hrv)}<small> ms</small>` : '–')}${tile(lastAct && d === todayStr() ? '❤️ Last HR' : '❤️ Resting HR', lastAct && d === todayStr() ? `${lastAct[1]}<small> bpm</small>` : h.rhr != null ? `${r0(h.rhr)}<small> bpm</small>` : '–', lastAct && d === todayStr() ? `at ${fmtClock(lastAct[0])}` : '')}</div>
    <div class="pcoach"><div class="small muted">Coaching</div>${esc(coach)}</div>
    <h2 class="psec">${esc(shortDay(d, true))}</h2><div class="small muted psecsub" id="pstresscap">${it && (it.stress || []).length ? 'Stress through the day' : 'Heart rate through the day: higher above your resting rate = more load (Garmin shares only daily stress totals)'}</div><div class="pcard" id="pstressday">${stressDayChart(d, it)}</div>
    ${tot ? `<div class="pcard">${parts.map(x => `<div class="pbrk"><span>${x[0]}</span><div class="pbrkbar"><i style="width:${(x[1] || 0) / tot * 100}%;background:${x[2]}"></i></div><b>${r0((x[1] || 0) / tot * 100)}%</b><span class="small muted pdur">${fmtHM(x[1] || 0)}</span></div>`).join('')}</div>` : ''}
    <h2 class="psec">Trends</h2>${['stress', 'maxStress', 'sleepStress', 'restMin'].map(x => trendCard(x, d)).join('')}`;
  openPage('Stress', html, pg => {
    wireTrends(pg, d, ['stress', 'maxStress', 'sleepStress', 'restMin']);
    loadIntraday(d).then(v => { const c = pg.querySelector('#pstressday'); if (c && v && JSON.stringify(v) !== JSON.stringify(it)) { c.innerHTML = stressDayChart(d, v); pg.querySelector('#pstresscap').textContent = (v.stress || []).length ? 'Stress through the day' : 'Heart rate through the day: higher above your resting rate = more load (Garmin shares only daily stress totals)'; } });
  }, 'rgba(63,179,168,.2)');
}

// ---------- Energy Bank (Body Battery) ----------
function energyChart(d, it) {
  const W = 320, Hh = 120;
  if (!it || !(it.bb || []).length) return `<div class="pempty">The energy curve appears after the next Garmin sync.</div>`;
  const p = it.bb.filter(x => x[1] != null), X = m => m / 1440 * W, Y = v => Hh - v / 100 * (Hh - 16);
  const line = p.map((q, i) => `${i ? 'L' : 'M'}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join('');
  const last = p[p.length - 1];
  let sb = (it.stress || []).filter(q => q[1] >= 0).map(q => { const hh = q[1] / 100 * 34; return `<rect x="${X(q[0]).toFixed(1)}" y="${(Hh + 52 - hh).toFixed(1)}" width="1.6" height="${hh.toFixed(1)}" fill="${STRESS_COL(q[1])}" opacity=".85"/>`; }).join('');
  let sbl = 'Stress';
  if (!sb && (it.hr || []).length) { const rhr = H(d, 'rhr') || 60; sbl = 'Heart rate';
    sb = it.hr.map(q => { const e = Math.max(0, q[1] - rhr), hh = Math.min(34, e / 60 * 34); return hh < 1 ? '' : `<rect x="${X(q[0]).toFixed(1)}" y="${(Hh + 52 - hh).toFixed(1)}" width="1.4" height="${hh.toFixed(1)}" fill="${e < 15 ? '#4c9be8' : e < 30 ? '#c9c24a' : e < 50 ? '#e8963c' : '#e5484d'}" opacity=".85"/>`; }).join(''); }
  return `<svg viewBox="0 -18 ${W} ${Hh + 86}" class="pday"><defs><linearGradient id="ebg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2b51d" stop-opacity=".45"/><stop offset="1" stop-color="#5fc21a" stop-opacity=".05"/></linearGradient></defs>
    ${[25, 50, 75].map(v => `<line x1="0" x2="${W}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-dasharray="2 4"/>`).join('')}
    <path d="${line}L${X(last[0]).toFixed(1)},${Hh}L${X(p[0][0]).toFixed(1)},${Hh}Z" fill="url(#ebg)"/><path d="${line}" fill="none" stroke="#f2b51d" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="4.5" fill="#f2b51d" stroke="var(--card)" stroke-width="2"/>
    ${actMarks(d, W, 6)}<text x="0" y="${Hh + 14}" font-size="10" fill="var(--muted)">${sbl}</text>${sb}${dayAxis(W).replace(/\{Y\}/g, Hh + 66)}</svg>`;
}
function energyCoach(d, it) {
  const h = health[d] || {};
  const all = store.get('intra', {});
  if (it && it.bb && it.bb.length && d === todayStr()) {
    const last = it.bb[it.bb.length - 1], at = last[0];
    const others = Object.entries(all).filter(([k]) => k !== d).map(([, o]) => { const b = (o.v && o.v.bb) || []; const q = b.filter(x => Math.abs(x[0] - at) <= 20); return q.length ? q[0][1] : null; }).filter(x => x != null);
    if (others.length >= 2) { const diff = Math.round(last[1] - mean(others)); return `Your Energy Bank is ${Math.abs(diff)}% ${diff >= 0 ? 'higher' : 'lower'} than usual at ${fmtClock(at)} on a typical day.${diff < -10 ? ' Keep the evening easy and get to bed on time.' : ''}`; }
  }
  const nr = normalOf('bbHi', d);
  if (h.bbHi == null) return 'No Body Battery data for this day.';
  return nr ? `You charged to ${h.bbHi} this morning, ${h.bbHi > nr.hi ? 'above' : h.bbHi < nr.lo ? 'below' : 'close to'} your usual peak of about ${r0(nr.m)}.` : `You charged to ${h.bbHi} this morning.`;
}
function energyPage(d) {
  const h = health[d] || {}, it = intraCached(d), now = h.bbNow ?? (it && it.bb && it.bb.length ? it.bb[it.bb.length - 1][1] : null) ?? h.bbLo;
  const used = acts.filter(a => a.date === d);
  const usage = () => used.length ? used.map((a, i) => `<button class="ptl1" data-a="${i}"><span class="htli">${WK_ICON(a.type)}</span><span class="grow"><span class="small muted">${esc(a.start)}${a.dur ? ` – ${fmtClock(hmToMin(a.start) + a.dur)}` : ''}</span><b>${esc(a.name || wkWords(a.type))}</b>
    <span class="small muted">${[a.km && `${r1(a.km)} km`, a.kcal && `${r0(a.kcal)} kcal`].filter(Boolean).join(' · ')}</span></span><b style="color:${a.bbd < 0 ? '#e5484d' : 'var(--muted)'}">${a.bbd != null ? (a.bbd > 0 ? '+' : '') + a.bbd + '%' : ''}</b></button>`).join('') : '<div class="small muted">No workouts recorded.</div>';
  const html = `<div class="phero"><h1>Energy Bank</h1><div class="psub">${dateSub(d)}</div>
      <div class="pbatt"><div class="pbattf" style="width:${Math.max(4, now || 0)}%"></div><span>${now ?? '–'}<small>%</small> ⚡</span></div>
      <div class="ptarget">${h.bbHi != null ? `Charged to ${h.bbHi}% ${h.wake ? `by ${h.wake}` : 'today'}` : ''}</div></div>
    <div class="ptiles">${tile('Total Charged', h.bbCh != null ? `<span style="color:#3fb37f">+${h.bbCh}%</span>` : '–')}${tile('Total Drained', h.bbDr != null ? `<span style="color:#e5484d">−${h.bbDr}%</span>` : '–')}</div>
    <div class="pcoach"><div class="small muted">Coaching</div><span id="pecoach">${esc(energyCoach(d, it))}</span></div>
    <h2 class="psec">${esc(shortDay(d, true))}</h2><div class="small muted psecsub">Energy level</div><div class="pcard" id="peday">${energyChart(d, it)}</div>
    <h2 class="psec">Energy Usage</h2><div class="pcard">${usage()}</div>
    <h2 class="psec">Trends</h2>${['bbHi', 'bbLo', 'bbCh', 'bbDr'].map(x => trendCard(x, d)).join('')}`;
  openPage('Energy Bank', html, pg => {
    wireTrends(pg, d, ['bbHi', 'bbLo', 'bbCh', 'bbDr']);
    pg.querySelectorAll('[data-a]').forEach(b => b.onclick = () => actDetail(used[+b.dataset.a]));
    loadIntraday(d).then(async v => {
      if (!v || !document.body.contains(pg)) return;
      pg.querySelector('#peday').innerHTML = energyChart(d, v); pg.querySelector('#pecoach').textContent = energyCoach(d, v);
      // Fetch a few previous days (once) so coaching can compare with a typical day.
      const have = store.get('intra', {}), prev = [1, 2, 3, 4, 5].map(i => addDays(d, -i)).filter(x => !have[x]);
      if (prev.length) { for (const x of prev) await loadIntraday(x); if (document.body.contains(pg)) pg.querySelector('#pecoach').textContent = energyCoach(d, v); }
    });
  }, 'rgba(242,181,29,.22)');
}

// ---------- metric sheet ----------
const RANGES = [['30D', 30], ['3M', 90], ['6M', 182], ['1Y', 365]];
function metricChart(k, d, days) {
  const W = 330, Hh = 170, L = 6, R = 30;
  const ds = daysBack(d, days), step = days > 120 ? 7 : 1;
  const pts = [];
  for (let i = step - 1; i < ds.length; i += step) {
    const grp = ds.slice(Math.max(0, i - step + 1), i + 1).map(x => M[k].get(x)).filter(x => x != null);
    pts.push({ x: ds[i], v: grp.length ? mean(grp) : null });
  }
  const vals = pts.map(p => p.v).filter(v => v != null);
  if (vals.length < 2) return `<div class="pempty">Not enough data for this range yet.</div>`;
  const band = pts.map(p => { const n = normalOf(k, p.x); return n ? [n.lo, n.hi] : null; });
  const all = vals.concat(band.filter(Boolean).flat());
  let lo = Math.min(...all), hi = Math.max(...all); const pd = (hi - lo) * 0.12 || 1; lo -= pd; hi += pd;
  const X = i => L + i / (pts.length - 1) * (W - L - R), Y = v => 8 + (1 - (v - lo) / (hi - lo)) * (Hh - 16);
  const bi = band.map((b, i) => b && [i, b]).filter(Boolean);
  const bandPath = bi.length > 1 ? `M${bi.map(([i, b]) => `${X(i).toFixed(1)},${Y(b[1]).toFixed(1)}`).join('L')}L${bi.slice().reverse().map(([i, b]) => `${X(i).toFixed(1)},${Y(b[0]).toFixed(1)}`).join('L')}Z` : '';
  const line = pts.map((p, i) => p.v == null ? null : `${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).filter(Boolean);
  const avg = mean(vals), col = '#3fc28a';
  const dots = days <= 90 ? pts.map((p, i) => p.v == null ? '' : `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.6" fill="var(--card)" stroke="${col}" stroke-width="1.6"/>`).join('') : '';
  const li = pts.map(p => p.v != null).lastIndexOf(true);
  const ticks = [0, .25, .5, .75, 1].map(f => { const i = Math.round(f * (pts.length - 1)); const [y, m, dd] = pts[i].x.split('-').map(Number); return `<text x="${X(i).toFixed(1)}" y="${Hh + 14}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}" font-size="10" fill="var(--muted)">${new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>`; }).join('');
  const yl = [hi - pd, lo + pd].map(v => `<text x="${W - 2}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${esc(M[k].fmt(v))}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${Hh + 18}" class="pmchart">${bandPath ? `<path d="${bandPath}" fill="${col}" opacity=".18"/>` : ''}
    <line x1="${L}" x2="${W - R}" y1="${Y(avg).toFixed(1)}" y2="${Y(avg).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="3 4" opacity=".7"/>
    <path d="M${line.join('L')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>${dots}
    <circle cx="${X(li).toFixed(1)}" cy="${Y(pts[li].v).toFixed(1)}" r="5" fill="${col}" stroke="var(--card)" stroke-width="2"/>
    <g transform="translate(${((W - R) / 2).toFixed(0)},${(Y(avg) - 9).toFixed(1)})"><rect x="-38" y="-8" width="76" height="16" rx="8" fill="${col}"/><text y="4" text-anchor="middle" font-size="10" font-weight="700" fill="#06331f">Avg ${esc(M[k].fmt(avg))}${M[k].u && M[k].u !== '%' ? ' ' + M[k].u : M[k].u}</text></g>
    ${ticks}${yl}</svg>`;
}
function trendsTable(k, d) {
  const now = roll7(k, d);
  const rows = [3, 7, 14, 30, 90].map(P => {
    const then = roll7(k, addDays(d, -P)), ch = now != null && then != null ? now - then : null;
    const nr = normalOf(k, d), big = ch != null && nr && Math.abs(ch) > nr.s * 0.5;
    const good = M[k].good, c = ch == null || !big || !good ? 'var(--muted)' : (ch > 0) === (good === 'up') ? '#4c9be8' : '#e5484d';
    const sp = daysBack(d, Math.max(P, 7)).map(x => roll7(k, x));
    const txt = ch == null ? '–' : (ch > 0 ? '+' : ch < 0 ? '−' : '') + (MIN_KEYS.includes(k) ? `${r0(Math.abs(ch))} min` : `${(a => a >= 1000 ? fmt(a) : a < 10 ? r1(a) : r0(a))(Math.abs(ch))}${M[k].u ? ' ' + M[k].u : ''}`);
    return `<div class="ptrow"><span>${P}-day</span><span><i style="background:${c}"></i>${txt}</span>${sparkSVG(sp, c === 'var(--muted)' ? '#8d8b85' : c, 90, 24)}</div>`;
  }).join('');
  return `<div class="ptab"><div class="ptrow ptrh"><span>Period</span><span>Change</span><span>Trend</span></div>${rows}</div><div class="small muted pnote">Based on 7-day rolling averages for each period.</div>`;
}
function openMetric(k, d, group) {
  group = group && group.includes(k) ? group : [k];
  let range = 30;
  const body = () => {
    const v = M[k].get(d), nr = normalOf(k, d), st = statusOf(k, d, v);
    return `<div class="acthead">${esc(M[k].n)}</div>
      <div class="pmhead"><div><div class="pmv">${v == null ? 'No data' : esc(M[k].fmt(v))}${v != null && M[k].u ? `<small> ${M[k].u}</small>` : ''}</div><div class="small muted">${esc(shortDay(d, true))}</div></div>
        <div style="text-align:right"><div style="color:${st.c};font-weight:650">${st.t}</div>${nr ? `<div class="small">${esc(M[k].fmt(nr.lo))} – ${esc(M[k].fmt(nr.hi))}${M[k].u ? ' ' + M[k].u : ''}</div>` : ''}</div></div>
      ${group.length > 1 ? `<div class="pchips noswipe">${group.map(g => `<button class="pchip${g === k ? ' on' : ''}" data-g="${g}">${esc(M[g].n)}</button>`).join('')}</div>` : ''}
      <div class="pcard">${metricChart(k, d, range)}<div class="prange">${RANGES.map(([l, n]) => `<button class="${n === range ? 'on' : ''}" data-r="${n}">${l}</button>`).join('')}</div></div>
      <h3 style="margin-top:14px">Trends Analysis</h3><div class="small muted">Last data point ${esc(shortDay(d, true))}</div>${trendsTable(k, d)}
      <div class="pcard pinfo"><div class="small muted">ⓘ ${esc(M[k].n)}</div>${esc(M[k].info)}<div class="small muted" style="margin-top:8px">The shaded band is your normal range: your average ± 1 standard deviation over the previous 30 days.</div></div>`;
  };
  openSheet(`<div id="pmet">${body()}</div>`, sh => {
    const wire = () => {
      sh.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { k = b.dataset.g; sh.querySelector('#pmet').innerHTML = body(); wire(); });
      sh.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { range = +b.dataset.r; sh.querySelector('#pmet').innerHTML = body(); wire(); });
      const on = sh.querySelector('.pchip.on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
    };
    wire();
  });
}

// ---------- Cardio and Muscular Load ----------
const LOAD_ST = [['Detraining', '#e8963c', r => r < 0.8], ['Maintaining', '#8a7cf0', r => r < 1.0], ['Productive', '#3fb37f', r => r <= 1.3], ['High', '#f2b51d', r => r <= 1.5], ['Overreaching', '#e5487f', () => true]];
const loadSt = r => LOAD_ST.find(s => s[2](r));
function muscleDay(d) { return acts.filter(a => a.date === d && /strength|training|hiit|yoga|pilates/i.test(a.type || '')).reduce((s, a) => s + (a.load || (a.dur || 0) * 1.5), 0); }
function loadSeries(kind, d, days) {
  const f = kind === 'muscle' ? muscleDay : dayLoad;
  const span = days + 28, ds = daysBack(d, span), L = ds.map(f);
  const firstData = kind === 'muscle' ? ds.findIndex((x, i) => L[i] > 0) : 0;
  return ds.slice(28).map((x, j) => { const i = j + 28; let a = 0, c = 0; for (let q = 0; q < 7; q++) a += L[i - q]; for (let q = 0; q < 28; q++) c += L[i - q]; a /= 7; c /= 28;
    const cal = firstData < 0 || i - firstData < 21 || c === 0; return { x, a, c, r: c ? a / c : 1, cal }; });
}
function openLoad(kind = 'cardio', d = state.date) {
  let range = 30;
  const body = () => {
    const S = loadSeries(kind, d, range), last = S[S.length - 1], st = last.cal ? ['Calibrating', 'var(--muted)'] : loadSt(last.r);
    const W = 330, Hh = 160, hi = Math.max(...S.map(p => Math.max(p.a, p.c * 1.3)), 1) * 1.1, X = i => 4 + i / (S.length - 1) * (W - 34), Y = v => 6 + (1 - v / hi) * (Hh - 12);
    const band = `M${S.map((p, i) => `${X(i).toFixed(1)},${Y(p.c * 1.3).toFixed(1)}`).join('L')}L${S.slice().reverse().map((p, i) => `${X(S.length - 1 - i).toFixed(1)},${Y(p.c * 0.8).toFixed(1)}`).join('L')}Z`;
    const every = Math.max(1, Math.round(S.length / 40));
    const dots = S.map((p, i) => i % every && i !== S.length - 1 ? '' : `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.a).toFixed(1)}" r="${i === S.length - 1 ? 5 : 3}" fill="var(--card)" stroke="${p.cal ? '#8d8b85' : loadSt(p.r)[1]}" stroke-width="2"/>`).join('');
    const counts = LOAD_ST.map(s => [s[0], s[1], S.filter(p => !p.cal && loadSt(p.r)[0] === s[0]).length]); const ncal = S.filter(p => p.cal).length;
    const ticks = [0, .5, 1].map(f => { const i = Math.round(f * (S.length - 1)); const [y, m, dd] = S[i].x.split('-').map(Number); return `<text x="${X(i).toFixed(1)}" y="${Hh + 14}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}" font-size="10" fill="var(--muted)">${new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>`; }).join('');
    return `<div class="acthead">${kind === 'muscle' ? 'Muscular Load' : 'Cardio Load'}</div>
      <div class="pmhead"><div><div class="pmv">${r0(last.a)}</div><div class="small muted">${esc(shortDay(d, true))}</div></div>
        <div style="text-align:right"><div style="color:${st[1]};font-weight:700">${st[0]}</div><div class="small">Optimal: ${r0(last.c * 0.8)} – ${r0(last.c * 1.3)}</div></div></div>
      <div class="pchips"><button class="pchip${kind === 'cardio' ? ' on' : ''}" data-k="cardio">Cardio Load</button><button class="pchip${kind === 'muscle' ? ' on' : ''}" data-k="muscle">Muscular Load</button></div>
      <div class="pcard">${S.every(p => !p.a) ? `<div class="pempty">${kind === 'muscle' ? 'No strength workouts in this period yet. Record one on your watch as Strength and it shows up here.' : 'No workouts or steps in this period yet.'}</div>` : `<svg viewBox="0 0 ${W} ${Hh + 18}" class="pmchart"><path d="${band}" fill="#3fb37f" opacity=".2"/><path d="M${S.map((p, i) => `${X(i).toFixed(1)},${Y(p.a).toFixed(1)}`).join('L')}" fill="none" stroke="#8a7cf0" stroke-width="1.6" opacity=".8"/>${dots}${ticks}
        <text x="${W - 2}" y="${(Y(last.c * 1.3) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${r0(last.c * 1.3)}</text><text x="${W - 2}" y="${(Y(last.c * 0.8) + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${r0(last.c * 0.8)}</text></svg>`}
        <div class="prange">${[['7D', 7], ['30D', 30], ['3M', 90], ['1Y', 365]].map(([l, n]) => `<button class="${n === range ? 'on' : ''}" data-r="${n}">${l}</button>`).join('')}</div></div>
      <h3 style="margin-top:14px">${kind === 'muscle' ? 'Muscular' : 'Cardio'} Load Breakdown</h3>
      <div class="ptab">${[['Calibrating', '#8d8b85', ncal], ...counts].map(([n, c, v]) => `<div class="pbrk"><span>${n}</span><b class="pdays">${v}d</b><div class="pbrkbar"><i style="width:${v / S.length * 100}%;background:${c}"></i></div><span class="small muted">${r0(v / S.length * 100)}%</span></div>`).join('')}</div>
      <div class="pcard pinfo"><div class="small muted">ⓘ How it works</div>${kind === 'muscle'
        ? 'Muscular load is the Garmin training load of your strength and gym workouts, averaged over 7 days and compared with your last 4 weeks. It needs about 3 weeks of strength workouts before it shows a status.'
        : 'Cardio load is your daily heart-rate load (minutes in higher zones count more, plus steps) averaged over 7 days. The green band is 0.8–1.3× your 4-week average: below it you are detraining, above 1.5× you are building faster than your body is used to.'}</div>`;
  };
  openSheet(`<div id="pload">${body()}</div>`, sh => {
    const wire = () => {
      sh.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; sh.querySelector('#pload').innerHTML = body(); wire(); });
      sh.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { range = +b.dataset.r; sh.querySelector('#pload').innerHTML = body(); wire(); });
    };
    wire();
  });
}

// ---------- workout: cardio focus ----------
function cardioFocusHTML(d) {
  const z = d.hr_zones_s || []; const tot = z.reduce((a, x) => a + (x || 0), 0);
  if (!tot) return '';
  const low = (z[0] || 0) + (z[1] || 0), high = (z[2] || 0) + (z[3] || 0), ana = z[4] || 0;
  const zl = z.map(s => (s || 0) / 60), trimp = zl.reduce((a, m, i) => a + m * H_ZW[i], 0);
  const row = (n, s, c, te) => `<div class="pbrk"><span>${n}</span><div class="pbrkbar"><i style="width:${s / tot * 100}%;background:${c}"></i></div><b>${r0(s / tot * 100)}%</b><span class="small muted pdur">${te || ''}</span></div>`;
  return `<div class="card"><b>Cardio Focus</b><div class="small muted" style="margin-bottom:6px">Where this workout's time went, by heart-rate zone</div>
    ${row('Anaerobic', ana, '#e5484d', d.anaerobic_te != null ? `TE ${r1(d.anaerobic_te)}` : '')}${row('High aerobic', high, '#f0a030', '')}${row('Low aerobic', low, '#3fc2b0', d.aerobic_te != null ? `TE ${r1(d.aerobic_te)}` : '')}
    <div class="small muted" style="margin-top:6px">Low aerobic = zones 1–2 (base fitness), high aerobic = zones 3–4 (tempo/threshold), anaerobic = zone 5. Heart-rate load from this workout: <b style="color:var(--ink)">${r0(trimp)}</b>.</div></div>`;
}

// ---------- Journal insights: what you log vs the next night ----------
// For each habit, compare the next night's sleep, HRV, resting HR and recovery on days with it vs without,
// over the last 120 days. Food habits only count days with food logged.
const J_OUT = [
  ['score', 'sleep score', 'up', d => H(d, 'score')],
  ['hrv', 'HRV', 'up', d => H(d, 'hrv'), 'ms'],
  ['rhr', 'resting HR', 'down', d => H(d, 'rhr'), 'bpm'],
  ['rec', 'recovery', 'up', d => scoreOn(d).recovery, '%'],
];
function jFactors() {
  const all = [...entries, ...remote], by = {};
  all.forEach(e => (by[e.date] = by[e.date] || []).push(e));
  const food = d => by[d] && by[d].length >= 2;   // a day counts as logged with 2+ entries
  const sum = (d, k) => (by[d] || []).reduce((a, e) => a + (e[k] || 0), 0);
  return [
    ['late', '🌙', 'Late meal', 'a meal or snack of 150+ kcal after 9 pm', food, d => (by[d] || []).some(e => e.time >= '21:00' && e.kcal >= 150), 'After late meals'],
    ['caf', '☕', 'Caffeine after 2 pm', 'coffee, tea or energy drinks after 2 pm', food, d => (by[d] || []).some(e => e.time >= '14:00' && (e.caf || 0) > 0), 'After afternoon caffeine'],
    ['alc', '🍺', 'Alcohol', 'any drink with alcohol', food, d => sum(d, 'alc') > 0, 'After drinking'],
    ['prot', '🥩', 'Protein target hit', `${r0(settings.protein * 0.9)}+ g protein`, food, d => sum(d, 'p') >= settings.protein * 0.9, 'After high-protein days'],
    ['over', '🍽', 'Big eating day', `more than ${fmt(settings.kcal + 300)} kcal`, food, d => sum(d, 'kcal') > settings.kcal + 300, 'After big eating days'],
    ['wk', '🏋️', 'Workout', 'a run, ride or strength session (not walks)', d => !!health[d], d => acts.some(a => a.date === d && a.type !== 'walking'), 'After workout days'],
    ['steps', '👟', '10k+ steps', '10,000 steps or more', d => H(d, 'steps') != null, d => H(d, 'steps') >= 10000, 'After 10k-step days'],
    ['bed', '🛏', 'Late bedtime', 'asleep after 00:30', d => !!H(addDays(d, 1), 'bed'), d => (bedClock(addDays(d, 1)) || 0) > 1470, 'After late bedtimes'],
  ];
}
let _jMemo = { key: '', v: null };
function journalStats() {
  const key = Object.keys(health).length + ':' + entries.length + ':' + remote.length + ':' + acts.length + ':' + todayStr() + ':' + settings.protein + ':' + settings.kcal;
  if (_jMemo.key === key) return _jMemo.v;
  const days = daysBack(addDays(todayStr(), -1), 120);
  const out = jFactors().map(([k, ic, n, desc, valid, test, lead]) => {
    const pool = days.filter(valid), yesD = pool.filter(test);
    const res = J_OUT.map(([ok, on, good, get, u]) => {
      const yes = [], no = [];
      pool.forEach(d => { const v = get(addDays(d, 1)); if (v != null) (test(d) ? yes : no).push(v); });
      if (yes.length < 4 || no.length < 4) return { ok, on, u, n: [yes.length, no.length] };
      const diff = mean(yes) - mean(no), spread = sd([...yes, ...no]) || 1, z = diff / spread;
      return { ok, on, u, diff, z, good: (diff > 0) === (good === 'up'), n: [yes.length, no.length], a: mean(yes), b: mean(no) };
    });
    return { k, ic, n, desc, lead, days: pool.length, hits: yesD.length, res };
  });
  // Strongest findings: |effect| at least 0.35 standard deviations
  const finds = [];
  out.forEach(f => f.res.forEach(r => { if (r.z != null && Math.abs(r.z) >= 0.35) finds.push({ f, r }); }));
  finds.sort((x, y) => Math.abs(y.r.z) - Math.abs(x.r.z));
  return (_jMemo = { key, v: { out, finds } }).v;
}
const jDiff = r => `${r.diff > 0 ? '+' : '−'}${r.u === 'ms' || r.u === 'bpm' ? r1(Math.abs(r.diff)) : r0(Math.abs(r.diff))}${r.u ? (r.u === '%' ? '%' : ' ' + r.u) : ''}`;
const jSentence = (f, r) => `${f.lead}, your ${r.on} is ${r.u === 'ms' || r.u === 'bpm' ? r1(Math.abs(r.diff)) : r0(Math.abs(r.diff))}${r.u === '%' ? ' points' : r.u ? ' ' + r.u : ' points'} ${r.diff > 0 ? 'higher' : 'lower'}`;
function journalCard() {
  if (!Object.keys(health).length) return '';
  const { finds } = journalStats(), top = [];
  finds.forEach(x => { if (top.length < 3 && x.r.n[0] >= 5 && x.r.n[1] >= 5 && !top.some(t => t.f.k === x.f.k)) top.push(x); });
  return `<h2 class="hsec">Journal Insights</h2><div class="card hjour" id="hjour">${top.length ? top.map(({ f, r }) => `<div class="hjl"><span class="htli">${f.ic}</span><span class="grow">${esc(jSentence(f, r))}.<div class="small muted">${r.n[0]} vs ${r.n[1]} nights</div></span><b style="color:${r.good ? '#3fb37f' : '#e5484d'}">${jDiff(r)}</b></div>`).join('')
    : '<div class="small muted">No clear patterns yet. They show up once a habit has at least 5 nights with it and 5 without, so keep logging food.</div>'}
    <div class="small muted hjfoot">From the last 120 days of your logs · tap for all habits</div></div>`;
}
function journalPage() {
  const { out } = journalStats();
  const html = `<div class="phero"><h1>Journal Insights</h1><div class="psub">How your habits line up with the next night</div></div>
    <div class="pcoach" style="margin-top:14px"><div class="small muted">How to read this</div>Each habit compares the night after days <b>with</b> it against days <b>without</b> it, over the last 120 days. Green means better, red worse. These are patterns in your own data, not proof of cause, and they get more reliable as you log more.</div>
    ${out.map(f => `<div class="pcard"><div class="pjh"><span class="htli">${f.ic}</span><span class="grow"><b>${esc(f.n)}</b><div class="small muted">${esc(f.desc)} · ${f.hits} of ${f.days} days${f.res.some(r => r.z != null && Math.min(...r.n) < 8) ? ' · early, few nights' : ''}</div></span></div>
      ${f.res.map(r => r.z == null ? `<div class="pjr"><span>${cap(r.on)}</span><span class="small muted">Not enough data (${r.n[0]} with, ${r.n[1]} without)</span></div>`
        : `<div class="pjr"><span>${cap(r.on)}</span><span class="pjbar"><i style="${r.diff >= 0 ? 'left:50%' : 'right:50%'};width:${Math.min(50, Math.abs(r.z) * 40)}%;background:${Math.abs(r.z) < 0.2 ? '#8d8b85' : r.good ? '#3fb37f' : '#e5484d'}"></i></span><b style="color:${Math.abs(r.z) < 0.2 ? 'var(--muted)' : r.good ? '#3fb37f' : '#e5484d'}">${jDiff(r)}</b></div>`).join('')}</div>`).join('')}`;
  openPage('Journal Insights', html, null, 'rgba(76,155,232,.2)');
}
