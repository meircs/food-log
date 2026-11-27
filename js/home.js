'use strict';
/* Home tab (Bevel-style): Strain, Recovery and Sleep scores, coaching, Stress & Energy, nutrition at a glance.
   Scores are our own, computed from Garmin data:
   - Sleep    = Garmin's sleep score.
   - Recovery = HRV and resting HR vs your last 30 days, last night's sleep, and Body Battery at its peak.
   - Strain   = today's cardio load: heart-rate-zone minutes of workouts plus everyday steps, on a 0–100 curve.
   - Target strain comes from recovery: recover well, push more. */

const H_ZW = [1, 2, 3, 4.5, 6];          // effort weight per minute in HR zones 1–5
const clampP = v => Math.max(0, Math.min(100, Math.round(v)));
const sd = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

function homeScores(d) {
  const h = health[d] || {}, prev = Object.keys(health).filter(k => k < d && k >= addDays(d, -30)).map(k => health[k]);
  const out = { sleep: h.score != null ? clampP(h.score) : null, parts: {} };
  // Recovery
  const hv = prev.map(x => x.hrv).filter(Boolean), rh = prev.map(x => x.rhr).filter(Boolean);
  if (h.hrv != null || h.rhr != null || h.score != null) {
    let tot = 0, wt = 0;
    const add = (v, w, k, txt) => { if (v == null) return; tot += v * w; wt += w; out.parts[k] = { v: clampP(v), txt }; };
    if (h.hrv != null && hv.length >= 5) { const z = (h.hrv - mean(hv)) / (sd(hv) || 5); add(55 + 22 * z, 0.35, 'hrv', `HRV ${h.hrv} ms vs your usual ${r0(mean(hv))}`); }
    if (h.rhr != null && rh.length >= 5) { const z = (h.rhr - mean(rh)) / (sd(rh) || 2); add(55 - 22 * z, 0.25, 'rhr', `Resting HR ${h.rhr} vs your usual ${r0(mean(rh))}`); }
    if (h.score != null) add(h.score, 0.25, 'sleep', `Sleep score ${h.score}`);
    if (h.bbHi != null) add(h.bbHi, 0.15, 'bb', `Body Battery peaked at ${h.bbHi}`);
    out.recovery = wt ? clampP(tot / wt) : null;
  } else out.recovery = null;
  // Strain
  const today = acts.filter(a => a.date === d);
  let trimp = 0;
  today.forEach(a => { const z = a.z || []; const zt = z.reduce((s, x) => s + (x || 0), 0);
    trimp += zt ? z.reduce((s, x, i) => s + (x || 0) * H_ZW[i], 0) : (a.dur || 0) * 2; });
  const steps = h.steps || 0, load = trimp + steps / 250;
  out.strain = h.steps != null || today.length ? clampP(100 * (1 - Math.exp(-load / 110))) : null;
  out.strainParts = { trimp: r0(trimp), steps, workouts: today };
  out.target = out.recovery != null ? Math.max(30, Math.min(85, Math.round(25 + 0.55 * out.recovery))) : 50;
  const st = d === todayStr() ? actStatus().s : 'active';
  out.status = st;
  if (st !== 'active') out.target = Math.min(out.target, ACT[st].cap);
  return out;
}

