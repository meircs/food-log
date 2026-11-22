// ---------- workout detail ----------
// Tap a workout on the Health tab. Basic numbers come from activities.csv right away;
// the full details (charts, route, km splits, sets) load from data/activities/<id>.json.

const WK_ICON = t => ({ running: '🏃', treadmill_running: '🏃', trail_running: '🏃', walking: '🚶', cycling: '🚴', indoor_cycling: '🚴',
  strength_training: '🏋', swimming: '🏊', lap_swimming: '🏊', hiking: '🥾', yoga: '🧘' }[t] || '•');
const ZC = ['#9aa5b1', '#4c9be8', '#3fb37f', '#f0a030', '#e5484d'];
const ZN = ['Warm-up', 'Easy', 'Aerobic', 'Threshold', 'Max'];
const TE_LABEL = {
  RECOVERY: ['Recovery', 'Very easy. Helps you recover.'],
  BASE: ['Base', 'Easy aerobic work. Builds endurance and burns fat.'],
  TEMPO: ['Tempo', 'Steady, comfortably hard. Improves aerobic fitness.'],
  THRESHOLD: ['Threshold', 'Hard but sustainable. Raises the pace you can hold.'],
  VO2MAX: ['VO₂ max', 'Very hard efforts. Raises your top aerobic capacity.'],
  ANAEROBIC_CAPACITY: ['Anaerobic', 'Short, intense bursts. Builds power and strength-endurance.'],
  SPEED: ['Speed', 'Sprints. Improves speed and power.'],
};

