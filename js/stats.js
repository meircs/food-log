'use strict';
/* Stats tab: calories, protein, macros, weight, supplements. Also pulls Garmin data. */
// ---------- Stats ----------
let garmin = store.get('garmin', {});   // date -> {total, active}
let weights = store.get('weights', []); // [{date, kg}]
let health = store.get('health', {});   // date -> Garmin daily metrics
let acts = store.get('acts', []);       // workouts, newest first
let bpRemote = store.get('bpRemote', []);   // bp.csv rows [{date,time,period,s,d,p,app}]
let sets = store.get('sets', []);           // strength_sets.csv [{aid,date,ex,sub,sets,reps,kg,dur}]
async function pullGarmin(force) {
  if (!settings.ghToken || !navigator.onLine) return;
  if (!force && Date.now() - store.get('garminPulled', 0) < 10 * 60000) return;
  const dir = settings.ghPath.replace(/[^/]*$/, '');
  const ref = await ghHead();
  const read = async f => { const g = await gh('GET', null, dir + f, ref); return g.ok ? parseCSV(b64ToText((await g.json()).content || '')) : null; };
  const [d, w, a, bp, ss] = await Promise.all([read('daily.csv'), read('weight.csv'), read('activities.csv'), read('bp.csv'), read('strength_sets.csv')]);
  if (d) { const h = d.shift(); const iD = h.indexOf('date'), iT = h.indexOf('total_kcal'), iA = h.indexOf('active_kcal');
    garmin = {}; d.forEach(r => { if (r[iD] && r[iT]) garmin[r[iD]] = { total: num(r[iT]), active: num(r[iA]) }; }); store.set('garmin', garmin);
    const F = { score: 'sleep_score', hrs: 'sleep_hours', deep: 'deep_h', light: 'light_h', rem: 'rem_h', awake: 'awake_h', hrv: 'hrv_last_night', hrvWk: 'hrv_weekly_avg',
      hrvLo: 'hrv_baseline_low', hrvHi: 'hrv_baseline_high', rhr: 'resting_hr', stress: 'avg_stress', bbHi: 'body_battery_high', bbLo: 'body_battery_low',
      steps: 'steps', km: 'distance_km', active: 'active_kcal', total: 'total_kcal', imMod: 'intensity_min_moderate', imVig: 'intensity_min_vigorous' };
    const idx = Object.fromEntries(Object.entries(F).map(([k, c]) => [k, h.indexOf(c)]));
    const iS = h.indexOf('sleep_start'), iE = h.indexOf('sleep_end'), iH = h.indexOf('hrv_status');
    health = {};
    d.forEach(r => { if (!r[iD]) return; const o = {}; for (const [k, i] of Object.entries(idx)) { const v = r[i]; o[k] = v === '' || v == null ? null : num(v); }
      o.bed = (r[iS] || '').slice(11, 16); o.wake = (r[iE] || '').slice(11, 16); o.hrvStatus = r[iH] || ''; health[r[iD]] = o; });
    store.set('health', health); }
  if (a) { const h = a.shift(); const ix = k => h.indexOf(k);
    acts = a.filter(r => r[ix('date')]).map(r => ({ date: r[ix('date')], start: (r[ix('start_local')] || '').slice(11, 16), name: r[ix('name')], type: r[ix('type')],
      dur: num(r[ix('duration_min')]), km: num(r[ix('distance_km')]), hr: num(r[ix('avg_hr')]), kcal: num(r[ix('kcal')]), ate: num(r[ix('aerobic_te')]), load: num(r[ix('training_load')]),
      id: r[ix('activity_id')], max: num(r[ix('max_hr')]), ane: num(r[ix('anaerobic_te')]), z: [1, 2, 3, 4, 5].map(i => ix(`hr_z${i}_min`) >= 0 ? num(r[ix(`hr_z${i}_min`)]) : null),
      f1k: ix('fastest_1k_s') >= 0 ? num(r[ix('fastest_1k_s')]) || null : null, fmi: ix('fastest_mile_s') >= 0 ? num(r[ix('fastest_mile_s')]) || null : null,
      f5k: ix('fastest_5k_s') >= 0 ? num(r[ix('fastest_5k_s')]) || null : null, f10k: ix('fastest_10k_s') >= 0 ? num(r[ix('fastest_10k_s')]) || null : null }))
      .sort((x, y) => (y.date + y.start).localeCompare(x.date + x.start));
    store.set('acts', acts); }
  if (w) { const h = w.shift(); const iD = h.indexOf('date'), iK = h.indexOf('weight_kg'), iF = h.indexOf('body_fat_pct');
    const by = {}; w.forEach(r => { if (r[iD] && num(r[iK]) > 0) by[r[iD]] = { kg: num(r[iK]), bf: iF >= 0 && num(r[iF]) > 0 ? num(r[iF]) : (by[r[iD]] || {}).bf || null }; });
    weights = Object.keys(by).sort().map(k => ({ date: k, kg: by[k].kg, bf: by[k].bf })); store.set('weights', weights); }
  if (bp) { const h = bp.shift(); const ix = k => h.indexOf(k), n = (r, k) => ix(k) >= 0 && num(r[ix(k)]) > 0 ? num(r[ix(k)]) : null;
    bpRemote = bp.filter(r => r[ix('date')]).map(r => ({ date: r[ix('date')], time: r[ix('time')] || '', period: r[ix('period')] || '', s1: n(r, 'systolic_1'), d1: n(r, 'diastolic_1'), p1: n(r, 'pulse_1'),
      s2: n(r, 'systolic_2'), d2: n(r, 'diastolic_2'), p2: n(r, 'pulse_2'), notes: r[ix('notes')] || '' })).filter(x => x.s1 && x.d1);
    store.set('bpRemote', bpRemote); }
  if (ss) { const h = ss.shift(); const ix = k => h.indexOf(k);
    sets = ss.filter(r => r[ix('date')]).map(r => ({ aid: r[ix('activity_id')], date: r[ix('date')], ex: r[ix('exercise')], sub: r[ix('sub_exercise')] || '', sets: num(r[ix('sets')]), reps: num(r[ix('reps')]),
      kg: num(r[ix('max_weight_kg')]) || null, dur: num(r[ix('duration_s')]) || null }));
    store.set('sets', sets); }
  store.set('garminPulled', Date.now());
  if (state.tab === 'stats') viewStats();
  if (state.tab === 'health') viewHealth();
  if (state.tab === 'today' && !$('#bd')) render();
}
// Ask GitHub to run the Garmin sync now, wait for it, then reload the data.
let garminSyncing = false;
async function syncGarminNow(onStatus) {
  if (!settings.ghToken || !navigator.onLine || garminSyncing) return false;
  if (Date.now() - store.get('garminSynced', 0) < 30000) { await pullGarmin(true); return true; }   // only skip a double-tap; a later tap always asks Garmin again
  garminSyncing = true;
  const say = t => { try { onStatus && onStatus(t); } catch (e) { } };
  try {
    const api = `https://api.github.com/repos/${settings.ghRepo}/actions/workflows/daily.yml`;
    const H = { Authorization: `Bearer ${settings.ghToken}`, Accept: 'application/vnd.github+json' };
    const since = new Date(Date.now() - 10000).toISOString();
    say('Asking Garmin for new data…');
    const d = await fetch(api + '/dispatches', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { days_back: '2' } }) });
    if (d.status === 403 || d.status === 404) throw new Error('perm');
    if (!d.ok) throw new Error('GitHub error ' + d.status);
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const r = await fetch(`${api}/runs?event=workflow_dispatch&per_page=1&created=${encodeURIComponent('>=' + since)}`, { headers: H, cache: 'no-store' });
      if (!r.ok) continue;
      const run = ((await r.json()).workflow_runs || [])[0];
      if (!run) { say('Starting Garmin sync…'); continue; }
      if (run.status !== 'completed') { say('Syncing from Garmin…'); continue; }
      if (run.conclusion !== 'success') throw new Error('The Garmin sync failed on GitHub. Check the repo’s Actions tab.');
      ok = true;
    }
    if (!ok) throw new Error('Garmin sync is taking long. Try again in a minute.');
    store.set('garminSynced', Date.now());
    await pullGarmin(true);
    return true;
  } catch (e) {
    toast(e.message === 'perm' ? 'Your GitHub token needs “Actions: Read and write” on garmin-health to sync on demand.' : e.message === 'Failed to fetch' ? 'Could not reach GitHub.' : e.message);
    try { await pullGarmin(true); } catch (e2) { }
    return false;
  } finally { garminSyncing = false; }
}
function mondayOf(d) { const [y, m, dd] = d.split('-').map(Number); const dow = new Date(y, m - 1, dd).getDay(); return addDays(d, -((dow + 6) % 7)); }
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
// Energy model: maintenance from Garmin burn, refined by intake vs weight trend once there's enough data.
function targetModel() {
  const past = Array.from({ length: 28 }, (_, i) => addDays(todayStr(), -(i + 1)));
  const gDays = past.filter(d => garmin[d] && garmin[d].total > 0);
  const gAvg = gDays.length >= 7 ? mean(gDays.map(d => garmin[d].total)) : null;
  const all = [...entries, ...remote];
  const dayIn = d => all.filter(e => e.date === d).reduce((a, e) => a + e.kcal, 0);
  let obs = null, slope = null;
  const w = weights.filter(x => x.date >= addDays(todayStr(), -42));
  if (w.length >= 3) {
    const t = x => (new Date(x.date) - new Date(w[0].date)) / 864e5, span = t(w[w.length - 1]);
    if (span >= 14) {
      const xs = w.map(t), ys = w.map(x => x.kg), mx = mean(xs), my = mean(ys);
      slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0); // kg per day
      const span_days = Array.from({ length: span }, (_, i) => addDays(w[0].date, i)).filter(d => d < todayStr());
      const logged = span_days.filter(d => dayIn(d) > 0);
      if (logged.length >= span_days.length * 0.85) obs = mean(logged.map(dayIn)) - slope * 7700;
    }
  }
  const kg = weights.length ? weights[weights.length - 1].kg : null;
  // Ignore the food+weight estimate if it's far from Garmin (usually means meals went unlogged).
  const off = obs && gAvg && Math.abs(obs - gAvg) / gAvg > 0.25;
  if (off) obs = null;
  const maint = obs && gAvg ? (obs + gAvg) / 2 : obs || gAvg;
  return { gAvg, gDays: gDays.length, obs, slope, kg, maint, off };
}
const GOALS = { recomp: ['Build muscle & lose fat (recomp)', -300, 2.0], 'lose0.5': ['Lose ~0.5 kg / week', -550, 2.0], 'lose0.25': ['Lose ~0.25 kg / week', -275, 1.8], maintain: ['Maintain weight', 0, 1.6], 'gain0.25': ['Gain ~0.25 kg / week', 275, 1.8] };
function suggestTargets(goal) {
  const m = targetModel(), g = GOALS[goal] || GOALS.maintain;
  if (!m.maint) return null;
  return { kcal: Math.max(1500, Math.round((m.maint + g[1]) / 50) * 50), protein: m.kg ? Math.round(m.kg * g[2] / 5) * 5 : null, m };
}
// Patterns between food and the next night / day, over the last 60 days.
function insightsHTML() {
  const all = [...entries, ...remote], days = Array.from({ length: 60 }, (_, i) => addDays(todayStr(), -(i + 1)));
  const logged = days.filter(d => all.some(e => e.date === d));
  const nxt = d => health[addDays(d, 1)] || {};
  const cmp = (label, test, metric, unit, better) => {
    const yes = [], no = [];
    logged.forEach(d => { const v = metric(d); if (v == null) return; (test(d) ? yes : no).push(v); });
    if (yes.length < 3 || no.length < 3) return `<div class="item"><div class="grow"><div class="name">${label}</div><div class="small muted">Not enough data yet (${yes.length} of 3 days needed)</div></div></div>`;
    const a = mean(yes), b = mean(no), diff = a - b, good = better === 'high' ? diff > 0 : diff < 0;
    const big = Math.abs(diff) >= (unit === 'g' ? 10 : 3);
    return `<div class="item"><div class="grow"><div class="name">${label}</div><div class="small muted">${r0(a)}${unit === 'g' ? ' g' : ''} vs ${r0(b)}${unit === 'g' ? ' g' : ''} otherwise · ${yes.length} vs ${no.length} days</div></div>
      <div class="kcal" style="color:${!big ? 'var(--muted)' : good ? 'var(--accent)' : 'var(--warn)'}">${diff > 0 ? '+' : diff < 0 ? '−' : '±'}${r0(Math.abs(diff))}</div></div>`;
  };
  const late = d => all.some(e => e.date === d && e.time >= '21:00' && e.kcal >= 150);
  const alc = d => all.filter(e => e.date === d).reduce((a, e) => a + (e.alc || 0), 0) > 0;
  const caf = d => all.some(e => e.date === d && e.time >= '14:00' && (e.caf || 0) > 0);
  const trained = d => acts.some(a => a.date === d && a.type !== 'walking');
  const prot = d => all.filter(e => e.date === d).reduce((a, e) => a + e.p, 0);
  return `<div class="card" id="insights" style="padding-bottom:4px"><b>Food &amp; health patterns</b> <span class="small muted">· last 60 days</span>
    <div class="list" style="border:0;margin:6px -14px 0">
      ${cmp('Late meals (after 9pm) → sleep score', late, d => nxt(d).score ?? null, '', 'high')}
      ${cmp('Caffeine after 2pm → sleep score', caf, d => nxt(d).score ?? null, '', 'high')}
      ${cmp('Alcohol → next-night HRV', alc, d => nxt(d).hrv ?? null, '', 'high')}
      ${cmp('Protein on workout days vs rest days', trained, d => prot(d) || null, 'g', 'high')}
    </div><div class="small muted" style="margin:6px 0 8px">Patterns in your own data, not proof of cause. They get more reliable as you log more days.</div></div>`;
}
function fmt(n) { return Math.round(n).toLocaleString(); }
function shortDay(s, long) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, long ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'narrow' }); }
function topRounded(x, y, w, h, r) { r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
// Bar chart: one series of bars, optional tick marks (second measure, same unit), optional target line.
function barChart({ id, days, bars, ticks, target, color, unit }) {
  const W = 340, H = 170, L = 38, R = 6, T = 10, B = 22, pw = W - L - R, ph = H - T - B;
  const vals = [...bars, ...(ticks || []), target || 0].filter(v => v != null);
  const max = Math.max(10, ...vals) * 1.08;
  const step = Math.pow(10, Math.floor(Math.log10(max / 3))); const nice = [1, 2, 2.5, 5, 10].map(k => k * step).find(k => max / k <= 4) || step * 10;
  const y = v => T + ph - v / max * ph;
  const slot = pw / days.length, bw = Math.max(3, Math.min(26, slot - 2));
  let g = '';
  for (let v = 0; v <= max; v += nice) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v >= 1000 ? (v / 1000) + 'k' : v}</text>`;
  if (target) g += `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  days.forEach((d, i) => {
    const cx = L + slot * i + slot / 2, v = bars[i];
    if (v) g += `<path d="${topRounded(cx - bw / 2, y(v), bw, y(0) - y(v), 4)}" fill="${color}" ${d === todayStr() ? 'fill-opacity=".55"' : ''}/>`;
    const t = ticks && ticks[i];
    if (t) g += `<line x1="${cx - bw / 2 - 2}" x2="${cx + bw / 2 + 2}" y1="${y(t)}" y2="${y(t)}" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>`;
    const lab = days.length <= 7 ? shortDay(d) : (i % 5 === 0 || i === days.length - 1) ? d.slice(8).replace(/^0/, '') : '';
    if (lab) g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">${lab}</text>`;
    g += `<rect class="hit" data-i="${i}" x="${L + slot * i}" y="${T}" width="${slot}" height="${ph + B}" fill="transparent"/>`;
  });
  return `<svg id="${id}" viewBox="0 0 ${W} ${H}" width="100%" role="img" style="display:block;touch-action:manipulation">${g}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" stroke-width="1"/></svg>
    <div class="small muted" id="${id}-cap" style="min-height:20px;margin-top:4px">Tap a bar for details</div>`;
}
function lineChart({ pts, color, unit }) {
  const W = 340, H = 150, L = 38, R = 10, T = 12, B = 22, pw = W - L - R, ph = H - T - B;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), pad = Math.max(0.5, (hi - lo) * 0.25);
  const mn = lo - pad, mx = hi + pad;
  const t0 = new Date(pts[0].date).getTime(), t1 = Math.max(t0 + 864e5, new Date(pts[pts.length - 1].date).getTime());
  const x = d => L + (new Date(d).getTime() - t0) / (t1 - t0) * pw, y = v => T + ph - (v - mn) / (mx - mn) * ph;
  let g = '';
  [0.12, 0.5, 0.88].map(k => mn + (mx - mn) * k).forEach(v => g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${r1(v)}</text>`);
  g += `<polyline points="${pts.map(p => `${x(p.date)},${y(p.v)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
  pts.forEach((p, i) => g += `<circle cx="${x(p.date)}" cy="${y(p.v)}" r="4" fill="${color}" stroke="var(--card)" stroke-width="2"/><rect class="hit" data-i="${i}" x="${x(p.date) - 14}" y="${T}" width="28" height="${ph}" fill="transparent"/>`);
  [pts[0], pts[pts.length - 1]].forEach((p, k) => g += `<text x="${x(p.date)}" y="${H - 6}" text-anchor="${k ? 'end' : 'start'}" font-size="10" fill="var(--muted)">${shortDay(p.date, true)}</text>`);
  return `<svg id="wchart" viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${g}</svg><div class="small muted" id="wchart-cap" style="min-height:20px;margin-top:4px">Tap a point for details</div>`;
}
function viewStats() {
  const rg = state.range || 'w';
  const start = rg === 30 ? addDays(todayStr(), -29) : addDays(mondayOf(todayStr()), rg === 'lw' ? -7 : 0);
  const n = rg === 30 ? 30 : 7;
  const days = Array.from({ length: n }, (_, i) => addDays(start, i));
  const rangeName = rg === 'w' ? 'this week' : rg === 'lw' ? 'last week' : '30 days';
  const all = [...entries, ...remote];
  const per = days.map(d => totals(all.filter(e => e.date === d)));
  const logged = per.map(t => t.kcal > 0);
  const done = days.map((d, i) => logged[i] && d < todayStr());              // complete days with food logged
  const burned = days.map(d => d < todayStr() && garmin[d] ? garmin[d].total : null); // today's Garmin total is partial
  const avg = (arr, mask) => { const v = arr.filter((x, i) => mask[i] && x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const aIn = avg(per.map(t => t.kcal), done), aOut = avg(burned, done.map((d, i) => d && burned[i] != null));
  const both = done.map((d, i) => d && burned[i] != null);
  const aBal = avg(per.map((t, i) => burned[i] != null ? t.kcal - burned[i] : null), both);
  const aP = avg(per.map(t => t.p), done);
  const sumP = per.reduce((a, t, i) => a + (done[i] ? t.p : 0), 0), sumC = per.reduce((a, t, i) => a + (done[i] ? t.c : 0), 0), sumF = per.reduce((a, t, i) => a + (done[i] ? t.f : 0), 0);
  const kP = sumP * 4, kC = sumC * 4, kF = sumF * 9, kT = kP + kC + kF;
  let streak = 0; { const has = d => all.some(e => e.date === d); let i = has(todayStr()) ? 0 : 1; while (i < 500 && has(addDays(todayStr(), -i))) { streak++; i++; } }
  const tile = (label, val, sub) => `<div class="macro"><span class="small muted">${label}</span><b>${val}</b>${sub ? `<span class="small muted">${sub}</span>` : ''}</div>`;
  const doneN = done.filter(Boolean).length;
  let html = `<div class="seg" id="rng"><button data-r="w">This week</button><button data-r="lw">Last week</button><button data-r="30">30 days</button></div>
    <div class="small muted" style="margin:6px 4px 0">${esc(shortDay(days[0], true))} – ${esc(shortDay(days[n - 1], true))}</div>
    <div class="macros" style="grid-template-columns:repeat(2,1fr)">
      ${tile('Avg eaten', aIn != null ? fmt(aIn) + ' kcal' : '–', `${doneN} full day${doneN === 1 ? '' : 's'} logged`)}
      ${tile('Avg burned (Garmin)', aOut != null ? fmt(aOut) + ' kcal' : '–', settings.ghToken ? '' : 'needs sync token')}
      ${tile('Avg balance', aBal != null ? (aBal > 0 ? '+' : '−') + fmt(Math.abs(aBal)) + ' kcal' : '–', aBal == null ? '' : aBal < 0 ? 'deficit / day' : 'surplus / day')}
      ${tile('Avg protein', aP != null ? r0(aP) + ' g' : '–', `target ${settings.protein} g · streak ${streak} day${streak === 1 ? '' : 's'}`)}
    </div>
    <div class="card" style="margin-top:12px"><b>Calories</b>
      <div class="row small muted" style="gap:14px;margin:6px 0 4px;flex-wrap:wrap">
        <span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:2px;background:var(--accent);display:inline-block"></i>Eaten</span>
        <span class="row" style="gap:5px"><i style="width:12px;height:3px;border-radius:2px;background:var(--ink);display:inline-block"></i>Burned (Garmin)</span>
        <span class="row" style="gap:5px"><i style="width:12px;border-top:2px dashed var(--muted);display:inline-block"></i>Target ${fmt(settings.kcal)}</span></div>
      ${barChart({ id: 'kchart', days, bars: per.map(t => t.kcal), ticks: burned, target: settings.kcal, color: 'var(--accent)' })}</div>
    <div class="card"><b>Protein</b> <span class="small muted">· dashed line = ${settings.protein} g target</span>
      ${barChart({ id: 'pchart', days, bars: per.map(t => t.p), target: settings.protein, color: 'var(--p)' })}</div>`;
  html += insightsHTML();
  if (kT > 0) {
    const seg = [['Protein', kP, 'var(--p)', sumP], ['Carbs', kC, 'var(--c)', sumC], ['Fat', kF, 'var(--f)', sumF]];
    html += `<div class="card"><b>Where calories come from</b> <span class="small muted">· ${rangeName}</span>
      <div style="display:flex;gap:2px;height:16px;margin:12px 0 10px">${seg.map(([, k, c]) => `<div style="flex:${k};background:${c};border-radius:4px"></div>`).join('')}</div>
      <div class="macros" style="margin-top:0">${seg.map(([l, k, c, g]) => `<div class="macro"><span class="small muted"><i class="dot" style="background:${c}"></i>${l}</span><b>${r0(k / kT * 100)}%</b><span class="small muted">${r0(g / doneN)} g / day</span></div>`).join('')}</div></div>`;
  }
  if (supps.length) {
    html += `<div class="card"><b>Supplements</b> <span class="small muted">· days taken, ${rangeName}</span>` + supps.map(x => {
      const past = days.filter(d => d <= todayStr()), dn = Math.max(1, past.length);
      const k = past.filter(d => suppLog.some(l => l.date === d && l.suppId === x.id)).length;
      return `<div style="margin-top:10px"><div class="spread small"><span>${esc(x.name)}</span><span class="muted">${k}/${dn} days · ${r0(k / dn * 100)}%</span></div>
        <div class="bar" style="margin:4px 0 0"><i style="width:${k / dn * 100}%;background:var(--p)"></i></div></div>`;
    }).join('') + `</div>`;
  }
  const wr = weights.filter(w => w.date >= addDays(todayStr(), -29));
  if (wr.length >= 2) {
    const ch = wr[wr.length - 1].kg - wr[0].kg;
    html += `<div class="card"><div class="spread"><b>Weight</b><span class="small muted">${ch > 0 ? '+' : ch < 0 ? '−' : '±'}${r1(Math.abs(ch))} kg since ${shortDay(wr[0].date, true)}</span></div>
      ${lineChart({ pts: wr.map(w => ({ date: w.date, v: w.kg })), color: 'var(--accent)' })}</div>`;
  } else if (wr.length === 1) html += `<div class="card"><b>Weight</b><div class="small muted" style="margin-top:4px">${r1(wr[0].kg)} kg on ${shortDay(wr[0].date, true)}. The chart appears after two weigh-ins.</div></div>`;
  const top = {}; all.filter(e => days.includes(e.date)).forEach(e => { const k = e.name; top[k] = top[k] || { k: 0, n: 0 }; top[k].k += e.kcal; top[k].n++; });
  const tl = Object.entries(top).sort((a, b) => b[1].k - a[1].k).slice(0, 5);
  if (tl.length) html += `<h2>Biggest calorie sources · ${rangeName}</h2><div class="list">${tl.map(([name, v]) => `<div class="item"><div class="grow"><div class="name">${esc(name)}</div><div class="small muted">${v.n}× · ${kT ? r0(v.k / Math.max(1, per.reduce((a, t) => a + t.kcal, 0)) * 100) : 0}% of calories</div></div><div class="kcal">${fmt(v.k)}</div></div>`).join('')}</div>`;
  html += `<div class="small muted" style="margin:14px 4px">Averages use full days you logged food (today is left out until it's over). Garmin calories update after the morning sync.</div>`;
  $('#view').innerHTML = html;
  $('#rng').querySelectorAll('button').forEach(b => { const v = b.dataset.r === '30' ? 30 : b.dataset.r; b.classList.toggle('on', v === rg); b.onclick = () => { state.range = v; viewStats(); }; });
  const wire = (id, fn) => { const svg = $('#' + id); if (!svg) return; svg.querySelectorAll('.hit').forEach(h => h.onclick = () => {
    svg.querySelectorAll('.hit').forEach(x => x.setAttribute('fill', 'transparent')); h.setAttribute('fill', 'rgba(127,127,127,.12)'); $('#' + id + '-cap').innerHTML = fn(+h.dataset.i); }); };
  wire('kchart', i => `<b style="color:var(--ink)">${shortDay(days[i], true)}</b> · eaten ${per[i].kcal ? fmt(per[i].kcal) : '–'}${burned[i] != null ? ` · burned ${fmt(burned[i])}${per[i].kcal ? ' · ' + (per[i].kcal - burned[i] > 0 ? '+' : '−') + fmt(Math.abs(per[i].kcal - burned[i])) : ''}` : days[i] === todayStr() ? ' · today, in progress' : days[i] > todayStr() ? ' · upcoming' : ''}`);
  wire('pchart', i => `<b style="color:var(--ink)">${shortDay(days[i], true)}</b> · ${per[i].p ? r0(per[i].p) + ' g protein' : 'nothing logged'}`);
  wire('wchart', i => `<b style="color:var(--ink)">${shortDay(wr[i].date, true)}</b> · ${r1(wr[i].kg)} kg`);
  pullGarmin(false);
}