function ringSVGHome(id, pct, c1, c2, target) {
  const R = 52, C = 2 * Math.PI * R, p = Math.max(0, Math.min(100, pct || 0)) / 100;
  const tgt = target != null && target > (pct || 0) ? Math.min(100, target) / 100 : null;
  return `<svg viewBox="0 0 130 130" class="hring">
    <defs><linearGradient id="g-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <pattern id="h-${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="5" fill="${c2}" opacity=".75"/></pattern></defs>
    <circle cx="65" cy="65" r="${R}" fill="none" stroke="var(--ringtrack)" stroke-width="16"/>
    <circle cx="65" cy="65" r="38" fill="var(--ringcore)"/>
    ${tgt ? `<circle cx="65" cy="65" r="${R}" fill="none" stroke="url(#h-${id})" stroke-width="12" stroke-dasharray="${(C * (tgt - p)).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-C * p).toFixed(1)}" transform="rotate(-90 65 65)"/>` : ''}
    ${pct ? `<circle cx="65" cy="65" r="${R}" fill="none" stroke="url(#g-${id})" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 65 65)"/>` : ''}
    <text x="65" y="73" text-anchor="middle" class="hringv">${pct == null ? '–' : `${pct}<tspan class="hringp">%</tspan>`}</text></svg>`;
}

function homeCoach(s, h, d) {
  if (s.strain == null && s.recovery == null) return 'Sync from Garmin to see today\'s scores.';
  const lines = [];
  const isToday = d === todayStr(), hr = new Date().getHours();
  if (isToday && s.status && s.status !== 'active') {
    lines.push(ACT[s.status].coach);
    if (s.strain != null && s.strain > s.target + 10) lines.push(`Strain is already ${s.strain}%, above the ${s.target}% that suits today. Ease off for the rest of the day.`);
    if (s.sleep != null && s.sleep < 60) lines.push(`Sleep was weak last night (${s.sleep}%), so an early night matters even more.`);
    return lines.join(' ');
  }
  if (s.recovery != null && s.recovery < 35) lines.push('Recovery is low today. Keep it easy: a walk and stretching are enough, and an early night will help most.');
  else if (s.strain != null && isToday) {
    const gap = s.target - s.strain;
    if (gap > 5) lines.push(`${s.strain >= 15 ? 'Good start. ' : ''}You can still add about ${gap}% strain to reach today's target of ${s.target}%${hr < 20 ? ' — a brisk 30-minute walk or your planned workout gets you there' : ''}.`);
    else if (gap >= -10) lines.push(`You've reached today's target strain of ${s.target}%. Nicely balanced.`);
    else lines.push(`You've gone well past today's target (${s.target}%). Prioritise food, water and sleep tonight.`);
  } else if (s.strain != null) lines.push(`Strain ${s.strain}% against a target of ${s.target}%.`);
  if (s.sleep != null && s.sleep < 60) lines.push(`Last night's sleep was weak (${s.sleep}%), so protect tonight's bedtime.`);
  else if (s.sleep != null && s.sleep >= 80 && lines.length < 2) lines.push('Great sleep last night.');
  return lines.join(' ');
}

