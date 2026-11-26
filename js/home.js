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
  h.innerHTML = `<button class="iconbtn" id="prev" aria-label="Previous day">‹</button>
    <h1 id="dlabel">${isT ? 'Today' : esc(dateLabel(d))}</h1>
    <button class="iconbtn" id="next" aria-label="Next day" ${isT ? 'disabled style="opacity:.3"' : ''}>›</button>`;
  $('#prev').onclick = () => { state.date = addDays(state.date, -1); render('in-left'); };
  $('#next').onclick = () => { if (state.date < todayStr()) { state.date = addDays(state.date, 1); render('in-right'); } };
  $('#dlabel').onclick = () => { state.date = todayStr(); render(); };
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
  let html = `<div class="hsync"><button class="hpill" id="hsync" ${garminSyncing ? 'disabled' : ''}>${garminSyncing ? 'Syncing… <span class="spin"></span>' : `↻ Sync${h.until && d === todayStr() ? ` · data to ${minTxt(bedMin(h.until))}` : ''}`}</button></div>
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
    <h2 class="hsec">Nutrition</h2>
    <div class="card hnut" id="hnut">
      ${ringSVG(settings.kcal ? t.kcal / settings.kcal : 0, 'var(--accent)', fmt(t.kcal), `of ${fmt(settings.kcal)}`, t.kcal > settings.kcal)}
      <div class="grow">
        ${[['Protein', t.p, settings.protein, 'var(--p)'], ['Carbs', t.c, null, 'var(--c)'], ['Fat', t.f, null, 'var(--f)']].map(([k, v, g, c]) => `<div class="hmac"><span>${k}</span><b>${r0(v)} g${g ? `<span class="muted"> / ${g}</span>` : ''}</b><div class="bar"><i style="width:${g ? Math.min(100, v / g * 100) : Math.min(100, v / 2.5)}%;background:${c}"></i></div></div>`).join('')}
        ${burned ? `<div class="small muted" style="margin-top:6px">Net energy <b style="color:var(--ink)">${t.kcal - burned > 0 ? '+' : '−'}${fmt(Math.abs(t.kcal - burned))}</b> kcal · burned ${fmt(burned)} so far</div>` : ''}
      </div>
    </div><div class="hend"></div>`;
  $('#view').innerHTML = html;
  $('#hsync').onclick = async () => { if (garminSyncing) return; const p = syncGarminNow(() => {}); viewHome(); try { await p; } catch (e) { } if (state.tab === 'home') viewHome(); };
  document.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => homeScoreSheet(b.dataset.sc, s, h, d));
  $('#hnut').onclick = () => { state.tab = 'today'; render('fade'); window.scrollTo(0, 0); };
  $('#hstress').onclick = $('#hbb').onclick = () => { state.tab = 'health'; state.hsec = 'overview'; render('fade'); window.scrollTo(0, 0); };
  if (typeof wirePlanCard === 'function') wirePlanCard();
}

function homeScoreSheet(k, s, h, d) {
  const row = (l, v) => `<div class="wkrow"><span>${l}</span><b>${v}</b></div>`;
  let body = '';
  if (k === 'strain') {
    const w = s.strainParts.workouts;
    body = `<h3>Strain ${s.strain ?? '–'}%</h3><div class="small muted">How hard your heart worked today. Target today: <b>${s.target}%</b> (set by your recovery).</div>
      <div class="card" style="margin-top:12px">${row('Everyday steps', fmt(s.strainParts.steps))}${row('Workouts', w.length ? w.map(a => `${esc(a.name || a.type)} ${r0(a.dur)} min`).join(', ') : 'none')}${row('Heart-rate load', s.strainParts.trimp)}</div>
      <div class="small muted">Minutes in higher heart-rate zones count more (zone 5 counts 6× zone 1). The scale flattens near the top, so going from 80% to 90% takes far more work than from 20% to 30%.</div>`;
  } else if (k === 'recovery') {
    const P = s.parts;
    body = `<h3>Recovery ${s.recovery ?? '–'}%</h3><div class="small muted">How ready your body is for effort today, compared with your own last 30 days.</div>
      <div class="card" style="margin-top:12px">${Object.entries({ hrv: 'HRV (35%)', rhr: 'Resting heart rate (25%)', sleep: 'Sleep (25%)', bb: 'Body Battery (15%)' }).map(([kk, l]) => P[kk] ? `<div class="wkrow"><span>${l}<div class="small muted">${esc(P[kk].txt)}</div></span><b>${P[kk].v}</b></div>` : '').join('')}</div>
      <div class="small muted">Above ~66% is a good day to train hard; below ~35% is a day to take it easy.</div>`;
  } else {
    body = `<h3>Sleep ${s.sleep ?? '–'}%</h3><div class="small muted">Garmin's sleep score for the night ending ${shortDay(d, true)}.</div>
      <div class="card" style="margin-top:12px">${row('Asleep', h.hrs != null ? `${r1(h.hrs)} h` : '–')}${row('Fell asleep · woke', `${h.bed ? minTxt(bedMin(h.bed)) : '–'} · ${h.wake ? minTxt(bedMin(h.wake)) : '–'}`)}${row('Deep · REM · light', `${r1(h.deep || 0)} · ${r1(h.rem || 0)} · ${r1(h.light || 0)} h`)}${row('Awake', h.awake != null ? `${r0(h.awake * 60)} min` : '–')}${h.sleepHr ? row('Avg heart rate asleep', `${r0(h.sleepHr)} bpm`) : ''}${h.hrv ? row('Overnight HRV', `${h.hrv} ms`) : ''}</div>`;
  }
  openSheet(body);
}
