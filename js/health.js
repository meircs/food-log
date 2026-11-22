'use strict';
/* Health tab: Garmin sleep, HRV, heart rate, Body Battery, steps, stress, training. */
// ---------- Health ----------
function hBuckets(r) {
  const days = Array.from({ length: r }, (_, i) => addDays(todayStr(), i - r + 1));
  const md = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  if (r <= 31) return days.map(d => ({ label: r <= 7 ? shortDay(d) : d.slice(8).replace(/^0/, ''), tip: shortDay(d, true), days: [d] }));
  if (r <= 120) { const b = []; let w = mondayOf(days[0]); if (w < days[0]) w = addDays(w, 7); for (; w <= todayStr(); w = addDays(w, 7)) { const ds = Array.from({ length: 7 }, (_, k) => addDays(w, k)); b.push({ label: md(w), tip: `Week of ${md(w)} (Mon–Sun)`, days: ds }); } return b; }
  const by = {}; days.forEach(d => (by[d.slice(0, 7)] = by[d.slice(0, 7)] || []).push(d));
  return Object.entries(by).map(([k, ds]) => { const [y, m] = k.split('-').map(Number); const dt = new Date(y, m - 1, 1);
    return { label: dt.toLocaleDateString(undefined, { month: 'short' }), tip: dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), days: ds }; });
}
function bAvg(b, f) { const v = b.days.map(d => health[d] ? f(health[d], d) : null).filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null; }
function bSum(b, f) { const v = b.days.map(d => health[d] ? f(health[d], d) : null).filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, c) => a + c, 0) : null; }
function axis(max, min = 0) {
  const span = max - min || 1, raw = span / 3, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => span / k <= 4);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step; const ticks = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
}
function tickLabel(v) { return Math.abs(v) >= 1000 ? (v / 1000) + 'k' : String(v); }
// Generic bar chart over buckets. series: [{name,color,vals}] stacked bottom→top; or floating {lo,hi}.
function hBars({ id, buckets, series, floating, target, fmtTip }) {
  const W = 340, H = 170, L = 36, R = 6, T = 10, B = 22, pw = W - L - R, ph = H - T - B;
  const tot = buckets.map((_, i) => floating ? floating.hi[i] : series.reduce((a, s) => a + (s.vals[i] || 0), 0));
  const minV = floating ? Math.min(...floating.lo.filter(v => v != null), 100) : 0;
  const ax = axis(Math.max(1, ...tot.filter(v => v != null), target || 0), floating ? Math.max(0, minV - 5) : 0);
  const y = v => T + ph - (v - ax.lo) / (ax.hi - ax.lo) * ph;
  const slot = pw / buckets.length, bw = Math.max(3, Math.min(24, slot - 2));
  const every = Math.ceil(buckets.length / 8);
  let g = ax.ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${tickLabel(v)}</text>`).join('');
  if (target) g += `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  buckets.forEach((b, i) => {
    const x = L + slot * i + (slot - bw) / 2;
    if (floating) { const lo = floating.lo[i], hi = floating.hi[i];
      if (lo != null && hi != null) g += `<rect x="${x}" y="${y(hi)}" width="${bw}" height="${Math.max(2, y(lo) - y(hi))}" rx="${Math.min(4, bw / 2)}" fill="${floating.color}"/>`; }
    else { let acc = 0; const segs = series.map(s => ({ v: s.vals[i] || 0, c: s.color })).filter(sg => sg.v > 0);
      segs.forEach((sg, k) => { const y0 = y(acc), y1 = y(acc + sg.v); acc += sg.v; const top = k === segs.length - 1;
        const hgt = Math.max(1, y0 - y1 - (top ? 0 : 2));
        g += top ? `<path d="${topRounded(x, y1, bw, y0 - y1, 4)}" fill="${sg.c}"/>` : `<rect x="${x}" y="${y1 + 2}" width="${bw}" height="${hgt}" fill="${sg.c}"/>`; }); }
    if (i % every === 0 || i === buckets.length - 1 && buckets.length <= 8) g += `<text x="${L + slot * i + slot / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(b.label)}</text>`;
    g += `<rect class="hit" data-i="${i}" x="${L + slot * i}" y="${T}" width="${slot}" height="${ph + B}" fill="transparent"/>`;
  });
  return `<svg id="${id}" viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${g}<line x1="${L}" x2="${W - R}" y1="${y(ax.lo)}" y2="${y(ax.lo)}" stroke="var(--muted)"/></svg>
    <div class="small muted" id="${id}-cap" style="min-height:20px;margin-top:4px">Tap for details</div>`;
}
// Line chart over buckets, gaps where null; optional shaded band (e.g. HRV baseline).
function hLine({ id, buckets, vals, color, band }) {
  const W = 340, H = 160, L = 36, R = 8, T = 10, B = 22, pw = W - L - R, ph = H - T - B;
  const all = [...vals, ...(band ? [...band.lo, ...band.hi] : [])].filter(v => v != null);
  if (!all.length) return `<div class="empty small">No data in this period</div>`;
  const mn = Math.min(...all), mx = Math.max(...all), pad = Math.max(1, (mx - mn) * 0.15);
  const ax = axis(mx + pad, Math.max(0, mn - pad));
  const slot = pw / buckets.length, x = i => L + slot * i + slot / 2, y = v => T + ph - (v - ax.lo) / (ax.hi - ax.lo) * ph;
  const every = Math.ceil(buckets.length / 8);
  let g = ax.ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${tickLabel(v)}</text>`).join('');
  if (band) { const pts = buckets.map((_, i) => band.hi[i] != null && band.lo[i] != null ? i : -1).filter(i => i >= 0);
    if (pts.length) g += `<path d="M${pts.map(i => `${x(i)},${y(band.hi[i])}`).join('L')}L${pts.slice().reverse().map(i => `${x(i)},${y(band.lo[i])}`).join('L')}Z" fill="${color}" fill-opacity=".14"/>`; }
  let path = '', pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } path += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`; pen = true; });
  g += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (buckets.length <= 31) vals.forEach((v, i) => { if (v != null) g += `<circle cx="${x(i)}" cy="${y(v)}" r="${buckets.length <= 7 ? 4 : 2.5}" fill="${color}" stroke="var(--card)" stroke-width="1.5"/>`; });
  buckets.forEach((b, i) => {
    if (i % every === 0) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(b.label)}</text>`;
    g += `<rect class="hit" data-i="${i}" x="${L + slot * i}" y="${T}" width="${slot}" height="${ph + B}" fill="transparent"/>`;
  });
  return `<svg id="${id}" viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${g}</svg><div class="small muted" id="${id}-cap" style="min-height:20px;margin-top:4px">Tap for details</div>`;
}
function hm(h) { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; }
function viewHealth() {
  if (!settings.ghToken) { $('#view').innerHTML = `<div class="card"><b>Connect your health repo</b><div class="small muted" style="margin-top:6px">Health charts read your Garmin data from garmin-health. Add your GitHub token in More → Auto-sync first.</div></div>`; return; }
  const r = state.hrange || 7;
  const dates = Object.keys(health).sort();
  if (!dates.length) { $('#view').innerHTML = `<div class="empty">Loading Garmin data…</div>`; pullGarmin(true); return; }
  const last = health[todayStr()] && health[todayStr()].score != null ? todayStr() : dates.filter(d => health[d].score != null).pop() || dates[dates.length - 1];
  const L0 = health[last] || {};
  const bk = hBuckets(r), n = bk.length;
  const statusTxt = { BALANCED: '● Balanced', UNBALANCED: '▲ Unbalanced', LOW: '▼ Low', POOR: '▼ Poor' }[L0.hrvStatus] || (L0.hrvStatus ? L0.hrvStatus.toLowerCase() : '–');
  const tile = (label, val, sub) => `<div class="macro"><span class="small muted">${label}</span><b>${val}</b>${sub ? `<span class="small muted">${sub}</span>` : ''}</div>`;
  const rangeDays = bk.flatMap(b => b.days);
  const avgOf = f => { const v = rangeDays.map(d => health[d] ? f(health[d]) : null).filter(x => x != null); return v.length ? v.reduce((a, c) => a + c, 0) / v.length : null; };
  const wk = acts.filter(a => rangeDays.includes(a.date));
  let html = `<button class="btn secondary" id="gsync" ${garminSyncing ? 'disabled' : ''}>${garminSyncing ? '↻ Syncing from Garmin…' : '↻ Sync from Garmin now'}</button>
    <div class="card">
      <div class="spread"><b>Last night</b><span class="small muted">${esc(shortDay(last, true))}${L0.bed ? ` · ${esc(L0.bed)}–${esc(L0.wake)}` : ''}</span></div>
      <div class="spread" style="margin-top:6px"><div><div class="big">${L0.score ?? '–'}</div><div class="small muted">sleep score</div></div>
        <div style="text-align:right"><div style="font-size:22px;font-weight:650">${hm(L0.hrs)}</div><div class="small muted">deep ${hm(L0.deep)} · REM ${hm(L0.rem)}</div></div></div>
      <div class="macros">
        ${tile('HRV', L0.hrv != null ? L0.hrv + ' ms' : '–', `${statusTxt}${L0.hrvLo ? ` · base ${L0.hrvLo}–${L0.hrvHi}` : ''}`)}
        ${tile('Resting HR', L0.rhr != null ? L0.rhr + ' bpm' : '–', '')}
        ${tile('Body Battery', L0.bbHi != null ? L0.bbHi : '–', L0.bbHi != null ? 'morning high' : '')}
      </div></div>
    <div class="seg" id="hr"><button data-r="7">7 d</button><button data-r="30">30 d</button><button data-r="90">90 d</button><button data-r="365">1 yr</button></div>
    <div class="macros" style="grid-template-columns:repeat(2,1fr)">
      ${tile('Avg sleep', hm(avgOf(h => h.hrs)), `score ${avgOf(h => h.score) != null ? r0(avgOf(h => h.score)) : '–'}`)}
      ${tile('Avg HRV', avgOf(h => h.hrv) != null ? r0(avgOf(h => h.hrv)) + ' ms' : '–', `resting HR ${avgOf(h => h.rhr) != null ? r0(avgOf(h => h.rhr)) : '–'} bpm`)}
      ${tile('Avg steps', avgOf(h => h.steps) != null ? fmt(avgOf(h => h.steps)) : '–', `${avgOf(h => h.km) != null ? r1(avgOf(h => h.km)) : '–'} km / day`)}
      ${tile('Workouts', wk.length, `${fmt(wk.reduce((a, x) => a + x.dur, 0))} min total`)}
    </div>`;
  // sleep stages
  const sv = k => bk.map(b => bAvg(b, h => h[k]));
  const stages = [['Deep', 'var(--sd)', sv('deep')], ['REM', 'var(--sr)', sv('rem')], ['Light', 'var(--sl)', sv('light')], ['Awake', 'var(--sa)', sv('awake')]];
  const leg = items => `<div class="row small muted" style="gap:12px;margin:6px 0 4px;flex-wrap:wrap">${items.map(([l, c, kind]) => `<span class="row" style="gap:5px"><i style="display:inline-block;${kind === 'line' ? `width:12px;height:3px;border-radius:2px;background:${c}` : kind === 'dash' ? `width:12px;border-top:2px dashed ${c}` : kind === 'band' ? `width:12px;height:10px;border-radius:2px;background:${c};opacity:.25` : `width:10px;height:10px;border-radius:2px;background:${c}`}"></i>${l}</span>`).join('')}</div>`;
  const per = r > 31 ? (r > 120 ? ' · monthly averages' : ' · weekly averages') : '';
  html += `<div class="card" style="margin-top:12px"><b>Sleep</b><span class="small muted">${per}</span>${leg(stages.map(([l, c]) => [l, c]))}
    ${hBars({ id: 'hsleep', buckets: bk, series: stages.map(([name, color, vals]) => ({ name, color, vals })), target: 8 })}</div>`;
  html += `<div class="card"><b>Sleep score</b>${hLine({ id: 'hscore', buckets: bk, vals: sv('score'), color: 'var(--accent)' })}</div>`;
  html += `<div class="card"><b>HRV</b> <span class="small muted">· overnight, ms${per}</span>${leg([['HRV', 'var(--p)', 'line'], ['Your baseline range', 'var(--p)', 'band']])}
    ${hLine({ id: 'hhrv', buckets: bk, vals: sv('hrv'), color: 'var(--p)', band: { lo: sv('hrvLo'), hi: sv('hrvHi') } })}</div>`;
  html += `<div class="card"><b>Resting heart rate</b> <span class="small muted">· bpm, lower is generally better</span>${hLine({ id: 'hrhr', buckets: bk, vals: sv('rhr'), color: 'var(--f)' })}</div>`;
  html += `<div class="card"><b>Body Battery</b> <span class="small muted">· daily low → high</span>${hBars({ id: 'hbb', buckets: bk, floating: { lo: sv('bbLo'), hi: sv('bbHi'), color: 'var(--accent)' } })}</div>`;
  html += `<div class="card"><b>Steps</b><span class="small muted">${per}</span>${hBars({ id: 'hsteps', buckets: bk, series: [{ name: 'Steps', color: 'var(--accent)', vals: sv('steps') }] })}</div>`;
  html += `<div class="card"><b>Stress</b> <span class="small muted">· daily average (0–100)</span>${hLine({ id: 'hstress', buckets: bk, vals: sv('stress'), color: 'var(--c)' })}</div>`;
  // intensity minutes per week
  const nW = Math.min(52, Math.max(4, Math.ceil(r / 7)));
  const weeks = Array.from({ length: nW }, (_, i) => { const mon = addDays(mondayOf(todayStr()), -7 * (nW - 1 - i)); const ds = Array.from({ length: 7 }, (_, k) => addDays(mon, k));
    const [y, m, d] = mon.split('-').map(Number); const lab = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return { label: lab, tip: `Week of ${lab} (Mon–Sun)${i === nW - 1 ? ', so far' : ''}`, days: ds }; });
  const imM = weeks.map(b => bSum(b, h => h.imMod)), imV = weeks.map(b => bSum(b, h => (h.imVig || 0) * 2));
  html += `<div class="card"><b>Intensity minutes</b> <span class="small muted">· per week, vigorous counts double</span>${leg([['Moderate', 'var(--sa)'], ['Vigorous ×2', 'var(--sd)'], ['150 min goal', 'var(--muted)', 'dash']])}
    ${hBars({ id: 'him', buckets: weeks, series: [{ name: 'Vigorous', color: 'var(--sd)', vals: imV }, { name: 'Moderate', color: 'var(--sa)', vals: imM }], target: 150 })}</div>`;
  const loads = weeks.map(b => { const v = acts.filter(a => b.days.includes(a.date)).reduce((s2, a) => s2 + a.load, 0); return v || null; });
  html += `<div class="card"><b>Training load</b> <span class="small muted">· per week, from workouts</span>${hBars({ id: 'hload', buckets: weeks, series: [{ name: 'Load', color: 'var(--f)', vals: loads }] })}</div>`;
  const icon = t => ({ running: '🏃', walking: '🚶', cycling: '🚴', strength_training: '🏋', swimming: '🏊', hiking: '🥾' }[t] || '•');
  if (wk.length) html += `<h2>Workouts · ${wk.length}</h2><div class="list">${wk.slice(0, 20).map((a, i) => `<div class="item" data-act="${i}" style="cursor:pointer"><div style="width:24px;text-align:center">${icon(a.type)}</div><div class="grow">
      <div class="name">${esc(a.name || a.type)}</div><div class="small muted">${esc(shortDay(a.date, true))} ${esc(a.start)} · ${r0(a.dur)} min${a.km ? ` · ${r1(a.km)} km` : ''}${a.hr ? ` · ${r0(a.hr)} bpm` : ''}${a.ate ? ` · TE ${r1(a.ate)}` : ''}</div></div><div class="kcal">${r0(a.kcal)}</div></div>`).join('')}</div>
      ${wk.length > 20 ? `<div class="small muted" style="margin:6px 4px">Showing the latest 20.</div>` : ''}`;
  html += `<div class="small muted" style="margin:14px 4px">From your Garmin, synced to garmin-health each morning, or any time with the button at the top. Last night = the sleep that ended on ${esc(shortDay(last, true))}.</div>`;
  $('#view').innerHTML = html;
  $('#view').querySelectorAll('[data-act]').forEach(el => el.onclick = () => actDetail(wk[+el.dataset.act], icon));
  wkPrefetch(wk);
  $('#gsync').onclick = async () => { const b = $('#gsync'); b.disabled = true; b.textContent = '↻ Asking Garmin…';
    const ok = await syncGarminNow(t => { const x = $('#gsync'); if (x) x.textContent = '↻ ' + t; });
    if (ok) toast('Garmin data updated ✓'); if (state.tab === 'health') viewHealth(); };
  $('#hr').querySelectorAll('button').forEach(b => { b.classList.toggle('on', +b.dataset.r === r); b.onclick = () => { state.hrange = +b.dataset.r; viewHealth(); }; });
  const wire = (id, bks, fn) => { const svg = $('#' + id); if (!svg) return; svg.querySelectorAll('.hit').forEach(hh => hh.onclick = () => {
    svg.querySelectorAll('.hit').forEach(x => x.setAttribute('fill', 'transparent')); hh.setAttribute('fill', 'rgba(127,127,127,.12)');
    const i = +hh.dataset.i; $('#' + id + '-cap').innerHTML = `<b style="color:var(--ink)">${esc(bks[i].tip)}</b> · ${fn(i)}`; }); };
  const S = stages.map(s2 => s2[2]);
  wire('hsleep', bk, i => S[0][i] == null ? 'no data' : `${hm(S.reduce((a, s2) => a + (s2[i] || 0), 0) - (S[3][i] || 0))} asleep · deep ${hm(S[0][i])} · REM ${hm(S[1][i])} · light ${hm(S[2][i])} · awake ${hm(S[3][i])}`);
  const sc = sv('score'), hv = sv('hrv'), lo = sv('hrvLo'), hi = sv('hrvHi'), rh = sv('rhr'), bl = sv('bbLo'), bh = sv('bbHi'), st = sv('steps'), ss = sv('stress');
  wire('hscore', bk, i => sc[i] != null ? `score ${r0(sc[i])}` : 'no data');
  wire('hhrv', bk, i => hv[i] != null ? `${r0(hv[i])} ms${lo[i] != null ? ` · baseline ${r0(lo[i])}–${r0(hi[i])}` : ''}` : 'no data');
  wire('hrhr', bk, i => rh[i] != null ? `${r0(rh[i])} bpm` : 'no data');
  wire('hbb', bk, i => bh[i] != null ? `low ${r0(bl[i])} → high ${r0(bh[i])}` : 'no data');
  wire('hsteps', bk, i => st[i] != null ? `${fmt(st[i])} steps${r > 31 ? ' / day' : ''}` : 'no data');
  wire('hstress', bk, i => ss[i] != null ? `avg stress ${r0(ss[i])}` : 'no data');
  wire('him', weeks, i => `${r0((imM[i] || 0) + (imV[i] || 0))} of 150 min (moderate ${r0(imM[i] || 0)}, vigorous ${r0((imV[i] || 0) / 2)}×2)`);
  wire('hload', weeks, i => loads[i] ? `load ${r0(loads[i])}` : 'no workouts');
  pullGarmin(false);
}

