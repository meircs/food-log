'use strict';
/* Progress features: today's plan card, calorie/protein rings, body composition, blood pressure,
   strength progress, personal records and sleep factors. Pure functions return HTML; wire* add taps. */

// ---------- small helpers ----------
const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const sgn = (v, n = 1) => { const a = Math.abs(v).toFixed(n); return `${+a === 0 ? '±' : v > 0 ? '+' : '−'}${a}`; };
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const exName = (ex, sub) => cap(String(sub || ex || '').toLowerCase().replace(/_/g, ' '));
const bedMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return (h < 15 ? h + 24 : h) * 60 + m; };   // minutes after the previous noon
const dShort = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, y === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }); };
const minTxt = m => { const h = Math.floor(m / 60) % 24, mm = Math.round(m % 60); const d = new Date(2000, 0, 1, h, mm); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

// A time-scaled line chart: dots for readings, an optional smoothed line, goal band, tap to inspect.
function tChart({ id, pts, line, band, color, fmt: f, h = 150, lines }) {
  const W = 340, H = h, L = 34, R = 8, T = 10, B = 22;
  const all = [...pts.map(p => p.v), ...(line || []).map(p => p.v), ...(band || []), ...(lines || []).flatMap(x => x.pts.map(p => p.v))].filter(v => v != null);
  if (!all.length || !pts.length) return '';
  let lo = Math.min(...all), hi = Math.max(...all); const padv = Math.max(0.5, (hi - lo) * 0.12); lo -= padv; hi += padv;
  const d0 = dayNum(pts[0].date), d1 = Math.max(d0 + 1, dayNum(pts[pts.length - 1].date));
  const X = d => L + (dayNum(d) - d0) / (d1 - d0) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const step = (hi - lo) / 3, ticks = [0, 1, 2, 3].map(i => lo + step * i);
  const nice = v => Math.abs(hi - lo) < 8 ? r1(v) : r0(v);
  let g = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/><text x="${L - 5}" y="${Y(t) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)">${nice(t)}</text>`).join('');
  if (band) g += `<rect x="${L}" width="${W - L - R}" y="${Y(band[1])}" height="${Math.max(1, Y(band[0]) - Y(band[1]))}" fill="var(--accent)" opacity=".13"/><text x="${W - R - 3}" y="${Y(band[1]) - 3}" text-anchor="end" font-size="10" fill="var(--accent)">goal</text>`;
  const path = arr => arr.filter(p => p.v != null).map((p, i) => `${i ? 'L' : 'M'}${X(p.date).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  (lines || []).forEach(x => { g += `<path d="${path(x.pts)}" fill="none" stroke="${x.color}" stroke-width="2" stroke-linejoin="round" ${x.dash ? 'stroke-dasharray="4 3"' : ''}/>`; });
  if (line) g += `<path d="${path(line)}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>`;
  g += pts.map(p => `<circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${line ? 2.6 : 3.4}" fill="${p.c || color}" opacity="${line ? .45 : 1}"/>`).join('');
  const labs = [pts[0].date, pts[Math.floor(pts.length / 2)].date, pts[pts.length - 1].date].filter((x, i, a) => a.indexOf(x) === i);
  g += labs.map((d, i) => `<text x="${X(d)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === labs.length - 1 ? 'end' : 'middle'}" font-size="10" fill="var(--muted)">${shortDay(d, true).replace(/^\w+,?\s*/, '')}</text>`).join('');
  window._tc = window._tc || {}; window._tc[id] = { pts, line, f, X, W };
  return `<svg id="${id}" class="tchart" viewBox="0 0 ${W} ${H}" style="width:100%;display:block;touch-action:pan-y">${g}
    <line class="tcur" x1="-9" x2="-9" y1="${T}" y2="${H - B}" stroke="var(--ink)" opacity=".4"/></svg><div class="small muted tcap" id="${id}-cap">Tap the chart for details</div>`;
}
function wireTCharts(root = document) {
  root.querySelectorAll('svg.tchart').forEach(svg => {
    const c = (window._tc || {})[svg.id]; if (!c) return;
    svg.onclick = e => {
      const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * c.W;
      let bi = 0, bd = 1e9; c.pts.forEach((p, i) => { const d = Math.abs(c.X(p.date) - x); if (d < bd) { bd = d; bi = i; } });
      const p = c.pts[bi], cur = svg.querySelector('.tcur'); cur.setAttribute('x1', c.X(p.date)); cur.setAttribute('x2', c.X(p.date));
      const av = c.line && c.line.find(q => q.date === p.date);
      $('#' + svg.id + '-cap').innerHTML = `<b style="color:var(--ink)">${shortDay(p.date, true)}</b> · ${c.f(p)}${av && av.v != null ? ` · 7-day avg ${c.f({ ...p, v: av.v })}` : ''}`;
    };
  });
}

// ---------- 1. Today's plan (from the morning analysis in the AI tab) ----------
function planCardHTML() {
  if (state.date !== todayStr()) return '';
  const today = (typeof aiHistory !== 'undefined' ? aiHistory : []).filter(h => localDay(h.at) === todayStr());
  const h = today.find(x => x.model === 'morning') || today[0];
  if (!h) {
    return `<div class="card plan small muted spread"><span>☀ No plan for today yet.</span><button class="linkbtn small" id="planai">Get today's plan ›</button></div>`;
  }
  let d = h.data || {}; try { if (typeof normAI === 'function') d = normAI(d) || d; } catch (e) { }
  const head = d.headline || '', lvl = (head.match(/^(Green|Yellow|Red)\b/i) || [])[1];
  const col = { green: 'var(--accent)', yellow: '#d9a21b', red: 'var(--warn)' }[(lvl || '').toLowerCase()] || 'var(--p)';
  const done = store.get('planDone', {})[todayStr()] || [];
  const todayPart = (d.full || '').split(/\n(?=##\s)/).find(s => /^##\s*Today/i.test(s.trim()));
  return `<div class="card plan" style="border-left:4px solid ${col}">
    <div class="spread"><span class="small" style="font-weight:650;color:${col}">${lvl ? cap(lvl.toLowerCase()) + ' day' : "Today's plan"}</span><button class="linkbtn small" id="planai">Full analysis ›</button></div>
    <div style="font-weight:650;margin-top:4px;line-height:1.35">${esc((x => x.charAt(0).toUpperCase() + x.slice(1))(head.replace(/^(Green|Yellow|Red)\s*[:—-]\s*/i, '')))}</div>
    ${(d.next || []).length ? `<div class="plannext">${d.next.map((x, i) => `<button class="planitem ${done.includes(i) ? 'done' : ''}" data-pi="${i}"><span class="pbox">${done.includes(i) ? '✓' : ''}</span><span>${esc(x)}</span></button>`).join('')}</div>` : ''}
    ${todayPart ? `<details style="margin-top:6px"><summary class="linkbtn small" style="cursor:pointer">Today in detail</summary><div style="margin-top:4px;line-height:1.45;font-size:15px">${typeof miniMd === 'function' ? miniMd(todayPart.replace(/^##\s*Today\s*/i, '')) : esc(todayPart)}</div></details>` : ''}</div>`;
}
function wirePlanCard() {
  const a = $('#planai'); if (a) a.onclick = () => { state.tab = 'ai'; render(); window.scrollTo(0, 0); };
  document.querySelectorAll('[data-pi]').forEach(b => b.onclick = () => {
    const all = store.get('planDone', {}), t = todayStr(), i = +b.dataset.pi, cur = new Set(all[t] || []);
    cur.has(i) ? cur.delete(i) : cur.add(i);
    const keep = Object.fromEntries(Object.entries({ ...all, [t]: [...cur] }).filter(([k]) => k >= addDays(t, -14)));
    store.set('planDone', keep); b.classList.toggle('done', cur.has(i)); b.querySelector('.pbox').textContent = cur.has(i) ? '✓' : '';
  });
}

// ---------- 2. Calorie and protein rings ----------
function ringSVG(pct, color, big, small, over) {
  const R = 46, C = 2 * Math.PI * R, p = Math.max(0, Math.min(1, pct));
  return `<svg viewBox="0 0 110 110" class="ring"><circle cx="55" cy="55" r="${R}" fill="none" stroke="var(--line)" stroke-width="10"/>
    <circle cx="55" cy="55" r="${R}" fill="none" stroke="${over ? 'var(--warn)' : color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 55 55)" style="transition:stroke-dasharray .5s ease"/>
    <text x="55" y="54" text-anchor="middle" font-size="22" font-weight="700" fill="var(--ink)">${big}</text><text x="55" y="72" text-anchor="middle" font-size="11" fill="var(--muted)">${small}</text></svg>`;
}
function ringsHTML(t) {
  const left = settings.kcal - t.kcal, pLeft = settings.protein - t.p;
  const kg = (weightLog.find(x => x.date <= state.date && x.date >= addDays(state.date, -14)) || [...weights].reverse().find(x => x.date <= state.date) || {}).kg;
  return `<div class="card"><div class="rings">
      <div class="ringbox">${ringSVG(settings.kcal ? t.kcal / settings.kcal : 0, 'var(--accent)', fmt(t.kcal), `of ${fmt(settings.kcal)} kcal`, left < 0)}
        <div class="small" style="color:${left < 0 ? 'var(--warn)' : 'var(--muted)'}"><b style="color:${left < 0 ? 'var(--warn)' : 'var(--accent)'}">${fmt(Math.abs(left))}</b> ${left < 0 ? 'over' : 'left'}</div></div>
      <div class="ringbox">${ringSVG(settings.protein ? t.p / settings.protein : 0, 'var(--p)', `${r0(t.p)} g`, `of ${settings.protein} g`, false)}
        <div class="small muted">${pLeft > 0 ? `<b style="color:var(--p)">${r0(pLeft)} g</b> protein to go` : '<b style="color:var(--p)">Protein target hit ✓</b>'}</div></div>
    </div>
    <div class="macros">
      <div class="macro"><span class="small muted"><i class="dot" style="background:var(--c)"></i>Carbs</span><b>${r0(t.c)} g</b><span class="small muted">${t.kcal ? r0(t.c * 4 / t.kcal * 100) : 0}% of kcal</span></div>
      <div class="macro"><span class="small muted"><i class="dot" style="background:var(--f)"></i>Fat</span><b>${r0(t.f)} g</b><span class="small muted">${t.kcal ? r0(t.f * 9 / t.kcal * 100) : 0}% of kcal</span></div>
      <div class="macro"><span class="small muted"><i class="dot" style="background:var(--p)"></i>Protein / kg</span><b>${kg ? r1(t.p / kg) : '–'}</b><span class="small muted">${kg ? `goal ${r1(settings.protein / kg)}` : 'log weight'}</span></div>
    </div></div>`;
}

// ---------- 3. Body composition ----------
function bodySeries() {
  const by = {};
  weights.forEach(w => { by[w.date] = { date: w.date, kg: w.kg, bf: w.bf || null }; });
  weightLog.forEach(w => { by[w.date] = { date: w.date, kg: w.kg, bf: w.bf || (by[w.date] || {}).bf || null }; });
  return Object.values(by).sort((a, b) => a.date.localeCompare(b.date));
}
function rolling(series, key, days = 7) {
  return series.map(p => { const v = series.filter(q => q[key] != null && dayNum(q.date) > dayNum(p.date) - days && q.date <= p.date).map(q => q[key]); return { date: p.date, v: v.length ? mean(v) : null }; });
}
function slopePerWeek(series, key, days = 21) {
  const last = series[series.length - 1]; if (!last) return null;
  const s = series.filter(p => p[key] != null && dayNum(p.date) > dayNum(last.date) - days); if (s.length < 4) return null;
  const xs = s.map(p => dayNum(p.date)), ys = s.map(p => p[key]), mx = mean(xs), my = mean(ys);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0); if (!den || dayNum(last.date) - xs[0] < 7) return null;
  return xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den * 7;
}
function bodyHTML() {
  const all = bodySeries();
  if (!all.length) return `<div class="card"><b>Body composition</b><div class="small muted" style="margin-top:6px">Log your weight on the Today tab (⚖ Weight) and your trend appears here.</div></div>`;
  const rg = state.brange || 90, from = rg === 'all' ? '0000' : addDays(todayStr(), -rg + 1);
  const s = all.filter(p => p.date >= from), avg = rolling(all, 'kg').filter(p => p.date >= from);
  const g = { kg: settings.goalKg || 66.5, bf: settings.goalBf || 13.5, date: settings.goalDate || '2027-01-15' };
  const gStart = settings.goalStart || '2026-11-15';
  const first = all.find(p => p.date >= gStart) || all[0], cur = rolling(all, 'kg').pop().v, bfs = all.filter(p => p.bf && p.date >= gStart), lastBf = bfs[bfs.length - 1];
  const rate = slopePerWeek(all, 'kg'), weeksLeft = Math.max(0.5, (dayNum(g.date) - dayNum(todayStr())) / 7), need = (g.kg - cur) / weeksLeft;
  const lean = lastBf ? lastBf.kg * (1 - lastBf.bf / 100) : null, lean0 = bfs[0] ? bfs[0].kg * (1 - bfs[0].bf / 100) : null;
  const pace = rate == null ? 'Pace shows after 2 weeks of weigh-ins' : rate > 0.05 ? `Going up ${sgn(rate, 1)} kg/week` : rate < -0.6 ? `${sgn(rate, 1)} kg/week · faster than planned, risks muscle` : `${sgn(rate, 1)} kg/week · ${Math.abs(rate) >= Math.abs(need) * 0.8 ? 'on pace ✓' : 'a little slow'}`;
  const tile = (l, v, sub) => `<div class="macro"><span class="small muted">${l}</span><b>${v}</b>${sub ? `<span class="small muted">${sub}</span>` : ''}</div>`;
  let h = `<div class="card"><b>Body composition</b><div class="small muted" style="margin-top:2px">Goal ${f1(g.kg)} kg at ${f1(g.bf)}% body fat by ${dShort(g.date)} · changes since ${dShort(first.date)}</div>
    <div class="macros">
      ${tile('Weight · 7-day', `${f1(cur)} kg`, `${sgn(cur - first.kg)} kg`)}
      ${tile('Body fat', lastBf ? `${f1(lastBf.bf)}%` : '–', bfs.length > 1 ? `${sgn(lastBf.bf - bfs[0].bf)} pts` : 'from your scale')}
      ${tile('Lean mass', lean ? `${f1(lean)} kg` : '–', lean0 && bfs.length > 1 ? `${sgn(lean - lean0)} kg` : 'weight − fat')}
    </div>
    <div class="small" style="margin:10px 0 2px">${esc(pace)}${rate != null && cur > g.kg ? `<span class="muted"> · needs ${sgn(need, 1)} kg/week to reach ${r1(g.kg)} kg</span>` : ''}</div>
    <div class="seg" id="brg" style="margin:10px 0 4px"><button data-r="30">30 d</button><button data-r="90">90 d</button><button data-r="all">All</button></div>
    <div class="small muted" style="margin-top:8px"><b style="color:var(--ink)">Weight</b> · dots = weigh-ins, line = 7-day average</div>
    ${tChart({ id: 'bwt', pts: s.map(p => ({ date: p.date, v: p.kg })), line: avg, band: [g.kg - 0.5, g.kg + 0.5], color: 'var(--accent)', fmt: p => `${r1(p.v)} kg` })}`;
  const sb = s.filter(p => p.bf);
  if (sb.length >= 2) h += `<div class="small muted" style="margin-top:12px"><b style="color:var(--ink)">Body fat</b> · scale estimate, watch the trend</div>
    ${tChart({ id: 'bbf', pts: sb.map(p => ({ date: p.date, v: p.bf })), line: rolling(sb, 'bf', 10), band: [g.bf - 0.5, g.bf + 0.5], color: 'var(--f)', fmt: p => `${r1(p.v)}%`, h: 120 })}`;
  h += `<button class="linkbtn small" id="bgoal" style="margin-top:8px">Change goal</button>
    <div class="small muted" style="margin-top:6px">Scales swing ±1 kg day to day with water and food. Judge progress by the 7-day average and the body-fat trend over weeks.</div></div>`;
  return h;
}
function wireBody() {
  const sg = $('#brg'); if (sg) sg.querySelectorAll('button').forEach(b => { const v = b.dataset.r === 'all' ? 'all' : +b.dataset.r; b.classList.toggle('on', v === (state.brange || 90)); b.onclick = () => { state.brange = v; viewHealth(); }; });
  const bg = $('#bgoal'); if (bg) bg.onclick = () => openSheet(`<h3>Body goal</h3>
    <label class="small muted">Goal weight (kg)</label><input id="gkg" type="number" step="0.1" inputmode="decimal" value="${settings.goalKg || 66.5}">
    <label class="small muted">Goal body fat (%)</label><input id="gbf" type="number" step="0.1" inputmode="decimal" value="${settings.goalBf || 13.5}">
    <label class="small muted">By</label><input id="gdt" type="date" value="${settings.goalDate || '2027-01-15'}">
    <button class="btn" id="gsv" style="margin-top:14px">Save</button>`, sh => {
    sh.querySelector('#gsv').onclick = () => { settings.goalKg = num(sh.querySelector('#gkg').value) || 66.5; settings.goalBf = num(sh.querySelector('#gbf').value) || 13.5;
      settings.goalDate = sh.querySelector('#gdt').value || '2027-01-15'; saveSettings(); closeSheet(); viewHealth(); toast('Goal saved'); };
  });
}

// ---------- 4. Blood pressure ----------
function bpAll() {
  const fromApp = new Set();
  bpRemote.forEach(x => { const m = x.notes.match(/app:([\w-]+)/); if (m) fromApp.add(m[1]); });
  const local = bpLog.filter(x => !fromApp.has(x.id)).map(x => ({ ...x, notes: '' }));
  return [...bpRemote, ...local].map(x => { const S = [x.s1, x.s2].filter(Boolean), D = [x.d1, x.d2].filter(Boolean), P = [x.p1, x.p2].filter(Boolean);
    return { ...x, s: mean(S), d: mean(D), p: P.length ? mean(P) : null, skip: /left out/i.test(x.notes || ''), period: x.period || (x.time >= '15:00' ? 'evening' : 'morning') }; })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
function bpCat(s, d) {
  if (s >= 180 || d >= 120) return ['Very high', 'var(--warn)'];
  if (s >= 140 || d >= 90) return ['High (stage 2 range)', 'var(--warn)'];
  if (s >= 130 || d >= 80) return ['Raised (stage 1 range)', '#d9a21b'];
  if (s >= 120) return ['Elevated', '#d9a21b'];
  return ['Normal', 'var(--accent)'];
}
function bpStats(days = 7) {
  const all = bpAll(); if (!all.length) return null;
  const end = all[all.length - 1].date, use = all.filter(x => !x.skip && x.date > addDays(end, -days));
  const part = per => { const r = use.filter(x => x.period === per); return r.length ? { s: mean(r.map(x => x.s)), d: mean(r.map(x => x.d)), n: r.length } : null; };
  return { all, use, end, avg: use.length ? { s: mean(use.map(x => x.s)), d: mean(use.map(x => x.d)), p: mean(use.filter(x => x.p).map(x => x.p)) } : null,
    am: part('morning'), pm: part('evening'), days: new Set(use.map(x => x.date)).size };
}
function bpHTML() {
  const st = bpStats();
  if (!st) return `<div class="card"><b>Blood pressure</b><div class="small muted" style="margin-top:6px">Log readings on the Today tab (BP button). Take 2 readings a minute apart, morning and evening, for 7 days for a reliable average.</div></div>`;
  const a = st.avg, cat = a ? bpCat(a.s, a.d) : null;
  const pts = st.all.filter(x => x.date >= addDays(todayStr(), -90));
  let h = `<div class="card"><div class="spread"><b>Blood pressure</b><span class="small muted">last 7 days · ${st.use.length} reading${st.use.length === 1 ? '' : 's'}</span></div>
    ${a ? `<div class="spread" style="margin-top:8px;align-items:flex-end"><div><div class="big">${r0(a.s)}/${r0(a.d)}</div><div class="small muted">average mmHg${a.p ? ` · pulse ${r0(a.p)}` : ''}</div></div>
      <span class="wkchip" style="background:transparent;border:1.5px solid ${cat[1]};color:${cat[1]}">${cat[0]}</span></div>` : ''}
    <div class="macros">
      <div class="macro"><span class="small muted">Morning</span><b>${st.am ? `${r0(st.am.s)}/${r0(st.am.d)}` : '–'}</b><span class="small muted">${st.am ? `${st.am.n} reading${st.am.n === 1 ? '' : 's'}` : 'none yet'}</span></div>
      <div class="macro"><span class="small muted">Evening</span><b>${st.pm ? `${r0(st.pm.s)}/${r0(st.pm.d)}` : '–'}</b><span class="small muted">${st.pm ? `${st.pm.n} reading${st.pm.n === 1 ? '' : 's'}` : 'none yet'}</span></div>
      <div class="macro"><span class="small muted">7-day check</span><b>${Math.min(st.days, 7)}/7</b><span class="small muted">${st.days >= 7 ? 'complete ✓' : 'days done'}</span></div>
    </div>`;
  if (pts.length >= 2) h += `<div class="small muted" style="margin-top:12px"><span class="wkdot" style="background:#e5484d"></span>Systolic <span class="wkdot" style="background:var(--p);margin-left:8px"></span>Diastolic · dashed = 120/80</div>
    ${tChart({ id: 'bpc', pts: pts.map(x => ({ date: x.date, v: x.s, x })), lines: [{ pts: pts.map(x => ({ date: x.date, v: 120 })), color: 'var(--muted)', dash: 1 }, { pts: pts.map(x => ({ date: x.date, v: 80 })), color: 'var(--muted)', dash: 1 }, { pts: pts.map(x => ({ date: x.date, v: x.d })), color: 'var(--p)' }],
      color: '#e5484d', fmt: p => `${r0(p.x.s)}/${r0(p.x.d)}${p.x.p ? ` · pulse ${r0(p.x.p)}` : ''} · ${p.x.period}`, h: 140 })}`;
  h += `<div class="list" style="margin:10px -14px 0;border:0">${[...st.all].reverse().slice(0, 6).map(x => `<div class="item"><div class="grow"><div class="name">${r0(x.s)}/${r0(x.d)}</div>
      <div class="small muted">${shortDay(x.date, true)} · ${esc(x.time)} · ${cap(x.period)}${x.s2 ? ' · avg of 2' : ''}${x.skip ? ' · not averaged' : ''}</div></div><div class="small muted">${x.p ? `♥ ${r0(x.p)}` : ''}</div></div>`).join('')}</div>
    <button class="btn secondary" id="bpdoc" style="margin-top:10px">Summary for my doctor</button>
    <div class="small muted" style="margin-top:6px">Home readings, for tracking only. Categories follow the American Heart Association ranges; your doctor decides what they mean for you.</div></div>`;
  return h;
}
function bpDoctorText() {
  const st = bpStats(), a = st.avg, lines = [];
  lines.push(`Home blood pressure summary — ${shortDay(st.end, true)}`);
  if (a) lines.push(`7-day average: ${r0(a.s)}/${r0(a.d)} mmHg${a.p ? `, pulse ${r0(a.p)} bpm` : ''} (${st.use.length} readings over ${st.days} days)`);
  if (st.am) lines.push(`Morning average: ${r0(st.am.s)}/${r0(st.am.d)} (${st.am.n} readings)`);
  if (st.pm) lines.push(`Evening average: ${r0(st.pm.s)}/${r0(st.pm.d)} (${st.pm.n} readings)`);
  lines.push('', 'Readings:');
  st.all.slice(-28).forEach(x => lines.push(`${x.date} ${x.time} ${x.period}: ${[x.s1 && `${x.s1}/${x.d1}`, x.s2 && `${x.s2}/${x.d2}`].filter(Boolean).join(', ')}${x.p ? ` pulse ${r0(x.p)}` : ''}${x.skip ? ' (first day, not averaged)' : ''}`));
  const rhr = Object.keys(health).sort().slice(-14).map(d => health[d].rhr).filter(Boolean);
  if (rhr.length) lines.push('', `Resting heart rate (watch, last 2 weeks): ${Math.min(...rhr)}–${Math.max(...rhr)} bpm, average ${r0(mean(rhr))}`);
  lines.push('', 'Measured at home with an upper-arm monitor, seated, 2 readings a minute apart.');
  return lines.join('\n');
}
function wireBP() {
  const b = $('#bpdoc'); if (!b) return;
  b.onclick = () => { const txt = bpDoctorText();
    openSheet(`<h3>Summary for your doctor</h3><pre class="docsum">${esc(txt)}</pre>
      <button class="btn" id="bpshare">${navigator.share ? 'Share' : 'Copy'}</button>`, sh => {
      sh.querySelector('#bpshare').onclick = async () => {
        try { if (navigator.share) await navigator.share({ title: 'Blood pressure summary', text: txt }); else { await navigator.clipboard.writeText(txt); toast('Copied'); } } catch (e) { }
      };
    }); };
}

// ---------- 5. Strength progress ----------
function strengthHTML() {
  if (!sets.length) return '';
  const groups = {};
  sets.forEach(x => { const k = exName(x.ex, x.sub); if (/^(cardio|unknown|warm up)$/i.test(k)) return; (groups[k] = groups[k] || []).push(x); });
  const rows = Object.entries(groups).map(([k, arr]) => {
    const bySess = {}; arr.forEach(x => { const s = bySess[x.date + x.aid] = bySess[x.date + x.aid] || { date: x.date, reps: 0, sets: 0, kg: 0, dur: 0 };
      s.reps += x.reps || 0; s.sets += x.sets || 0; s.kg = Math.max(s.kg, x.kg || 0); s.dur += x.dur || 0; });
    const ss = Object.values(bySess).sort((a, b) => a.date.localeCompare(b.date));
    const timed = ss.every(s => !s.reps), metric = s => timed ? s.dur : s.reps;
    return { k, ss, timed, metric, n: ss.length, last: ss[ss.length - 1] };
  }).sort((a, b) => b.n - a.n || b.last.date.localeCompare(a.last.date)).slice(0, 8);
  const spark = r => { const v = r.ss.map(r.metric); if (v.length < 2) return ''; const hi = Math.max(...v), lo = Math.min(...v), W = 70, H = 24;
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${v.map((x, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * (W - 4) + 2).toFixed(1)},${(H - 3 - (hi > lo ? (x - lo) / (hi - lo) : .5) * (H - 6)).toFixed(1)}`).join('')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`; };
  return `<div class="card"><b>Strength progress</b> <span class="small muted">· per exercise, from your watch</span>
    <div class="list" style="margin:8px -14px 0;border:0">${rows.map(r => {
      const l = r.last, f = r.ss[0], ch = r.metric(l) - r.metric(f);
      const val = r.timed ? `${wkDur(l.dur)} in ${l.sets} set${l.sets === 1 ? '' : 's'}` : `${l.reps} reps in ${l.sets} set${l.sets === 1 ? '' : 's'}${l.kg ? ` · ${r1(l.kg)} kg` : ''}`;
      return `<div class="item"><div class="grow"><div class="name">${esc(r.k)}</div><div class="small muted">${esc(val)} · ${shortDay(l.date, true)}</div></div>
        ${spark(r)}<div style="min-width:64px;text-align:right" class="small">${r.n > 1 ? `<b style="color:${ch > 0 ? 'var(--accent)' : ch < 0 ? 'var(--warn)' : 'var(--muted)'}">${ch > 0 ? '+' : ch < 0 ? '−' : '±'}${r.timed ? wkDur(Math.abs(ch)) : Math.abs(ch)}</b><div class="muted">${r.n} sessions</div>` : '<span class="muted">first time</span>'}</div></div>`;
    }).join('')}</div>
    <div class="small muted" style="margin-top:6px">Change = latest session vs your first. Rep counts are what the watch detected; fix wrong ones in Garmin Connect.</div></div>`;
}

// ---------- 6. Personal records ----------
function personalRecords() {
  const recs = [], add = (k, v, show, a, extra) => { if (v != null && a) recs.push({ k, v, show, date: a.date, name: a.name, id: a.id, extra }); };
  const runs = acts.filter(a => /running/.test(a.type || '')), walks = acts.filter(a => /walking|hiking/.test(a.type || ''));
  const minBy = (arr, f) => arr.filter(a => f(a)).sort((a, b) => f(a) - f(b))[0], maxBy = (arr, f) => arr.filter(a => f(a)).sort((a, b) => f(b) - f(a))[0];
  let x;
  if ((x = minBy(runs, a => a.f1k))) add('Fastest 1 km', x.f1k, wkDur(x.f1k), x);
  if ((x = minBy(runs, a => a.fmi))) add('Fastest mile', x.fmi, wkDur(x.fmi), x);
  if ((x = minBy(runs, a => a.f5k))) add('Fastest 5 km', x.f5k, wkDur(x.f5k), x);
  if ((x = minBy(runs, a => a.f10k))) add('Fastest 10 km', x.f10k, wkDur(x.f10k), x);
  if ((x = maxBy(runs, a => a.km))) add('Longest run', x.km, `${r1(x.km)} km`, x);
  if ((x = maxBy(walks, a => a.km))) add('Longest walk', x.km, `${r1(x.km)} km`, x);
  if ((x = maxBy(acts, a => a.dur))) add('Longest workout', x.dur, `${r0(x.dur)} min`, x);
  if ((x = maxBy(acts, a => a.load))) add('Hardest workout', x.load, `load ${r0(x.load)}`, x);
  const st = Object.entries(health).filter(([, h]) => h.steps).sort((a, b) => b[1].steps - a[1].steps)[0];
  if (st) recs.push({ k: 'Most steps in a day', show: fmt(st[1].steps), date: st[0] });
  const per = {}; sets.forEach(s => { const k = exName(s.ex, s.sub); if (!s.reps || /^(cardio)$/i.test(k)) return; const key = k + s.date + s.aid; per[key] = per[key] || { k, date: s.date, reps: 0 }; per[key].reps += s.reps; });
  const best = {}; Object.values(per).forEach(p => { if (!best[p.k] || p.reps > best[p.k].reps) best[p.k] = p; });
  Object.values(best).sort((a, b) => b.reps - a.reps).slice(0, 3).forEach(p => recs.push({ k: `${p.k}: most reps`, show: `${p.reps}`, date: p.date, extra: 'one session' }));
  return recs;
}
function prsHTML() {
  const recs = personalRecords(); if (!recs.length) return '';
  const fresh = addDays(todayStr(), -7);
  return `<div class="card"><b>Personal records</b>
    <div class="prgrid">${recs.map(r => `<div class="pr ${r.date >= fresh ? 'new' : ''}" ${r.id ? `data-prid="${esc(r.id)}"` : ''}>
      <div class="small muted">${esc(r.k)}</div><div class="prv">${esc(r.show)}${r.date >= fresh ? ' <span class="prnew">NEW</span>' : ''}</div>
      <div class="small muted">${dShort(r.date)}${r.extra ? ` · ${esc(r.extra)}` : ''}</div></div>`).join('')}</div>
    ${!acts.some(a => a.f1k) ? '<div class="small muted" style="margin-top:6px">Fastest km and 5 km records appear after the next Garmin sync.</div>' : ''}</div>`;
}
function prIds() { const fresh = addDays(todayStr(), -7); return new Set(personalRecords().filter(r => r.id && r.date >= fresh).map(r => String(r.id))); }

// ---------- 7. What affects your sleep ----------
function sleepFactors() {
  const all = [...entries, ...remote];
  const days = Array.from({ length: 180 }, (_, i) => addDays(todayStr(), -(i + 1)));
  const night = d => health[addDays(d, 1)] || {};
  const logged = new Set(all.map(e => e.date));
  const evening = d => acts.some(a => a.date === d && a.type !== 'walking' && a.start >= '19:00');
  const trained = d => acts.some(a => a.date === d && a.type !== 'walking');
  const F = [
    ['🍽', 'Late meal (after 9 pm)', d => all.some(e => e.date === d && e.time >= '21:00' && e.kcal >= 150), true],
    ['☕', 'Caffeine after 2 pm', d => all.some(e => e.date === d && e.time >= '14:00' && (e.caf || 0) > 0), true],
    ['🍷', 'Alcohol', d => all.some(e => e.date === d && (e.alc || 0) > 0), true],
    ['🌙', 'Workout after 7 pm', evening, false],
    ['🏋', 'Workout day', trained, false],
    ['😓', 'Stressful day (avg 35+)', d => health[d] && health[d].stress != null ? health[d].stress >= 35 : null, false],
    ['👟', '8,000+ steps', d => health[d] && health[d].steps ? health[d].steps >= 8000 : null, false],
    ['🛏', 'In bed before midnight', d => { const b = bedMin(night(d).bed); return b == null ? null : b < 24 * 60; }, false],
  ];
  return F.map(([ic, label, test, needsFood]) => {
    const yes = [], no = [];
    days.forEach(d => { const sc = night(d).score; if (sc == null || (night(d).hrs || 0) < 3) return; if (needsFood && !logged.has(d)) return; const t = test(d); if (t == null) return; (t ? yes : no).push(sc); });
    return { ic, label, yes, no, ok: yes.length >= 3 && no.length >= 3, a: mean(yes), b: mean(no), diff: yes.length && no.length ? mean(yes) - mean(no) : 0 };
  });
}
function sleepFactorsHTML() {
  const fs = sleepFactors(), ok = fs.filter(f => f.ok).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)), wait = fs.filter(f => !f.ok);
  if (!ok.length && !wait.length) return '';
  const top = ok[0];
  const bar = (v, c) => `<div class="sfbar"><i style="width:${Math.max(4, Math.min(100, (v - 40) / 55 * 100))}%;background:${c}"></i><span>${r0(v)}</span></div>`;
  return `<div class="card"><b>What affects your sleep</b> <span class="small muted">· sleep score, last 6 months</span>
    ${top && Math.abs(top.diff) >= 3 ? `<div class="sftop">${top.ic} Biggest link: <b>${esc(top.label.toLowerCase())}</b> → sleep score <b style="color:${top.diff > 0 ? 'var(--accent)' : 'var(--warn)'}">${top.diff > 0 ? '+' : '−'}${r0(Math.abs(top.diff))}</b> on average</div>` : ''}
    ${ok.map(f => { const big = Math.abs(f.diff) >= 3, c = !big ? 'var(--muted)' : f.diff > 0 ? 'var(--accent)' : 'var(--warn)';
      return `<div class="sfrow"><div class="spread"><span>${f.ic} ${esc(f.label)}</span><b style="color:${c}">${f.diff > 0 ? '+' : f.diff < 0 ? '−' : '±'}${r0(Math.abs(f.diff))}</b></div>
        <div class="sfpair"><span class="small muted">Yes · ${f.yes.length}</span>${bar(f.a, c === 'var(--muted)' ? 'var(--muted)' : c)}<span class="small muted">No · ${f.no.length}</span>${bar(f.b, 'var(--line)')}</div></div>`; }).join('')}
    ${wait.length ? `<div class="small muted" style="margin-top:8px">Needs more days: ${wait.map(f => `${f.ic} ${esc(f.label.toLowerCase())} (${f.yes.length}/3)`).join(' · ')}</div>` : ''}
    <div class="small muted" style="margin-top:8px">Average sleep score on nights after days with vs without each thing. Food items count only days you logged food. Patterns, not proof of cause.</div></div>`;
}

// ---------- 8. Fitness radar ----------
// Six abilities, each 0–100 against common fitness standards (100 = excellent for an adult man).
// Consistency and recovery are habits/states, so they sit beside the chart as badges, not spokes.
function fitnessScores(asOf) {
  const end = asOf || todayStr(), from = d => addDays(end, -d);
  const inWin = (date, days) => date <= end && date > from(days);
  const sess = {}; sets.filter(s => inWin(s.date, 60)).forEach(s => {
    const k = exName(s.ex, s.sub).toLowerCase(), key = s.aid + s.date;
    (sess[k] = sess[k] || {})[key] = sess[k][key] || { date: s.date, reps: 0, sets: 0, kg: 0, dur: 0 };
    const x = sess[k][key]; x.reps += s.reps || 0; x.sets += s.sets || 0; x.kg = Math.max(x.kg, s.kg || 0); x.dur += s.dur || 0;
  });
  const best = (re, f) => { let b = null; Object.entries(sess).forEach(([k, m]) => { if (!re.test(k)) return; Object.values(m).forEach(x => { const v = f(x); if (v != null && (!b || v > b.v)) b = { v, x, k }; }); }); return b; };
  const perSet = x => x.sets ? x.reps / x.sets : null;
  const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
  const out = [];
  const push = best(/push ?up|bench|dip/, perSet);
  out.push({ k: 'Push', s: push ? clamp(push.v / 40 * 100) : null, why: push ? `${r0(push.v)} reps per set (${cap(push.k)}, ${dShort(push.x.date)}) · 40 = excellent` : 'No push-ups or presses in 60 days' });
  const pull = best(/row|pull|chin|curl/, x => x.sets ? x.reps / x.sets * (1 + (x.kg || 0) / 20) : null);
  out.push({ k: 'Pull', s: pull ? clamp(pull.v / 25 * 100) : null, why: pull ? `${r0(pull.x.reps / pull.x.sets)} reps per set${pull.x.kg ? ` with ${r1(pull.x.kg)} kg` : ''} (${cap(pull.k)}) · 25 = excellent` : 'No rows or pull-ups in 60 days' });
  const legs = best(/squat|lunge|deadlift|bridge|step up/, x => x.sets ? x.reps / x.sets * (1 + (x.kg || 0) / 30) : null);
  out.push({ k: 'Legs', s: legs ? clamp(legs.v / 40 * 100) : null, why: legs ? `${r0(legs.x.reps / legs.x.sets)} reps per set (${cap(legs.k)}) · 40 = excellent` : 'No squats or lunges in 60 days' });
  const core = best(/plank|crunch|sit up|hollow|dead bug/, x => x.sets ? (x.reps ? x.reps / x.sets * 3 : x.dur / x.sets) : null);
  out.push({ k: 'Core', s: core ? clamp(core.v / 180 * 100) : null, why: core ? (core.x.reps ? `${r0(core.x.reps / core.x.sets)} reps per set (${cap(core.k)})` : `${r0(core.x.dur / core.x.sets)} s plank per set`) + ' · 3 min = excellent' : 'No planks or core work in 60 days' });
  const runs = acts.filter(a => /running/.test(a.type || '') && inWin(a.date, 90));
  const fk = runs.filter(a => a.f1k).sort((a, b) => a.f1k - b.f1k)[0];
  out.push({ k: 'Speed', s: fk ? clamp((600 - fk.f1k) / (600 - 240) * 100) : null, why: fk ? `Best km ${wkDur(fk.f1k)} (${dShort(fk.date)}) · 4:00 = excellent, 10:00 = 0` : 'No timed runs in 90 days' });
  const longRun = acts.filter(a => /running/.test(a.type || '') && inWin(a.date, 60)).reduce((m, a) => Math.max(m, a.km || 0), 0);
  const wks = [0, 1, 2, 3].map(w => { let t = 0; for (let i = 0; i < 7; i++) { const h = health[addDays(end, -(w * 7 + i))]; if (h) t += (h.imMod || 0) + 2 * (h.imVig || 0); } return t; });
  const im = mean(wks), endS = Math.max(longRun / 10, im / 300) * 100;
  out.push({ k: 'Endurance', s: longRun || im ? clamp(endS) : null, why: `Longest run ${r1(longRun)} km (10 km = excellent) · ${r0(im)} intensity min/week (300 = excellent)` });
  return out;
}
function fitnessBadges() {
  const t = todayStr(), wk = [0, 1, 2, 3].map(w => acts.filter(a => a.type !== 'walking' && a.date <= addDays(t, -7 * w) && a.date > addDays(t, -7 * (w + 1))).length);
  const cons = Math.round(mean(wk.map(n => Math.min(3, n) / 3)) * 100);
  const days = Object.keys(health).sort(), last = days.filter(d => health[d].hrv != null).pop(), L = last ? health[last] : {};
  const rhr30 = mean(days.slice(-31, -1).map(d => health[d].rhr).filter(Boolean)) || null;
  let rec = 'No data', rc = 'var(--muted)';
  if (L.hrv != null) {
    const lowHrv = L.hrvLo && L.hrv < L.hrvLo, highRhr = rhr30 && L.rhr && L.rhr - rhr30 >= 4;
    if (lowHrv && highRhr) { rec = 'Low'; rc = 'var(--warn)'; } else if (lowHrv || highRhr || L.hrvStatus === 'UNBALANCED') { rec = 'Fair'; rc = '#d9a21b'; } else { rec = 'Good'; rc = 'var(--accent)'; }
  }
  return { cons, consTxt: `${wk[0]} workout${wk[0] === 1 ? '' : 's'} in the last 7 days · goal 3/week, averaged over 4 weeks`, rec, rc, recTxt: L.hrv != null ? `HRV ${L.hrv} ms${L.hrvLo ? ` (normal ${L.hrvLo}–${L.hrvHi})` : ''} · resting HR ${L.rhr ?? '–'}${rhr30 ? ` (usual ${r0(rhr30)})` : ''}` : '' };
}
function radarHTML() {
  const now = fitnessScores(), then = fitnessScores(addDays(todayStr(), -30));
  if (now.filter(x => x.s != null).length < 2) return '';
  const showThen = then.filter(x => x.s != null).length >= 3;
  const N = now.length, C = 150, R = 100, ang = i => -Math.PI / 2 + i * 2 * Math.PI / N;
  const pt = (i, v) => [C + Math.cos(ang(i)) * R * v / 100, C + Math.sin(ang(i)) * R * v / 100];
  const poly = sc => sc.map((x, i) => pt(i, x.s || 0).map(n => n.toFixed(1)).join(',')).join(' ');
  let g = [25, 50, 75, 100].map(l => `<polygon points="${now.map((_, i) => pt(i, l).join(',')).join(' ')}" fill="none" stroke="var(--line)" stroke-width="1"/>`).join('');
  g += now.map((_, i) => `<line x1="${C}" y1="${C}" x2="${pt(i, 100)[0]}" y2="${pt(i, 100)[1]}" stroke="var(--line)"/>`).join('');
  if (showThen) g += `<polygon points="${poly(then)}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  g += `<polygon points="${poly(now)}" fill="var(--accent)" fill-opacity=".2" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/>`;
  g += now.map((x, i) => { const [px, py] = pt(i, x.s || 0); return x.s != null ? `<circle cx="${px}" cy="${py}" r="4" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>` : ''; }).join('');
  g += now.map((x, i) => { const [lx, ly] = pt(i, 128), anchor = Math.abs(lx - C) < 8 ? 'middle' : lx > C ? 'start' : 'end';
    return `<g class="rlab" data-ri="${i}" style="cursor:pointer"><rect x="${lx - 40}" y="${ly - 16}" width="80" height="32" fill="transparent"/>
      <text x="${lx}" y="${ly - 2}" text-anchor="${anchor}" font-size="12" fill="var(--muted)">${x.k}</text>
      <text x="${lx}" y="${ly + 13}" text-anchor="${anchor}" font-size="14" font-weight="700" fill="var(--ink)">${x.s ?? '–'}</text></g>`; }).join('');
  const b = fitnessBadges(), avg = r0(mean(now.filter(x => x.s != null).map(x => x.s)));
  window._radar = now;
  return `<div class="card"><div class="spread"><b>Fitness profile</b><span class="small muted">overall ${avg}/100</span></div>
    <svg viewBox="-20 0 340 300" style="width:100%;display:block;margin-top:4px">${g}</svg>
    ${showThen ? '<div class="small muted" style="text-align:center;margin-top:-4px"><span class="wkdot" style="background:var(--accent)"></span>Now <span style="display:inline-block;width:14px;border-top:2px dashed var(--muted);vertical-align:3px;margin:0 4px 0 10px"></span>30 days ago</div>' : ''}
    <div class="small muted" id="rcap" style="margin:8px 0 2px;min-height:18px;text-align:center">Tap a label to see what the score is based on</div>
    <div class="rbadges">
      <div class="rbadge"><div class="small muted">Consistency</div><b>${b.cons}%</b><div class="small muted">${esc(b.consTxt)}</div></div>
      <div class="rbadge"><div class="small muted">Recovery today</div><b style="color:${b.rc}">${b.rec}</b><div class="small muted">${esc(b.recTxt)}</div></div>
    </div>
    <div class="small muted" style="margin-top:8px">Scores compare your best recent effort with common fitness standards (100 = excellent). Strength uses the last 60 days of watch-detected exercises.</div></div>`;
}
function wireRadar() {
  document.querySelectorAll('.rlab').forEach(el => el.onclick = () => {
    const x = (window._radar || [])[+el.dataset.ri]; if (!x) return;
    document.querySelectorAll('.rlab text:last-child').forEach(t => t.setAttribute('fill', 'var(--ink)'));
    el.querySelector('text:last-child').setAttribute('fill', 'var(--accent)');
    $('#rcap').innerHTML = `<b style="color:var(--ink)">${x.k} ${x.s ?? '–'}</b> · ${esc(x.why)}`;
  });
}