function wkIsRun(t) { return /running|walking|hiking/.test(t || ''); }
function wkDur(s) { if (s == null) return '–'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; }
function wkPace(mps) { if (!mps || mps < 0.3) return '–'; const s = 1000 / mps; return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`; }
function wkWords(k) { if (!k) return ''; return cap(String(k).replace(/_\d+$/, '').toLowerCase().replace(/_/g, ' ')); }
function wkMsg(m) { if (!m) return ''; return wkWords(m).replace(/^Highly impacting/, 'Highly improving').replace(/^Impacting/, 'Improving'); }
function wkTE(v) { if (v == null) return ''; return v < 1 ? 'No effect' : v < 2 ? 'Minor' : v < 3 ? 'Maintaining' : v < 4 ? 'Improving' : v < 5 ? 'Highly improving' : 'Overreaching'; }

async function wkLoad(id) {
  const cache = store.get('actd', {});
  if (settings.ghToken && navigator.onLine) {
    try {
      const dir = settings.ghPath.replace(/[^/]*$/, '');
      const g = await gh('GET', null, `${dir}activities/${id}.json`);
      if (g.ok) {
        const d = JSON.parse(b64ToText((await g.json()).content || ''));
        cache[id] = { d, at: Date.now() };
        const keep = Object.entries(cache).sort((a, b) => b[1].at - a[1].at).slice(0, 30);
        store.set('actd', Object.fromEntries(keep));
        return d;
      }
    } catch (e) { /* offline or not synced yet: fall back to cache */ }
  }
  return cache[id] ? cache[id].d : null;
}

function actDetail(a) {
  if (!a) return;
  // Open with everything we already have, so the sheet slides up once at full height
  // and nothing re-draws mid-animation. Fresh data is fetched after the slide finishes.
  const cached = a.id ? (store.get('actd', {})[a.id] || {}).d : null;
  openSheet(`<div id="wkbody" style="min-height:78vh">${cached ? wkHtml(cached, false) : wkHtml(wkFromCsv(a), true)}</div>`, sh => {
    wkWire(sh);
    if (!a.id) return;
    setTimeout(async () => {
      const d = await wkLoad(a.id);
      const body = sh.querySelector('#wkbody'); if (!body || !document.body.contains(body)) return;
      if (cached && d && JSON.stringify(d) === JSON.stringify(cached)) return;  // nothing new: leave it alone
      const top = sh.scrollTop;
      body.innerHTML = d ? wkHtml(d, false) : wkHtml(wkFromCsv(a), false, true);
      sh.scrollTop = top; wkWire(sh);
    }, 380);
  });
}

function wkTiles(d, run, km) {
  const t = [];
  const add = (v, k) => { if (v != null && v !== '–') t.push(`<div class="wkt"><div class="wkv">${v}</div><div class="wkk">${k}</div></div>`); };
  add(km ? `${r1(km)}<small> km</small>` : null, 'Distance');
  add(d.duration_s ? wkDur(d.duration_s) : null, 'Time');
  if (run && d.avg_speed) add(`${wkPace(d.avg_speed)}<small> /km</small>`, 'Avg pace');
  if (d.type && d.type.includes('cycling') && d.avg_speed) add(`${r1(d.avg_speed * 3.6)}<small> km/h</small>`, 'Avg speed');
  if (d.total_sets) add(`${d.total_sets}`, 'Sets');
  if (d.total_reps) add(`${d.total_reps}`, 'Reps');
  add(d.avg_hr ? `${r0(d.avg_hr)}<small> bpm</small>` : null, 'Avg HR');
  add(d.kcal != null ? `${r0(d.kcal)}<small> kcal</small>` : null, 'Calories');
  add(d.load != null ? `${r0(d.load)}` : null, 'Training load');
  add(d.max_hr ? `${r0(d.max_hr)}<small> bpm</small>` : null, 'Max HR');
  add(d.elev_gain && km ? `${r0(d.elev_gain)}<small> m</small>` : null, 'Climb');
  const n = t.length > 3 ? t.length - t.length % 3 : t.length;  // only full rows
  return t.slice(0, Math.min(n, 6)).join('');
}

function wkFromCsv(a) {
  return { name: a.name, type: a.type, start: `${a.date} ${a.start}`, duration_s: a.dur != null ? a.dur * 60 : null, distance_m: a.km ? a.km * 1000 : null,
    kcal: a.kcal, avg_hr: a.hr, max_hr: a.max, aerobic_te: a.ate, anaerobic_te: a.ane, load: a.load,
    hr_zones_s: (a.z || []).some(v => v) ? a.z.map(v => (v || 0) * 60) : null,
    avg_speed: a.km && a.dur ? a.km * 1000 / (a.dur * 60) : null };
}

function wkHtml(d, loading, missing) {
  const run = wkIsRun(d.type), km = d.distance_m ? d.distance_m / 1000 : null;
  const day = (d.start || '').slice(0, 10), time = (d.start || '').slice(11, 16);
  const te = TE_LABEL[d.te_label];
  let h = `<h3>${WK_ICON(d.type)} ${esc(d.name || wkWords(d.type))}</h3>
    <div class="small muted">${day ? esc(shortDay(day, true)) : ''} · ${esc(time)}${te ? ` · <span class="wkchip">${te[0]}</span>` : ''}</div>
    <div class="wkgrid">${wkTiles(d, run, km)}</div>`;
  if (loading) return h + `<div class="small muted" style="margin:14px 2px">Loading charts, route and splits…</div>`;
  if (missing) h += `<div class="small muted" style="margin:12px 2px">Full details for this workout aren't synced yet. Tap ↻ Sync from Garmin now, then open it again.</div>`;

  // Route
  if (d.route && d.route.length > 2) h += `<div class="card"><b>Route</b>${wkRoute(d.route)}</div>`;

  // Planned workout
  if (d.workout) {
    const hrStep = (d.workout.steps || []).find(s => s.target === 'HEART_RATE' && s.low && s.high);
    let inT = '';
    if (hrStep && d.chart && d.chart.hr) {
      const t = d.chart.t, v = d.chart.hr; let tin = 0, tot = 0;
      for (let i = 1; i < t.length; i++) { const dt = t[i] - t[i - 1]; if (v[i] == null) continue; tot += dt; if (v[i] >= hrStep.low && v[i] <= hrStep.high) tin += dt; }
      if (tot) inT = `<div class="wkbar"><i style="width:${tin / tot * 100}%;background:var(--accent)"></i></div><div class="small">${r0(tin / tot * 100)}% of the time in your target ${hrStep.low}–${hrStep.high} bpm</div>`;
    }
    h += `<div class="card"><b>Planned workout · ${esc(d.workout.name || '')}</b>
      ${(d.workout.steps || []).map(s => `<div class="small muted" style="margin-top:4px">${esc({ INTERVAL: 'Main set', WARMUP: 'Warm-up', COOLDOWN: 'Cool-down', RECOVERY: 'Recovery', REST: 'Rest', ACTIVE: 'Active' }[s.intensity] || wkWords(s.intensity))}${s.type === 'TIME' && s.value ? ` · ${r0(s.value / 60)} min` : s.type === 'DISTANCE' && s.value ? ` · ${r1(s.value / 1000)} km` : ''}${s.exercise ? ` · ${esc(wkWords(s.exercise))}` : ''}${s.target === 'HEART_RATE' && s.low ? ` · HR ${s.low}–${s.high}` : ''}</div>`).join('')}
      ${inT ? `<div style="margin-top:8px">${inT}</div>` : ''}</div>`;
  }

  // Charts
  const c = d.chart || {};
  if (c.t && c.t.length > 3) {
    const pace = c.spd ? wkSmooth(c.spd.map(v => v && v > 0.5 ? 1000 / v : null), 5) : null;
    const charts = [
      c.hr && ['hr', 'Heart rate', c.hr, '#e5484d', v => `${r0(v)} bpm`, false, d.avg_hr && `avg ${r0(d.avg_hr)} · max ${r0(d.max_hr)} bpm`],
      run && pace && ['pace', 'Pace', pace, 'var(--p)', v => `${wkPace(1000 / v)} /km`, true, d.avg_speed && `avg ${wkPace(d.avg_speed)}${d.fastest_1k_s ? ` · best km ${wkDur(d.fastest_1k_s)}` : ''}`],
      !run && c.spd && d.distance_m > 0 && ['spd', 'Speed', c.spd.map(v => v != null ? v * 3.6 : null), 'var(--p)', v => `${r1(v)} km/h`, false, d.avg_speed && `avg ${r1(d.avg_speed * 3.6)} km/h`],
      c.ele && d.distance_m > 0 && ['ele', 'Elevation', c.ele, 'var(--muted)', v => `${r0(v)} m`, false, d.elev_gain != null && `climb ${r0(d.elev_gain)} m`],
      run && c.cad && ['cad', 'Cadence', c.cad.map(v => v > 20 ? v : null), 'var(--c)', v => `${r0(v)} spm`, false, d.cadence && `avg ${r0(d.cadence)} spm`],
      c.pwr && c.pwr.some(v => v) && ['pwr', 'Power', wkSmooth(c.pwr, 3), 'var(--f)', v => `${r0(v)} W`, false, d.avg_power && `avg ${r0(d.avg_power)} · max ${r0(d.max_power)} W`],
      c.bb && c.bb.some(v => v != null) && ['bb', 'Body Battery', c.bb, 'var(--accent)', v => `${r0(v)}`, false, (() => { const b = c.bb.filter(v => v != null); return `${r0(b[0])} → ${r0(b[b.length - 1])}`; })()],
    ].filter(Boolean);
    h += `<div class="card"><b>Charts</b> <span class="small muted">· touch to see values</span>${charts.map(x => wkChart(x[0], x[1], c.t, x[2], x[3], x[4], x[5], x[6])).join('')}</div>`;
  }

  // Km splits
  if (d.km_splits && d.km_splits.length) {
    const sp = d.km_splits.map(s => ({ ...s, pk: s.partial ? s.time_s / (s.dist_m / 1000) : s.time_s }));
    const best = Math.min(...sp.map(s => s.pk)), worst = Math.max(...sp.map(s => s.pk));
    h += `<div class="card"><b>Splits</b> <span class="small muted">· per km</span>
      <div class="wksplit small muted"><span>km</span><span>Pace</span><span></span><span>HR</span></div>
      ${sp.map(s => `<div class="wksplit"><span>${s.partial ? r1(s.km) : s.km}</span><span><b>${wkPace(1000 / s.pk)}</b></span>
        <span><i style="width:${worst > best ? 35 + 65 * (worst - s.pk) / (worst - best) : 100}%;${s.pk === best ? 'background:var(--accent)' : ''}"></i></span><span>${s.avg_hr || '–'}</span></div>`).join('')}
      ${d.fastest_1k_s ? `<div class="small muted" style="margin-top:6px">Fastest 1 km: ${wkDur(d.fastest_1k_s)}</div>` : ''}</div>`;
  }

  // Run / walk
  if (d.run_walk && d.run_walk.length) {
    const tot = d.run_walk.reduce((s, x) => s + (x.duration_s || 0), 0) || 1;
    const col = { run: 'var(--p)', walk: 'var(--c)', stand: 'var(--muted)' };
    h += `<div class="card"><b>Run / walk</b><div class="wkbar">${d.run_walk.map(x => `<i style="width:${x.duration_s / tot * 100}%;background:${col[x.kind] || 'var(--line)'}"></i>`).join('')}</div>
      ${d.run_walk.map(x => `<div class="wkrow small"><span><span class="wkdot" style="background:${col[x.kind] || 'var(--line)'}"></span>${cap(x.kind)} · ${x.count}×</span><span>${wkDur(x.duration_s)} · ${r1((x.distance_m || 0) / 1000)} km</span></div>`).join('')}</div>`;
  }

  // Strength sets
  if (d.sets && d.sets.length) {
    h += `<div class="card"><b>Exercises</b>${d.sets.map(x => `<div class="wkrow"><span>${esc(wkWords(x.sub || x.exercise))}</span>
      <span class="small"><b>${x.sets}×</b> ${x.reps ? `${x.reps} reps` : wkDur(x.duration_s)}${x.max_kg ? ` · ${r1(x.max_kg)} kg` : ''}</span></div>`).join('')}
      <div class="small muted" style="margin-top:6px">Exercise names are what the watch detected. Fix wrong ones in Garmin Connect and they update here at the next sync.</div></div>`;
  }

  // HR zones
  const z = d.hr_zones_s || [], zt = z.reduce((s, v) => s + (v || 0), 0);
  if (zt) h += `<div class="card"><b>Heart-rate zones</b><div class="wkbar">${z.map((v, i) => v ? `<i style="width:${v / zt * 100}%;background:${ZC[i]}"></i>` : '').join('')}</div>
    ${z.map((v, i) => `<div class="wkrow small"${v ? '' : ' style="opacity:.45"'}><span><span class="wkdot" style="background:${ZC[i]}"></span>Zone ${i + 1} · ${ZN[i]}</span><span>${wkDur(v)} · ${r0(v / zt * 100)}%</span></div>`).join('')}</div>`;
  const pz = d.power_zones_s || [], pt = pz.reduce((s, v) => s + (v || 0), 0);
  if (pt) h += `<div class="card"><b>Power zones</b><div class="wkbar">${pz.map((v, i) => v ? `<i style="width:${v / pt * 100}%;background:${ZC[i]}"></i>` : '').join('')}</div>
    <div class="small muted">${pz.map((v, i) => `Z${i + 1} ${r0(v / pt * 100)}%`).join(' · ')}</div></div>`;

  // Training effect
  if (d.aerobic_te != null || d.anaerobic_te != null) {
    const bar = v => `<div class="wkbar"><i style="width:${Math.min(100, (v || 0) / 5 * 100)}%;background:var(--accent)"></i></div>`;
    h += `<div class="card"><b>Training effect</b>${te ? `<div class="small" style="margin-top:4px"><b>${te[0]}:</b> ${te[1]}</div>` : ''}
      <div class="wkrow" style="margin-top:8px"><span>Aerobic</span><span><b>${r1(d.aerobic_te)}</b> <span class="small muted">${wkTE(d.aerobic_te)}</span></span></div>${bar(d.aerobic_te)}
      ${d.aerobic_msg ? `<div class="small muted">${esc(wkMsg(d.aerobic_msg))}</div>` : ''}
      <div class="wkrow" style="margin-top:8px"><span>Anaerobic</span><span><b>${r1(d.anaerobic_te)}</b> <span class="small muted">${wkTE(d.anaerobic_te)}</span></span></div>${bar(d.anaerobic_te)}
      ${d.anaerobic_msg ? `<div class="small muted">${esc(wkMsg(d.anaerobic_msg))}</div>` : ''}</div>`;
  }

  // Running form
  if (run && (d.cadence || d.stride_cm || d.gct_ms)) {
    const row = (k, v, note) => v == null ? '' : `<div class="wkrow"><span>${k}${note ? ` <span class="small muted">${note}</span>` : ''}</span><b>${v}</b></div>`;
    h += `<div class="card"><b>Running form</b>
      ${row('Cadence', d.cadence ? `${r0(d.cadence)} spm` : null, 'steps per minute')}
      ${row('Stride length', d.stride_cm ? `${r0(d.stride_cm)} cm` : null)}
      ${row('Ground contact', d.gct_ms ? `${r0(d.gct_ms)} ms` : null)}
      ${row('Vertical bounce', d.vert_osc_cm ? `${r1(d.vert_osc_cm)} cm` : null)}
      ${row('Vertical ratio', d.vert_ratio ? `${r1(d.vert_ratio)}%` : null, 'lower is more efficient')}
      ${row('Avg / max power', d.avg_power ? `${d.avg_power} / ${d.max_power || '–'} W` : null)}</div>`;
  }

  // Everything else
  const more = [
    d.moving_s && d.distance_m > 0 && d.duration_s - d.moving_s > 30 && ['Moving time', wkDur(d.moving_s)],
    d.min_hr && ['Heart rate range', `${r0(d.min_hr)}–${r0(d.max_hr)} bpm`],
    d.elev_gain != null && d.distance_m > 0 && ['Elevation gain / loss', `${d.elev_gain} / ${d.elev_loss ?? '–'} m`],
    d.steps && ['Steps', fmt(d.steps)],
    d.body_battery != null && ['Body Battery', `${d.body_battery > 0 ? '+' : ''}${d.body_battery}`],
    d.water_ml && ['Sweat loss (est.)', `${d.water_ml} ml`],
    (d.im_moderate || d.im_vigorous) && ['Intensity minutes', `${d.im_moderate || 0} moderate · ${d.im_vigorous || 0} vigorous`],
    d.temp_max != null && ['Watch temperature', `${d.temp_min}–${d.temp_max} °C`],
    d.stamina_start != null && ['Stamina', `${d.stamina_start}% → ${d.stamina_end ?? '–'}%`],
    d.rpe && ['Your effort rating', `${r0(d.rpe / 10)}/10`],
  ].filter(Boolean);
  if (more.length) h += `<div class="card"><b>More</b>${more.map(([k, v]) => `<div class="wkrow"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  return h;
}