// ---------- activity status (Bevel-style) ----------
// Active, Sick, Injured or On a Break. Lowers the strain target and changes coaching until it ends.
const ACT = {
  active:  { n: 'Active',     sub: 'Staying engaged and healthy',  ic: '🏃', c1: '#3fd8a4', c2: '#139b6c', cap: 100, coach: '' },
  sick:    { n: 'Sick',       sub: 'Resting from illness',         ic: '🛏', c1: '#ffd85c', c2: '#e0a412', cap: 15,
             coach: "You're marked as sick. Rest is the training today: skip workouts, drink plenty and sleep as much as you can." },
  injured: { n: 'Injured',    sub: 'Recovering from an injury',    ic: '🩹', c1: '#ff8a7a', c2: '#d9423a', cap: 30,
             coach: "You're marked as injured. Keep moving gently around the injury (walking, mobility) and skip anything that loads it." },
  break:   { n: 'On A Break', sub: 'Taking time off from training', ic: '🏝', c1: '#7fa8ff', c2: '#3c62d6', cap: 25,
             coach: "You're on a break from training. No workouts expected; everyday walking is plenty. Enjoy the time off." },
};
const ACT_KEEP = [['', 'Until changed'], ['1', '1 day'], ['3', '3 days'], ['7', '1 week'], ['14', '2 weeks']];
function actStatus() {
  const a = store.get('actStatus', null);
  if (!a || !ACT[a.s] || (a.until && todayStr() > a.until)) return { s: 'active', until: null };
  return a;
}
const actIcon = (k, cls = 'acti') => `<span class="${cls}" style="background:linear-gradient(160deg,${ACT[k].c1},${ACT[k].c2})">${ACT[k].ic}</span>`;
const actUntil = a => !a.until ? 'Until changed' : a.until === todayStr() ? 'Until tonight' : `Until ${(([y, m, d]) => new Date(y, m - 1, d))(a.until.split('-').map(Number)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
function actChip() {
  const a = actStatus();
  return `<button class="hchip" id="hact">${actIcon(a.s, 'hchipi acti')}<span><b>${ACT[a.s].n}</b><small>${actUntil(a)}</small></span>
    <svg class="hchev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button>`;
}
function actSheet(intro) {
  if (intro) {
    openSheet(`<div class="acthead">Activity Status</div>
      <div class="actgrid">${['active', 'injured', 'sick', 'break'].map(k => actIcon(k, 'actpill')).join('')}</div>
      <h3 class="acttitle">Activity Status</h3>
      <div class="actdesc">Set your Activity status to Active, Sick, Injured, or On a Break. The app will adjust your strain target and coaching to match how you feel.</div>
      <button class="btn actbtn" id="actgo">Continue</button>`, sh => {
      sh.querySelector('#actgo').onclick = () => { store.set('actIntro', true); actSheet(false); };
    });
    return;
  }
  const a = actStatus();
  const keep = a.keep || '';
  openSheet(`<div class="acthead">Activity Status</div>
    <div class="actlist">${Object.keys(ACT).map(k => `<label class="actrow">${actIcon(k)}<span class="grow"><b>${ACT[k].n}</b><small>${ACT[k].sub}</small></span>
      <input type="radio" name="acts" value="${k}"${k === a.s ? ' checked' : ''}></label>`).join('')}</div>
    <label class="actkeep"><span>⏱ Keep status</span><select id="actkeep">${ACT_KEEP.map(([v, l]) => `<option value="${v}"${v === keep ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <button class="btn actbtn" id="actupd">Update</button>`, sh => {
    const keepRow = sh.querySelector('.actkeep');
    const sync = () => { keepRow.style.opacity = sh.querySelector('input[name=acts]:checked').value === 'active' ? .45 : 1; };
    sh.querySelectorAll('input[name=acts]').forEach(r => r.onchange = sync); sync();
    sh.querySelector('#actupd').onclick = () => {
      const st = sh.querySelector('input[name=acts]:checked').value, n = sh.querySelector('#actkeep').value;
      store.set('actStatus', st === 'active' ? null : { s: st, until: n ? addDays(todayStr(), +n - 1) : null, keep: n, set: todayStr() });
      closeSheet(); toast(`Status: ${ACT[st].n}`); state.tab === 'home' && viewHome();
    };
  });
}

const STRESS_LBL = v => v == null ? '' : v <= 25 ? 'Rest' : v <= 50 ? 'Low' : v <= 75 ? 'Medium' : 'High';
const BB_FB = k => ({ DAY_BALANCED_AND_EXERCISE: 'Balanced day with exercise', DAY_RECOVERING_AND_INACTIVE: 'Recovering, quiet day', DAY_STRESSFUL: 'Stressful day', DAY_HIGHLY_STRESSFUL: 'Very stressful day', DAY_ACTIVE: 'Active day', DAY_BALANCED: 'Balanced day', SLEEP_TIME_PASSED_BALANCED_AND_EXERCISE: 'Past bedtime — time to wind down', EARLY_MORNING_HIGH_BB: 'Well charged this morning', EARLY_MORNING_LOW_BB: 'Low charge this morning', MORNING_HIGH_BB: 'Well charged', MORNING_LOW_BB: 'Low charge' }[k] || (k ? cap(k.toLowerCase().replace(/_/g, ' ')) : ''));

function stressGauge(v) {
  const R = 44, a0 = 135, span = 270, n = 30;
  let ticks = '';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), ang = (a0 + span * t) * Math.PI / 180, on = v != null && t * 100 <= v;
    const col = t < 0.25 ? '#5fbf7a' : t < 0.5 ? '#c9c24a' : t < 0.75 ? '#e8963c' : '#e5484d';
    const x1 = 55 + Math.cos(ang) * (R - 7), y1 = 55 + Math.sin(ang) * (R - 7), x2 = 55 + Math.cos(ang) * R, y2 = 55 + Math.sin(ang) * R;
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="2.4" stroke-linecap="round" opacity="${on ? 1 : .22}"/>`;
  }
  const lbl = STRESS_LBL(v), lc = { Rest: '#5fbf7a', Low: '#c9c24a', Medium: '#e8963c', High: '#e5484d' }[lbl] || 'var(--muted)';
  return `<svg viewBox="0 0 110 110" class="sgauge"><circle cx="55" cy="55" r="34" fill="var(--ringcore)"/>${ticks}
    <text x="55" y="58" text-anchor="middle" font-size="22" font-weight="700" fill="var(--ink)">${v ?? '–'}</text>
    <text x="55" y="75" text-anchor="middle" font-size="11" font-weight="600" fill="${lc}">${lbl}</text></svg>`;
}

function renderHomeHeader(h) {
  const d = state.date, isT = d === todayStr();
  const [y, m, dd] = d.split('-').map(Number), dt = new Date(y, m - 1, dd);
  const label = `${isT ? 'Today' : d === addDays(todayStr(), -1) ? 'Yesterday' : dt.toLocaleDateString(undefined, { weekday: 'long' })}, ${dt.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
  h.innerHTML = `<label class="hdate"><span>${esc(label)}</span><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
    <input type="date" id="hdpick" value="${d}" max="${todayStr()}" aria-label="Pick a day"></label>`;
  $('#hdpick').onchange = e => { const v = e.target.value; if (v && v <= todayStr()) { state.date = v; render('fade'); } };
}

// ---------- weather (Open-Meteo, no key) ----------
const WX = c => c === 0 ? ['☀️', 'Clear'] : c <= 2 ? ['🌤', 'Partly cloudy'] : c === 3 ? ['☁️', 'Cloudy'] : c <= 48 ? ['🌫', 'Fog'] : c <= 57 ? ['🌦', 'Drizzle'] : c <= 67 ? ['🌧', 'Rain'] : c <= 77 ? ['❄️', 'Snow'] : c <= 82 ? ['🌧', 'Showers'] : c <= 86 ? ['🌨', 'Snow showers'] : ['⛈', 'Storm'];
function weatherChip() {
  const w = store.get('wx', null);
  if (!w) return `<button class="hchip" id="hwx"><span class="hchipi">📍</span><span><b>Weather</b><small>Tap to use your location</small></span></button>`;
  const [ic, txt] = WX(w.code);
  return `<button class="hchip" id="hwx"><span class="hchipi">${ic}</span><span><b>${Math.round(w.t)}°C</b><small>${esc(w.place || txt)}</small></span></button>`;
}
async function loadWeather(ask) {
  const old = store.get('wx', null);
  if (!ask && old && Date.now() - old.at < 30 * 60000) return;
  const pos = await new Promise(res => {
    const loc = store.get('wxLoc', null);
    if (!ask && loc && Date.now() - loc.at < 6 * 3600000) return res(loc);
    if (!navigator.geolocation) return res(loc);
    navigator.geolocation.getCurrentPosition(p => { const l = { lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3), at: Date.now() }; store.set('wxLoc', l); res(l); },
      () => res(loc), { timeout: 8000, maximumAge: 3600000 });
  });
  if (!pos) { if (ask) toast('Location is off. Allow it for this app in iPhone Settings → Privacy → Location.'); return; }
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lon}&current=temperature_2m,weather_code&timezone=auto`);
    const j = await r.json();
    let place = (old && old.lat === pos.lat && old.lon === pos.lon) ? old.place : '';
    if (!place) { try { const g = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.lat}&longitude=${pos.lon}&localityLanguage=en`)).json();
      place = [g.city || g.locality, (g.principalSubdivisionCode || '').split('-')[1] || g.countryCode].filter(Boolean).join(', '); } catch (e) { } }
    store.set('wx', { t: j.current.temperature_2m, code: j.current.weather_code, place, lat: pos.lat, lon: pos.lon, at: Date.now() });
    if (state.tab === 'home') { const c = $('#hwx'); if (c) { c.outerHTML = weatherChip(); wireWx(); } }
  } catch (e) { if (ask) toast('Couldn’t load the weather'); }
}
function wireWx() { const c = $('#hwx'); if (c) c.onclick = () => loadWeather(true); }

// ---------- Fuel: what to eat today, from strain and goal ----------
// Your calorie target is set for a typical day. A harder day than usual adds food, an easier one trims it
// (about 8 kcal per strain point vs your 30-day usual, at most −300 / +400). Protein stays at target.
function fuelPlan(d, s) {
  const base = settings.kcal, prot = settings.protein;
  const prev = Array.from({ length: 30 }, (_, i) => addDays(d, -(i + 1))).map(x => (typeof scoreOn === 'function' ? scoreOn(x) : homeScores(x)).strain).filter(v => v != null);
  const usual = prev.length >= 7 ? Math.round(mean(prev)) : null;
  let adj = 0;
  if (s.strain != null && usual != null && s.status !== 'sick') adj = Math.max(-300, Math.min(400, Math.round((s.strain - usual) * 8 / 50) * 50));
  return { kcal: base + adj, adj, prot, usual };
}
function fuelIdea(remK, remP) {
  if (remP < 10) return '';
  const per = f => f.basis === 'serving' ? { k: f.kcal, p: f.p, l: f.servingLabel || '1 serving' } : f.servingGrams ? { k: f.kcal * f.servingGrams / 100, p: f.p * f.servingGrams / 100, l: f.servingLabel || `${f.servingGrams} g` } : null;
  const c = foods.map(f => ({ f, s: per(f) })).filter(x => x.s && x.s.p >= 8 && x.s.k <= Math.max(250, remK + 100) && x.s.p / Math.max(1, x.s.k) >= 0.06)
    .sort((a, b) => b.s.p / b.s.k - a.s.p / a.s.k || (b.f.uses || 0) - (a.f.uses || 0)).slice(0, 2);
  const nm = n => { const t = String(n).split(/[,(]/)[0].trim(); return t.length > 34 ? t.slice(0, 32).trim() + '…' : t; };
  return c.length ? `Ideas: ${c.map(x => `${esc(nm(x.f.name))} (${r0(x.s.k)} kcal, ${r0(x.s.p)} g protein)`).join(' or ')}.` : '';
}
function fuelCard(d, s, t, burned) {
  const isT = d === todayStr(), pl = isT ? fuelPlan(d, s) : { kcal: settings.kcal, adj: 0, prot: settings.protein };
  const remK = Math.round(pl.kcal - t.kcal), remP = Math.round(pl.prot - t.p);
  let head = '';
  if (isT) {
    const why = s.status && s.status !== 'active' ? `You're marked as ${ACT[s.status].n.toLowerCase()}, so eat to your normal target`
      : s.strain == null || pl.usual == null ? 'Aim for your usual target'
      : `Strain ${s.strain}% is ${Math.abs(s.strain - pl.usual) < 6 ? 'about your usual' : s.strain > pl.usual ? `above your usual ${pl.usual}%` : `below your usual ${pl.usual}%`}, so aim for`;
    const tgt = `~${fmt(Math.round(pl.kcal / 50) * 50)} kcal${pl.adj ? ` (${pl.adj > 0 ? '+' : '−'}${Math.abs(pl.adj)})` : ''} and ${pl.prot} g protein`;
    const left = remK > 50 || remP > 5 ? ` ${[remK > 50 && `${fmt(remK)} kcal`, remP > 5 && `${remP} g protein`].filter(Boolean).join(' and ')} to go.` : remK < -150 ? ` You're ${fmt(-remK)} kcal over.` : ' Target reached.';
    head = `<div class="hfuel">${why.endsWith('for') ? `${why} <b>${tgt}</b>.` : `${why}: <b>${tgt}</b>.`}${left}${remK > -150 ? ` <span class="muted">${fuelIdea(remK, remP)}</span>` : ''}</div>`;
  }
  return `<div class="card hnut" id="hnut">${head}<div class="hnutrow">
      ${ringSVG(pl.kcal ? t.kcal / pl.kcal : 0, 'var(--accent)', fmt(t.kcal), `of ${fmt(Math.round(pl.kcal / 50) * 50)}`, t.kcal > pl.kcal)}
      <div class="grow">
        ${[['Protein', t.p, pl.prot, 'var(--p)'], ['Carbs', t.c, null, 'var(--c)'], ['Fat', t.f, null, 'var(--f)']].map(([k, v, g, c]) => `<div class="hmac"><span>${k}</span><b>${r0(v)} g${g ? `<span class="muted"> / ${g}</span>` : ''}</b><div class="bar"><i style="width:${g ? Math.min(100, v / g * 100) : Math.min(100, v / 2.5)}%;background:${c}"></i></div></div>`).join('')}
        ${burned ? `<div class="small muted" style="margin-top:6px">Net energy <b style="color:var(--ink)">${t.kcal - burned > 0 ? '+' : '−'}${fmt(Math.abs(t.kcal - burned))}</b> kcal · burned ${fmt(burned)} so far</div>` : ''}
      </div></div></div>`;
}