function wkSmooth(v, n) {
  return v.map((x, i) => { if (x == null) return null; let s = 0, c = 0; for (let j = Math.max(0, i - n); j <= Math.min(v.length - 1, i + n); j++) if (v[j] != null) { s += v[j]; c++; } return c ? s / c : null; });
}

function wkChart(id, title, t, v, color, f, invert, label) {
  const W = 320, H = 90, P = 4;
  const vals = v.filter(x => x != null); if (vals.length < 3) return '';
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (invert) { const s = [...vals].sort((a, b) => a - b); lo = s[Math.floor(s.length * 0.02)]; hi = s[Math.floor(s.length * 0.98)]; }
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const T = t[t.length - 1] || 1;
  const X = i => P + (t[i] / T) * (W - 2 * P);
  const Y = x => { const c = Math.max(lo, Math.min(hi, x)); const k = (c - lo) / (hi - lo); return P + (invert ? k : 1 - k) * (H - 2 * P); };
  let path = '', pen = false;
  v.forEach((x, i) => { if (x == null) { pen = false; return; } path += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x).toFixed(1)}`; pen = true; });
  const avg = vals.reduce((s, x) => s + x, 0) / vals.length;
  const best = invert ? lo : hi;
  window._wk = window._wk || {}; window._wk[id] = { t, v, f, X, T, W };
  return `<div class="wkc"><div class="wkrow small"><span><b>${title}</b></span><span class="muted" id="wkl-${id}">${label || `avg ${f(avg)} · ${invert ? 'best' : 'max'} ${f(best)}`}</span></div>
    <svg id="wkc-${id}" data-wk="${id}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;touch-action:pan-y;display:block">
      <line x1="0" x2="${W}" y1="${Y(avg).toFixed(1)}" y2="${Y(avg).toFixed(1)}" stroke="var(--line)" stroke-dasharray="3 3"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <line class="wkcur" x1="-10" x2="-10" y1="0" y2="${H}" stroke="var(--ink)" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".5"/>
    </svg><div class="small muted wkax"><span>0:00</span><span>${wkDur(T)}</span></div></div>`;
}

const PACE_COLS = ['#1f4fbf', '#2f7fe0', '#4aa8f0', '#79c43c', '#f4c430', '#f28c28', '#e0452c'];
function wkRoute(r) {
  // OpenStreetMap tiles under an SVG route. Web Mercator "world pixels" at zoom z.
  const W = 340, H = 220, pad = 22;
  const wx = (lon, z) => (lon + 180) / 360 * 256 * 2 ** z;
  const wy = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
  const lats = r.map(p => p[0]), lons = r.map(p => p[1]);
  const la0 = Math.min(...lats), la1 = Math.max(...lats), lo0 = Math.min(...lons), lo1 = Math.max(...lons);
  let z = 18;
  while (z > 3 && (wx(lo1, z) - wx(lo0, z) > W - 2 * pad || wy(la0, z) - wy(la1, z) > H - 2 * pad)) z--;
  const sc = Math.min(2, (W - 2 * pad) / Math.max(1, wx(lo1, z) - wx(lo0, z)), (H - 2 * pad) / Math.max(1, wy(la0, z) - wy(la1, z)));
  const VW = W / sc, VH = H / sc, u = 1 / sc;
  const cx = (wx(lo0, z) + wx(lo1, z)) / 2, cy = (wy(la0, z) + wy(la1, z)) / 2, ox = cx - VW / 2, oy = cy - VH / 2;
  // Tiles one zoom level deeper, drawn at half size, stay sharp on the iPhone's screen.
  const tz = Math.min(19, z + 1), ts = 256 / 2 ** (tz - z), pct = (v, of) => `${(v / of * 100).toFixed(3)}%`;
  let tiles = '';
  for (let tx = Math.floor(ox / ts); tx <= Math.floor((ox + VW) / ts); tx++)
    for (let ty = Math.floor(oy / ts); ty <= Math.floor((oy + VH) / ts); ty++)
      tiles += `<img alt="" loading="lazy" crossorigin="anonymous" src="https://tile.openstreetmap.org/${tz}/${tx}/${ty}.png" style="left:${pct(tx * ts - ox, VW)};top:${pct(ty * ts - oy, VH)};width:${pct(ts + 0.5, VW)};height:${pct(ts + 0.5, VH)}">`;
  const P = p => [(wx(p[1], z) - ox).toFixed(1), (wy(p[0], z) - oy).toFixed(1)];
  const hasSpd = r.filter(p => p[2] > 0.3).length > r.length / 2;
  let lines = '';
  const whole = r.map((p, i) => (i ? 'L' : 'M') + P(p).join(',')).join('');
  lines += `<path d="${whole}" fill="none" stroke="#fff" stroke-width="${7 * u}" stroke-linejoin="round" stroke-linecap="round" opacity=".95"/>`;
  if (hasSpd) {
    const sp = r.map(p => p[2] > 0.3 ? p[2] : null), sm = wkSmooth(sp, 2);
    const vals = sm.filter(v => v != null).sort((a, b) => a - b), lo = vals[Math.floor(vals.length * 0.05)], hi = vals[Math.floor(vals.length * 0.95)];
    const col = v => v == null ? PACE_COLS[0] : PACE_COLS[Math.max(0, Math.min(6, Math.round((v - lo) / Math.max(0.01, hi - lo) * 6)))];
    let cur = null, seg = '';
    const flush = () => { if (seg) lines += `<path d="${seg}" stroke="${cur}" stroke-width="${4.5 * u}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`; };
    for (let i = 1; i < r.length; i++) {
      const c = col(sm[i]);
      if (c !== cur) { flush(); cur = c; seg = `M${P(r[i - 1]).join(',')}`; }
      seg += `L${P(r[i]).join(',')}`;
    }
    flush();
  } else lines += `<path d="${whole}" fill="none" stroke="#2b6cf0" stroke-width="${4.5 * u}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const [sx, sy] = P(r[0]), [ex, ey] = P(r[r.length - 1]);
  const km = wkPathKm(r);
  return `<div class="wkmap"><div class="wktiles">${tiles}</div>
    <svg viewBox="0 0 ${VW.toFixed(2)} ${VH.toFixed(2)}" preserveAspectRatio="none">${lines}
    <circle cx="${ex}" cy="${ey}" r="${6.5 * u}" fill="#e5484d" stroke="#fff" stroke-width="${2.5 * u}"/><circle cx="${sx}" cy="${sy}" r="${6.5 * u}" fill="#20a464" stroke="#fff" stroke-width="${2.5 * u}"/>
  </svg><div class="wkattr">© OpenStreetMap contributors</div></div>
  <div class="small muted wkrow" style="margin-top:8px"><span><span class="wkdot" style="background:#20a464;border-radius:50%"></span>Start <span class="wkdot" style="background:#e5484d;border-radius:50%;margin-left:10px"></span>Finish</span>
  ${hasSpd ? `<span>Slower <span class="wkgrad"></span> Faster</span>` : `<span>${r1(km)} km route</span>`}</div>`;
}

function wkPathKm(r) {
  let m = 0;
  for (let i = 1; i < r.length; i++) {
    const [a, b] = [r[i - 1], r[i]], k = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
    m += Math.hypot((b[0] - a[0]) * 111320, (b[1] - a[1]) * 111320 * k);
  }
  return m / 1000;
}

function wkWire(root) {
  root.querySelectorAll('svg[data-wk]').forEach(svg => {
    const id = svg.dataset.wk, c = (window._wk || {})[id]; if (!c) return;
    const lab = root.querySelector('#wkl-' + id), base = lab.textContent, cur = svg.querySelector('.wkcur');
    const move = e => {
      const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * c.W;
      let best = 0, bd = 1e9; c.t.forEach((_, i) => { const dd = Math.abs(c.X(i) - x); if (dd < bd && c.v[i] != null) { bd = dd; best = i; } });
      cur.setAttribute('x1', c.X(best)); cur.setAttribute('x2', c.X(best));
      lab.textContent = `${wkDur(c.t[best])} · ${c.f(c.v[best])}`;
    };
    svg.onpointerdown = e => { move(e); svg.onpointermove = move; };
    svg.onpointerup = svg.onpointerleave = svg.onpointercancel = () => { svg.onpointermove = null; cur.setAttribute('x1', -10); cur.setAttribute('x2', -10); lab.textContent = base; };
  });
}

// Quietly fetch the newest workouts' details while the Health tab is open, so they open instantly.
let wkPrefetched = 0;
function wkPrefetch(list) {
  if (!settings.ghToken || !navigator.onLine || Date.now() - wkPrefetched < 5 * 60000) return;
  wkPrefetched = Date.now();
  const cache = store.get('actd', {});
  const todo = list.slice(0, 6).filter(a => a.id && !cache[a.id]);
  todo.forEach((a, i) => setTimeout(() => wkLoad(a.id), 800 + i * 400));
}