// ---------- Health Monitor: today vs your own normal ----------
function monitorTile(k, label, ico, v, unit, fmtv, d, lowBad, highBad) {
  const prev = Object.keys(health).filter(x => x < d && x >= addDays(d, -30)).map(x => health[x][k]).filter(x => x != null);
  if (v == null) return `<div class="hmon off"><div class="hmonh">${ico} ${label}</div><div class="hmonv">No data</div></div>`;
  let st = 'Normal', col = 'var(--accent)', pos = 0.5, lo = null, hi = null;
  if (prev.length >= 7) {
    const m = mean(prev), s = sd(prev) || 1; lo = m - 1.5 * s; hi = m + 1.5 * s;
    const z = (v - m) / s; pos = Math.max(0.04, Math.min(0.96, 0.5 + z / 4));
    if (z > 1.5 && highBad) { st = 'High'; col = '#e8963c'; } else if (z < -1.5 && lowBad) { st = 'Low'; col = '#e8963c'; }
    else if (Math.abs(z) > 1.5) st = z > 0 ? 'Above usual' : 'Below usual';
  }
  return `<div class="hmon" data-mon="${k}"><div class="hmonh">${ico} ${label}</div>
    <div class="hmonv">${fmtv(v)}<small> ${unit}</small></div><div class="hmons" style="color:${col}"><i style="background:${col}">✓</i>${st}</div>
    <div class="hmonbar"><i style="background:${col};opacity:.75"></i><b style="bottom:calc(${(pos * 100).toFixed(0)}% - 8px);border-color:${col}"></b></div>
    ${lo != null ? `<div class="hmonr">usual ${fmtv(lo)}–${fmtv(hi)}</div>` : ''}</div>`;
}

// ---------- Cardio load: last 7 days vs last 4 weeks ----------
function dayLoad(d) {
  let trimp = 0;
  acts.filter(a => a.date === d).forEach(a => { const z = a.z || [], zt = z.reduce((s, x) => s + (x || 0), 0);
    trimp += zt ? z.reduce((s, x, i) => s + (x || 0) * H_ZW[i], 0) : (a.dur || 0) * 2; });
  return trimp + ((health[d] || {}).steps || 0) / 250;
}
function cardioLoad(d) {
  const days = Array.from({ length: 70 }, (_, i) => addDays(d, -69 + i)), L = Object.fromEntries(days.map(x => [x, dayLoad(x)]));
  const avg = (end, n) => { let s = 0; for (let i = 0; i < n; i++) s += L[addDays(end, -i)] || 0; return s / n; };
  const series = days.slice(-42).map(x => ({ x, a: avg(x, 7), c: avg(x, 28) }));
  const last = series[series.length - 1], ratio = last.c ? last.a / last.c : 1;
  const st = ratio < 0.8 ? ['Detraining', '#4c9be8', 'Less than your usual. Fine for a rest week; keep it short.'] : ratio <= 1.3 ? ['Optimal', 'var(--accent)', 'Steady build. Keep this rhythm.']
    : ratio <= 1.5 ? ['High', '#e8963c', 'Ramping up fast. Add a recovery day if you feel tired.'] : ['Overreaching', '#e5487f', 'Much more than your body is used to. Plan an easy day.'];
  return { value: Math.round(last.a), ratio, st, series };
}
function cardioCard(d) {
  const c = cardioLoad(d), W = 200, H = 70, S = c.series, hi = Math.max(...S.map(p => Math.max(p.a, p.c * 1.3))) || 1;
  const X = i => (i / (S.length - 1)) * W, Y = v => H - 4 - (v / hi) * (H - 10);
  const band = S.map((p, i) => `${X(i).toFixed(1)},${Y(p.c * 1.3).toFixed(1)}`).join(' ') + ' ' + S.map((p, i) => `${X(i).toFixed(1)},${Y(p.c * 0.8).toFixed(1)}`).reverse().join(' ');
  const line = S.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.a).toFixed(1)}`).join('');
  const lp = S[S.length - 1];
  return `<div class="card hcl" id="hcl"><div class="hclh">🏃 Last 7 days</div>
    <div class="hclb"><div><div class="hclv">${c.value}</div><div class="hcls" style="color:${c.st[1]}">${c.st[0]}</div></div>
    <svg viewBox="0 0 ${W} ${H}" class="hclc"><polygon points="${band}" fill="var(--accent)" opacity=".16"/><path d="${line}" fill="none" stroke="#b9a7ff" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${X(S.length - 1)}" cy="${Y(lp.a)}" r="5" fill="${c.st[1]}" stroke="var(--card)" stroke-width="2"/></svg></div>
    <div class="small muted">${esc(c.st[2])} The shaded band is your healthy range, based on your last 4 weeks.</div></div>`;
}

// ---------- Timeline of the day ----------
function timelineCard(d) {
  const ev = [], h = health[d] || {};
  if (h.wake && h.hrs >= 3) ev.push({ t: h.wake, ic: '🌅', title: 'Woke up', sub: `${r1(h.hrs)} h sleep${h.score ? ` · score ${h.score}` : ''}` });
  acts.filter(a => a.date === d).forEach(a => ev.push({ t: a.start, ic: WK_ICON(a.type), title: a.name || wkWords(a.type), sub: `${r0(a.dur)} min${a.km ? ` · ${r1(a.km)} km` : ''}${a.hr ? ` · ${r0(a.hr)} bpm` : ''}`, act: a }));
  const food = [...entries, ...remote].filter(e => e.date === d), meals = {};
  food.forEach(e => { const k = e.meal || 'snack'; (meals[k] = meals[k] || []).push(e); });
  Object.entries(meals).forEach(([k, arr]) => { arr.sort((a, b) => a.time.localeCompare(b.time)); const t = totals(arr);
    ev.push({ t: arr[0].time, ic: { breakfast: '🍳', lunch: '🥗', dinner: '🍽', snack: '🍎', drink: '☕' }[k] || '🍴', title: cap(k), sub: `${fmt(t.kcal)} kcal · ${r0(t.p)} g protein`, food: 1 }); });
  weightLog.filter(w => w.date === d).forEach(w => ev.push({ t: w.time || '07:00', ic: '⚖️', title: 'Weigh-in', sub: `${r1(w.kg)} kg${w.bf ? ` · ${r1(w.bf)}% fat` : ''}` }));
  (typeof bpAll === 'function' ? bpAll() : []).filter(x => x.date === d).forEach(x => ev.push({ t: x.time, ic: '🩺', title: 'Blood pressure', sub: `${r0(x.s)}/${r0(x.d)}` }));
  ev.sort((a, b) => (a.t || '').localeCompare(b.t || ''));
  const show = state.tlAll ? ev : ev.slice(0, 5);
  return `<h2 class="hsec">Timeline</h2><div class="small muted" style="margin:-6px 4px 8px">${ev.length} event${ev.length === 1 ? '' : 's'}</div>
    <div class="card htl">${ev.length ? show.map((e, i) => `<div class="htle" data-tl="${i}"><span class="htlt">${e.t ? minTxt(bedMin(e.t)) : ''}</span><span class="htli">${e.ic}</span><span class="grow"><b>${esc(e.title)}</b><div class="small muted">${esc(e.sub)}</div></span></div>`).join('')
      : '<div class="muted small" style="padding:8px 2px">Nothing yet today.</div>'}
      ${ev.length > 5 ? `<button class="btn secondary" id="htlall" style="margin-top:8px">${state.tlAll ? 'Show less' : `View all ${ev.length}`}</button>` : ''}</div>`;
}

function viewHome() {
  const d = state.date, h = health[d] || {}, s = homeScores(d);
  if (!Object.keys(health).length) {
    if (!settings.ghToken) { $('#view').innerHTML = '<div class="empty">Connect GitHub in More to see your Garmin scores here.</div>'; return; }
    $('#view').innerHTML = '<div class="empty">Loading Garmin data…</div>';
    if (!viewHome.tried) { viewHome.tried = true; pullGarmin(true).then(() => state.tab === 'home' && Object.keys(health).length && viewHome()); }
    return;
  }
  const t = totals([...entries, ...remote].filter(e => e.date === d));
  const burned = h.total || (garmin[d] || {}).total || null;
  const sp = [h.sRest, h.sLow, h.sMed, h.sHigh], spT = sp.reduce((a, x) => a + (x || 0), 0);
  const bb = h.bbNow ?? null;
  const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)}m`;
  const plan = d === todayStr() && typeof planCardHTML === 'function' ? planCardHTML() : '';
  const recChip = `<div class="hchip"><span class="hchipi">🫀</span><span><b>Recovery ${s.recovery ?? '–'}%</b><small>${s.recovery == null ? 'no data yet' : s.recovery >= 66 ? 'ready to push' : s.recovery >= 35 ? 'train as planned' : 'take it easy'}</small></span></div>`;
  let html = `<div class="hchips">${d === todayStr() ? actChip() : recChip}${d === todayStr() ? weatherChip() : ''}</div>
    <div class="card hscores">
      <div class="hrings">
        <button class="hr1" data-sc="strain">${ringSVGHome('st', s.strain, '#ffd36b', '#f59a2a', s.target)}<b>Strain</b></button>
        <button class="hr1" data-sc="recovery">${ringSVGHome('rc', s.recovery, '#e3ea3f', '#5fc21a')}<b>Recovery</b></button>
        <button class="hr1" data-sc="sleep">${ringSVGHome('sl', s.sleep, '#9fd0ff', '#6e5ae6')}<b>Sleep</b></button>
      </div>
      <div class="hcoach"><div class="small muted hcap">COACHING</div>${esc(homeCoach(s, h, d))}</div>
    </div>
    ${plan}
    <h2 class="hsec">Stress &amp; Energy</h2>
    <div class="card hstress" id="hstress">
      <div class="grow">
        <div class="hst"><i class="hdot" style="background:${{ Rest: '#5fbf7a', Low: '#c9c24a', Medium: '#e8963c', High: '#e5484d' }[STRESS_LBL(h.stress)] || 'var(--muted)'}"></i>${d === todayStr() ? "Today's stress" : 'Stress'}</div>
        <div class="small muted">${h.until && d === todayStr() ? `Last updated at ${minTxt(bedMin(h.until))}` : shortDay(d, true)}</div>
        <div class="hnums"><div><b style="color:#e5484d">${h.maxStress ?? '–'}</b><span>Highest</span></div><div><b style="color:#c9c24a">${h.stress ?? '–'}</b><span>Average</span></div><div><b style="color:#5fbf7a">${h.sRest != null ? fmtMin(h.sRest) : '–'}</b><span>Resting</span></div></div>
      </div>${stressGauge(h.stress)}
      ${spT ? `<div class="hsbar">${sp.map((x, i) => x ? `<i style="width:${x / spT * 100}%;background:${['#4c9be8', '#c9c24a', '#e8963c', '#e5484d'][i]}"></i>` : '').join('')}</div>
      <div class="hsleg small muted"><span><i style="background:#4c9be8"></i>Rest ${fmtMin(h.sRest || 0)}</span><span><i style="background:#c9c24a"></i>Low ${fmtMin(h.sLow || 0)}</span><span><i style="background:#e8963c"></i>Medium ${fmtMin(h.sMed || 0)}</span><span><i style="background:#e5484d"></i>High ${fmtMin(h.sHigh || 0)}</span></div>` : ''}
    </div>
    <div class="card hbb" id="hbb"><span class="hbolt">⚡</span><div class="hbbbar">${Array.from({ length: 30 }, (_, i) => `<i class="${bb != null && i < Math.round(bb / 100 * 30) ? 'on' : ''}"></i>`).join('')}</div><b>${bb != null ? bb + '%' : h.bbHi != null ? h.bbHi + '%' : '–'}</b></div>
    <div class="small muted hbbsub">${bb != null ? `Body Battery now${h.bbFb ? ' · ' + esc(BB_FB(h.bbFb)) : ''}` : 'Body Battery peak'}${h.bbHi != null ? ` · today ${h.bbLo}–${h.bbHi}` : ''}${h.bbCh != null ? ` · +${h.bbCh} / −${h.bbDr}` : ''}</div>
    <h2 class="hsec">${d === todayStr() ? 'Fuel' : 'Nutrition'}</h2>
    ${fuelCard(d, s, t, burned)}
    ${typeof journalCard === 'function' ? journalCard() : ''}
    <h2 class="hsec">Health Monitor</h2>
    <div class="hmongrid">
      ${monitorTile('resp', 'RR', '🫁', h.resp, 'rpm', v => r1(v), d, false, true)}
      ${monitorTile('rhr', 'RHR', '❤️', h.rhr, 'bpm', v => r0(v), d, false, true)}
      ${monitorTile('hrv', 'HRV', '〰️', h.hrv, 'ms', v => r0(v), d, true, false)}
      ${monitorTile('spo2', 'SpO2', '💧', h.spo2, '%', v => r0(v), d, true, false)}
      ${monitorTile('stress', 'Stress', '🧠', h.stress, 'avg', v => r0(v), d, false, true)}
      ${monitorTile('hrs', 'Sleep', '🛏', h.hrs, '', v => `${Math.floor(v)}h ${String(Math.round((v % 1) * 60)).padStart(2, '0')}m`, d, true, false)}
    </div>
    <div class="small muted" style="margin:6px 4px 0">Compared with your own last 30 days. Wrist readings are estimates.</div>
    <h2 class="hsec">Cardio Load</h2>${cardioCard(d)}
    ${timelineCard(d)}
    <div class="hend"></div>`;
  $('#view').innerHTML = html;
  wireWx(); if (d === todayStr()) loadWeather(false);
  const ac = $('#hact'); if (ac) ac.onclick = () => actSheet(!store.get('actIntro', false));
  document.querySelectorAll('[data-mon]').forEach(t => t.onclick = () => openMetric(t.dataset.mon, d, MON_KEYS));
  $('#hcl').onclick = () => openLoad('cardio', d);
  const ta = $('#htlall'); if (ta) ta.onclick = () => { state.tlAll = !state.tlAll; viewHome(); };
  document.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => scorePage(b.dataset.sc, d));
  $('#hnut').onclick = () => { state.tab = 'today'; render('fade'); window.scrollTo(0, 0); };
  const jc = $('#hjour'); if (jc) jc.onclick = () => journalPage();
  $('#hstress').onclick = () => stressPage(d);
  $('#hbb').onclick = () => energyPage(d);
  if (typeof wirePlanCard === 'function') wirePlanCard();
}

