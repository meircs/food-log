'use strict';
/* Food logging: Today, Add, supplements, saved meals, My foods, barcode scanning. */
// ---------- Today ----------
function viewToday() {
  const day = [...entries, ...remote].filter(e => e.date === state.date).sort((a, b) => a.time.localeCompare(b.time));
  const t = totals(day);
  const left = settings.kcal - t.kcal;
  const pct = Math.min(100, settings.kcal ? t.kcal / settings.kcal * 100 : 0);
  const pPct = settings.protein ? Math.min(100, t.p / settings.protein * 100) : 0;
  let html = `<div class="card">
    <div class="spread"><div><div class="big">${fmt(t.kcal)}</div><div class="muted small">of ${fmt(settings.kcal)} kcal</div></div>
    <div style="text-align:right"><div style="font-size:22px;font-weight:650;color:${left < 0 ? 'var(--warn)' : 'var(--accent)'}">${fmt(Math.abs(left))}</div>
    <div class="muted small">${left < 0 ? 'over' : 'left'}</div></div></div>
    <div class="bar ${left < 0 ? 'over' : ''}"><i style="width:${pct}%"></i></div>
    <div class="macros">
      <div class="macro"><span class="small muted"><i class="dot" style="background:var(--p)"></i>Protein</span><b>${r0(t.p)} g</b><span class="small muted">${r0(pPct)}% of ${settings.protein}</span></div>
      <div class="macro"><span class="small muted"><i class="dot" style="background:var(--c)"></i>Carbs</span><b>${r0(t.c)} g</b></div>
      <div class="macro"><span class="small muted"><i class="dot" style="background:var(--f)"></i>Fat</span><b>${r0(t.f)} g</b></div>
    </div></div>
    ${burnLine(t.kcal)}
    <div class="small muted" id="syncline" style="margin:-4px 4px 8px">${esc(syncStatus())}</div>
    ${suppCard()}
    <div class="mealadd">${['breakfast', 'lunch', 'dinner', 'snack'].map(m => `<button class="chip" data-addm="${m}">＋ ${cap(m)}</button>`).join('')}<button class="chip" id="wlog">${weightChip()}</button><button class="chip" id="bplog">${bpChip()}</button></div>`;
  if (!day.length) html += `<div class="list"><div class="empty">Nothing logged yet.<br><button class="btn" id="goadd" style="max-width:220px;margin:12px auto 0">Add food</button></div></div>`;
  for (const m of MEALS) {
    const items = day.filter(e => e.meal === m); if (!items.length) continue;
    html += `<h2><span class="spread"><span>${cap(m)} · ${fmt(totals(items).kcal)} kcal</span><span><button class="linkbtn" data-addm="${m}" style="margin-right:12px">＋ Add</button><button class="linkbtn" data-save="${m}">Save as meal</button></span></span></h2><div class="list">` +
      items.map(e => `<button class="item" data-id="${e.id}"><div class="grow"><div class="name">${esc(e.name)}</div>
        <div class="small muted">${esc(e.time)}${e.amount ? ' · ' + esc(e.amount) : ''}${e.remote ? ` · <span style="color:var(--accent)">${e.other ? 'other device' : 'via Claude'}</span>` : ''}</div></div><div class="kcal">${r0(e.kcal)}</div></button>`).join('') + `</div>`;
  }
  if (day.length) html += `<button class="btn secondary" id="goadd" style="margin-top:16px">＋ Add food</button>`;
  $('#view').innerHTML = html;
  const g = $('#goadd'); if (g) g.onclick = () => { state.tab = 'add'; render(); };
  $('#view').querySelectorAll('[data-supp]').forEach(b => b.onclick = () => toggleSupp(b.dataset.supp));
  const se = $('#suppedit'); if (se) se.onclick = editSupps;
  $('#view').querySelectorAll('.item').forEach(b => b.onclick = () => { const e = day.find(x => x.id === b.dataset.id); e.remote ? showRemote(e) : editEntry(e); });
  $('#view').querySelectorAll('[data-addm]').forEach(b => b.onclick = () => { state.tab = 'add'; render(); state.addMeal = b.dataset.addm; renderHeader(); window.scrollTo(0, 0); });
  const wl = $('#wlog'); if (wl) wl.onclick = () => logWeight();
  const bl = $('#bplog'); if (bl) bl.onclick = () => logBP();
  $('#view').querySelectorAll('[data-save]').forEach(b => b.onclick = () => saveAsMeal(day.filter(e => e.meal === b.dataset.save), b.dataset.save));
}

function burnLine(eaten) {
  const g = garmin[state.date];
  if (state.date < todayStr() && g && g.total) { const b = eaten - g.total;
    return `<div class="small" style="margin:-4px 4px 8px">🔥 Garmin burned <b>${fmt(g.total)}</b> kcal${eaten ? ` · ${b > 0 ? '+' : '−'}${fmt(Math.abs(b))} vs eaten` : ''}</div>`; }
  if (state.date !== todayStr()) return '';
  const m = targetModel(); if (!m.gAvg) return '';
  const y = garmin[addDays(todayStr(), -1)], b = m.gAvg - eaten;
  return `<div class="small" style="margin:-4px 4px 8px">🔥 Expected burn today ≈ <b>${fmt(m.gAvg)}</b> kcal <span class="muted">(your Garmin average)</span> · ${b >= 0 ? `${fmt(b)} below so far` : `${fmt(-b)} above`}${y && y.total ? `<span class="muted"> · yesterday ${fmt(y.total)}</span>` : ''}</div>`;
}
function weightChip() {
  const w = weightLog.find(x => x.date === state.date) || weights.find(x => x.date === state.date);
  return w ? `⚖ ${r1(w.kg)} kg` : '⚖ Weight';
}
function logWeight() {
  const ex = weightLog.find(x => x.date === state.date);
  const last = ex ? ex.kg : (weights.length ? weights[weights.length - 1].kg : '');
  openSheet(`<h3>Weigh-in · ${esc(dateLabel(state.date))}</h3><div class="small muted">Best first thing in the morning, after the bathroom, before eating.</div>
    <div class="grid2"><div><label>Weight (kg)</label><input type="text" inputmode="decimal" id="wk" value="${last}"></div>
    <div><label>Body fat % (optional)</label><input type="text" inputmode="decimal" id="wb" value="${ex && ex.bf ? ex.bf : ''}"></div></div>
    <label>Time</label><input type="time" id="wt" value="${ex ? ex.time : state.date === todayStr() ? nowTime() : '08:00'}">
    <button class="btn" id="wsv">Save</button>${ex ? '<button class="btn danger" id="wdel">Delete this weigh-in</button>' : ''}`, s => {
    $('#wsv', s).onclick = () => {
      const kg = num($('#wk', s).value); if (kg < 25 || kg > 300) return toast('Enter your weight in kg');
      const bf = num($('#wb', s).value) || null, time = $('#wt', s).value || nowTime();
      if (ex) Object.assign(ex, { kg, bf, time, exported: false });
      else weightLog.push({ id: uid(), date: state.date, time, kg, bf, exported: false });
      weights = weights.filter(x => x.date !== state.date).concat({ date: state.date, kg }).sort((a, b) => a.date.localeCompare(b.date)); store.set('weights', weights);
      store.set('weightLog', weightLog); scheduleSync(); closeSheet(); render(); toast(`Saved ${r1(kg)} kg`);
    };
    const d = $('#wdel', s); if (d) d.onclick = () => {
      if (ex.exported) { const dl = store.get('wDeleted', []); dl.push(ex.id); store.set('wDeleted', dl); }
      weightLog = weightLog.filter(x => x !== ex); store.set('weightLog', weightLog);
      weights = weights.filter(x => x.date !== state.date); store.set('weights', weights); scheduleSync(); closeSheet(); render(); toast('Deleted');
    };
  });
}
function bpChip() {
  const t = bpLog.filter(x => x.date === state.date);
  if (!t.length) return '❤ BP';
  const l = t[t.length - 1]; const a = bpAvg(l);
  return `❤ ${a.s}/${a.d}${t.length > 1 ? ` ×${t.length}` : ''}`;
}
function bpAvg(x) { const S = [x.s1, x.s2].filter(Boolean), D = [x.d1, x.d2].filter(Boolean); return { s: Math.round(S.reduce((a, c) => a + c, 0) / S.length), d: Math.round(D.reduce((a, c) => a + c, 0) / D.length) }; }
function logBP() {
  const nowP = state.date === todayStr() && +nowTime().slice(0, 2) >= 15 ? 'evening' : 'morning';
  const pick = per => bpLog.find(x => x.date === state.date && x.period === per);
  const form = per => { const ex = pick(per);
    openSheet(`<h3>Blood pressure · ${esc(dateLabel(state.date))}</h3>
      <div class="small muted">Sit 5 min, back supported, feet flat, cuff on bare upper arm at heart level, no talking. Take 2 readings 1 min apart.</div>
      <div class="seg" id="bpp" style="margin-top:8px"><button data-p="morning">Morning</button><button data-p="evening">Evening</button></div>
      <label>Reading 1 (sys / dia / pulse)</label>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr"><input type="text" inputmode="numeric" id="s1" placeholder="120" value="${ex ? ex.s1 : ''}"><input type="text" inputmode="numeric" id="d1" placeholder="80" value="${ex ? ex.d1 : ''}"><input type="text" inputmode="numeric" id="p1" placeholder="pulse" value="${ex && ex.p1 ? ex.p1 : ''}"></div>
      <label>Reading 2 (optional)</label>
      <div class="grid2" style="grid-template-columns:1fr 1fr 1fr"><input type="text" inputmode="numeric" id="s2" placeholder="118" value="${ex && ex.s2 ? ex.s2 : ''}"><input type="text" inputmode="numeric" id="d2" placeholder="78" value="${ex && ex.d2 ? ex.d2 : ''}"><input type="text" inputmode="numeric" id="p2" placeholder="pulse" value="${ex && ex.p2 ? ex.p2 : ''}"></div>
      <label>Time</label><input type="time" id="bpt" value="${ex ? ex.time : state.date === todayStr() ? nowTime() : (per === 'evening' ? '20:00' : '08:00')}">
      <button class="btn" id="bpsv">Save</button>${ex ? '<button class="btn danger" id="bpdel">Delete this reading</button>' : ''}`, s => {
      $('#bpp', s).querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.p === per); b.onclick = () => { if (b.dataset.p !== per) { closeSheet(); form(b.dataset.p); } }; });
      $('#bpsv', s).onclick = () => {
        const v = k => Math.round(num($('#' + k, s).value)) || null;
        const r = { s1: v('s1'), d1: v('d1'), p1: v('p1'), s2: v('s2'), d2: v('d2'), p2: v('p2') };
        const okP = (sy, di) => sy >= 60 && sy <= 260 && di >= 30 && di <= 160 && sy > di;
        if (!okP(r.s1, r.d1)) return toast('Enter reading 1 as top / bottom number, e.g. 120 / 80');
        if ((r.s2 || r.d2) && !okP(r.s2, r.d2)) return toast('Check reading 2, or leave it empty');
        const time = $('#bpt', s).value || nowTime();
        if (ex) Object.assign(ex, r, { time, exported: false });
        else bpLog.push({ id: uid(), date: state.date, time, period: per, ...r, exported: false });
        store.set('bpLog', bpLog); scheduleSync(); closeSheet(); render();
        const hi = [[r.s1, r.d1], [r.s2, r.d2]].some(([sy, di]) => sy >= 180 || di >= 110);
        const a = bpAvg(r);
        toast(hi ? 'Very high reading. Rest 5 min and measure again. If it stays this high, contact a doctor or call 811 (911 with chest pain, breathlessness, weakness or vision problems).' : `Saved ${a.s}/${a.d}`);
      };
      const d = $('#bpdel', s); if (d) d.onclick = () => {
        if (ex.exported) { const dl = store.get('bpDeleted', []); dl.push(ex.id); store.set('bpDeleted', dl); }
        bpLog = bpLog.filter(x => x !== ex); store.set('bpLog', bpLog); scheduleSync(); closeSheet(); render(); toast('Deleted');
      };
    }); };
  form(nowP);
}
function editRemote(e) {
  openSheet(`<h3>Edit: ${esc(e.name)}</h3><div class="small muted">Changes go into your food log on the next sync.</div>
    <label>Ate only part of it?</label><div class="seg" id="rp"><button data-p="25">25%</button><button data-p="50">50%</button><button data-p="75">75%</button><button data-p="100" class="on">All</button></div>
    <div class="grid2"><div><label>Calories</label><input type="text" inputmode="decimal" id="rk" value="${r0(e.kcal)}"></div>
    <div><label>Protein g</label><input type="text" inputmode="decimal" id="rpp" value="${r0(e.p)}"></div>
    <div><label>Carbs g</label><input type="text" inputmode="decimal" id="rc" value="${r0(e.c)}"></div>
    <div><label>Fat g</label><input type="text" inputmode="decimal" id="rf" value="${r0(e.f)}"></div></div>
    <div class="grid2"><div><label>Meal</label><select id="rm">${MEALS.map(m => `<option ${m === e.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div><label>Time</label><input type="time" id="rt" value="${esc(e.time)}"></div></div>
    <button class="btn" id="rsv">Save changes</button>`, s => {
    const base = { k: e.kcal, p: e.p, c: e.c, f: e.f };
    s.querySelectorAll('#rp button').forEach(b => b.onclick = () => {
      s.querySelectorAll('#rp button').forEach(x => x.classList.toggle('on', x === b)); const k = +b.dataset.p / 100;
      $('#rk', s).value = r0(base.k * k); $('#rpp', s).value = r0(base.p * k); $('#rc', s).value = r0(base.c * k); $('#rf', s).value = r0(base.f * k);
    });
    $('#rsv', s).onclick = () => {
      const pctTxt = (s.querySelector('#rp button.on') || {}).dataset?.p;
      const vals = { calories: r0(num($('#rk', s).value)), protein_g: r0(num($('#rpp', s).value)), carbs_g: r0(num($('#rc', s).value)), fat_g: r0(num($('#rf', s).value)),
        meal: $('#rm', s).value, time: $('#rt', s).value || e.time, pct: pctTxt && pctTxt !== '100' ? +pctTxt : null };
      remoteOps.push({ op: 'edit', date: e.date, time: e.origTime || e.time, desc: e.full, vals }); store.set('remoteOps', remoteOps);
      Object.assign(e, { kcal: vals.calories, p: vals.protein_g, c: vals.carbs_g, f: vals.fat_g, meal: vals.meal, origTime: e.origTime || e.time, time: vals.time });
      store.set('remote', remote); scheduleSync(); closeSheet(); render(); toast('Saved');
    };
  });
}
function showRemote(e) {
  openSheet(`<h3>${esc(e.name)}</h3><div class="small" style="color:var(--accent);margin-top:2px">${e.other ? 'Logged in the app on another device' : 'Logged via Claude'}</div>
    ${e.full ? `<div class="small muted" style="margin-top:6px">${esc(e.full)}</div>` : ''}
    <div class="preview"><b>${r0(e.kcal)} kcal</b> · P ${r0(e.p)} g · C ${r0(e.c)} g · F ${r0(e.f)} g${e.caf ? ` · ☕ ${r0(e.caf)} mg` : ''}${e.alc ? ` · 🍺 ${r1(e.alc)}` : ''}</div>
    <div class="small muted" style="margin-top:8px">${esc(e.date)} ${esc(e.time)} · ${esc(e.meal)}${e.note ? ' · ' + esc(e.note) : ''}</div>
    <div class="small muted" style="margin-top:10px">${e.other ? 'To change or delete it, open the app on the device where you logged it.' : 'You can edit or delete it here, or ask Claude.'}</div>
    ${e.other ? '' : '<div class="btnrow"><button class="btn secondary" id="redit">Edit</button><button class="btn danger" id="rdel">Delete</button></div>'}
    <button class="btn secondary" id="dup">Log again now (in the app)</button>
    ${!e.other && !foods.some(f => f.name.toLowerCase() === e.name.toLowerCase()) ? '<button class="btn secondary" id="tolib">Save to My foods</button>' : ''}`, s => {
    const tl = $('#tolib', s); if (tl) tl.onclick = () => { foodFromLog(e); closeSheet(); };
    const re = $('#redit', s); if (re) re.onclick = () => editRemote(e);
    const rd = $('#rdel', s); if (rd) rd.onclick = () => {
      if (!confirm(`Delete “${e.name}” from your food log?`)) return;
      remoteOps.push({ op: 'del', date: e.date, time: e.origTime || e.time, desc: e.full }); store.set('remoteOps', remoteOps);
      remote = remote.filter(x => x !== e); store.set('remote', remote); scheduleSync(); closeSheet(); render(); toast('Deleted');
    };
    $('#dup', s).onclick = () => {
      const t = state.date === todayStr() ? nowTime() : e.time;
      entries.push({ id: uid(), date: state.date, time: t, meal: mealFor(t), foodId: null, name: e.name, qty: null, mode: 'serving', amount: '1 serving',
        kcal: e.kcal, p: e.p, c: e.c, f: e.f, caf: e.caf, alc: e.alc, exported: false, created: Date.now() });
      saveEntries(); closeSheet(); render(); toast('Logged again');
    };
  });
}

function editEntry(e) {
  const food = foods.find(f => f.id === e.foodId);
  openSheet(`<h3>${esc(e.name)}</h3><div class="muted small">${esc(e.amount)} · ${r0(e.kcal)} kcal · P ${r0(e.p)} · C ${r0(e.c)} · F ${r0(e.f)}</div>
    ${food && e.qty != null ? `<label>Amount (${e.mode === 'g' ? baseUnitLabel(food, 'g') : esc(food.servingLabel || 'servings')})</label>
      <input type="text" inputmode="decimal" id="q" value="${e.qty}">
      <label>Percent eaten</label><input type="text" inputmode="numeric" id="ep" value="${e.pct || 100}">` : ''}
    <div class="grid2"><div><label>Meal</label><select id="m">${MEALS.map(m => `<option ${m === e.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div><label>Time</label><input type="time" id="t" value="${esc(e.time)}"></div></div>
    <label>Date</label><input type="date" id="d" value="${esc(e.date)}">
    <label>Note</label><input type="text" id="n" value="${esc(e.note || '')}" placeholder="optional">
    <div class="btnrow"><button class="btn danger" id="del">Delete</button><button class="btn" id="sv">Save</button></div>
    <button class="btn secondary" id="dup">Log again now</button>`, s => {
    $('#del', s).onclick = () => {
      if (e.exported) { const d = store.get('deleted', []); d.push(e.id); store.set('deleted', d); }
      entries = entries.filter(x => x.id !== e.id); saveEntries(); closeSheet(); render(); toast('Deleted'); };
    $('#sv', s).onclick = () => {
      const qEl = $('#q', s);
      if (qEl && food) {
        const q = num(qEl.value); if (q <= 0) return toast('Enter an amount');
        const pc = Math.max(1, Math.min(100, num($('#ep', s).value) || 100));
        Object.assign(e, scale(calc(food, q, e.mode), pc / 100), { qty: q, pct: pc, amount: amountText(food, q, e.mode, pc) });
      }
      e.meal = $('#m', s).value; e.time = $('#t', s).value || e.time; e.date = $('#d', s).value || e.date;
      e.note = $('#n', s).value.trim(); e.exported = false; e.rev = (e.rev || 0) + 1;
      saveEntries(); closeSheet(); render(); toast('Saved');
    };
    $('#dup', s).onclick = () => {
      const t = state.date === todayStr() ? nowTime() : e.time;
      entries.push({ ...e, id: uid(), date: state.date, time: t, meal: mealFor(t), exported: false, created: Date.now() });
      saveEntries(); closeSheet(); render(); toast('Logged again');
    };
  });
}
function baseUnitLabel(food, mode) { return mode === 'g' ? (food.basis === '100' ? (food.unit || 'g') : 'g') : (food.servingLabel || 'servings'); }

// ---------- Add ----------
function matches(name, q) { const n = name.toLowerCase(); return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => n.includes(w)); }
function viewAdd() {
  $('#view').innerHTML = `<input type="search" id="s" placeholder="Search my foods…" value="${esc(state.q)}" autocomplete="off">
    <div class="chips"><button class="chip" id="scan">▦ Scan barcode</button><button class="chip" id="quick">⚡ Quick add</button><button class="chip" id="newf">＋ New food</button></div>
    <div id="res"></div>`;
  const s = $('#s');
  s.oninput = () => { state.q = s.value; listResults(); };
  $('#scan').onclick = scanBarcode;
  $('#quick').onclick = quickAdd;
  $('#newf').onclick = () => editFood(null, f => logFood(f));
  listResults();
}
function listResults() {
  const q = state.q.trim();
  let html = '';
  const row = f => `<button class="item" data-id="${f.id}"><div class="grow"><div class="name">${esc(f.name)}</div>
    <div class="small muted">${f.basis === '100' ? `${r0(f.kcal)} kcal / 100 ${esc(f.unit || 'g')}` : `${r0(f.kcal)} kcal / ${esc(f.servingLabel || 'serving')}`}</div></div><div class="muted">›</div></button>`;
  const mealRow = m => { const t = totals(m.items); return `<button class="item" data-meal="${m.id}"><div class="grow"><div class="name">🍽 ${esc(m.name)}</div>
    <div class="small muted">${m.items.length} item${m.items.length === 1 ? '' : 's'} · ${r0(t.kcal)} kcal · P ${r0(t.p)}</div></div><div class="muted">›</div></button>`; };
  if (q) {
    const mh = meals.filter(m => matches(m.name, q));
    if (mh.length) html += `<h2>Saved meals</h2><div class="list">${mh.map(mealRow).join('')}</div>`;
    const hits = foods.filter(f => matches(f.name, q)).sort((a, b) => (b.uses || 0) - (a.uses || 0));
    const logHits = logFoods().filter(e => matches(e.name + ' ' + e.amount, q)).slice(0, 8);
    if (hits.length) html += `<h2>Results</h2><div class="list">${hits.map(row).join('')}</div>`;
    if (logHits.length) html += `<h2>From your log</h2><div class="list">${logHits.map((e, i) => `<button class="item" data-log="${i}"><div class="grow"><div class="name">${esc(e.name)}</div>
      <div class="small muted">${r0(e.kcal)} kcal${e.amount ? ' · ' + esc(e.amount) : ''} · ${esc(shortDay(e.date, true))}</div></div><div class="muted">＋</div></button>`).join('')}</div>`;
    html += hits.length || logHits.length ? ''
      : mh.length ? '' : `<div class="list"><div class="empty">No match for “${esc(q)}”.<br><button class="btn" id="mk" style="max-width:240px;margin:12px auto 0">Create “${esc(q)}”</button></div></div>`;
  } else {
    if (meals.length) html += `<h2>Saved meals</h2><div class="list">${[...meals].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).map(mealRow).join('')}</div>`;
    const prev = addDays(state.date, -1);
    const yGroups = MEALS.map(m => ({ m, items: [...entries, ...remote].filter(e => e.date === prev && e.meal === m) })).filter(g => g.items.length);
    if (yGroups.length) html += `<h2>Copy from ${esc(dateLabel(prev).toLowerCase() === 'yesterday' ? 'yesterday' : dateLabel(prev))}</h2><div class="list">` +
      yGroups.map(g => `<button class="item" data-copy="${g.m}"><div class="grow"><div class="name">↻ ${cap(g.m)}</div>
        <div class="small muted">${esc(g.items.map(e => e.name).join(', '))}</div></div><div class="kcal">${r0(totals(g.items).kcal)}</div></button>`).join('') + '</div>';
    const recent = foods.filter(f => f.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 8);
    if (recent.length) html += `<h2>Recent</h2><div class="list">${recent.map(row).join('')}</div>`;
    html += `<h2>All foods</h2><div class="list">${[...foods].sort((a, b) => a.name.localeCompare(b.name)).map(row).join('')}</div>`;
  }
  $('#res').innerHTML = html;
  $('#res').querySelectorAll('.item[data-id]').forEach(b => b.onclick = () => logFood(foods.find(f => f.id === b.dataset.id)));
  $('#res').querySelectorAll('.item[data-meal]').forEach(b => b.onclick = () => logMeal(meals.find(m => m.id === b.dataset.meal)));
  $('#res').querySelectorAll('.item[data-copy]').forEach(b => b.onclick = () => {
    const prev = addDays(state.date, -1);
    const items = [...entries, ...remote].filter(e => e.date === prev && e.meal === b.dataset.copy).map(e => e.remote ? { ...e, amount: '1 serving' } : e);
    logMeal({ name: `${cap(b.dataset.copy)} from ${dateLabel(prev).toLowerCase()}`, items, keepTimes: true });
  });
  const mk = $('#mk'); if (mk) mk.onclick = () => editFood({ name: q }, f => logFood(f));
  if (q) { const lh = logFoods().filter(e => matches(e.name + ' ' + e.amount, q)).slice(0, 8);
    $('#res').querySelectorAll('.item[data-log]').forEach(b => b.onclick = () => logFood(foodFromLog(lh[+b.dataset.log]))); }
}
// Foods Claude logged (in food.csv) that aren't in My foods yet, newest first, one per name.
function logFoods() {
  const have = new Set(foods.map(f => f.name.toLowerCase())), seen = new Set();
  return remote.filter(e => !e.other).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    .filter(e => { const k = e.name.toLowerCase(); if (have.has(k) || seen.has(k)) return false; seen.add(k); return true; });
}
function foodFromLog(e) {
  const f = { id: uid(), name: e.name, basis: 'serving', servingLabel: e.amount || '1 serving', servingGrams: null,
    kcal: r1(e.kcal), p: r1(e.p), c: r1(e.c), f: r1(e.f), caf: r1(e.caf), alc: r1(e.alc), uses: 0, lastUsed: 0, fromLog: true };
  foods.push(f); saveFoods(); toast('Saved to My foods'); return f;
}

function logFood(food) {
  const canG = food.basis === '100' || !!food.servingGrams;
  const canServ = food.basis === 'serving' || !!food.servingGrams;
  let mode = food.lastMode && (food.lastMode === 'g' ? canG : canServ) ? food.lastMode : (food.basis === '100' ? 'g' : 'serving');
  const defQty = m => food.lastQty && food.lastMode === m ? food.lastQty : (m === 'g' ? (food.basis === '100' ? 100 : food.servingGrams) : 1);
  const t0 = state.date === todayStr() ? nowTime() : '12:00';
  openSheet(`<h3>${esc(food.name)}</h3>
    ${canG && canServ ? `<label>Measure by</label><div class="seg" id="seg">
      <button data-m="serving">${esc(food.servingLabel || 'serving')}</button><button data-m="g">${food.basis === '100' ? esc(food.unit || 'g') : 'g'}</button></div>` : ''}
    <label id="ql"></label><input type="text" inputmode="decimal" id="q">
    <div class="chips" id="qc"></div>
    <label>How much did you eat?</label>
    <div class="row"><div class="seg" id="pct" style="flex:1"><button data-p="25">25%</button><button data-p="50">50%</button><button data-p="75">75%</button><button data-p="100">All</button></div>
    <input type="text" inputmode="numeric" id="pcti" value="100" style="width:64px;text-align:center" aria-label="Percent eaten"><span class="muted">%</span></div>
    <div class="preview" id="pv"></div>
    <div class="grid2"><div><label>Meal</label><select id="m">${MEALS.map(m => `<option ${m === (state.addMeal || mealFor(t0)) ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div><label>Time</label><input type="time" id="t" value="${t0}"></div></div>
    <button class="btn" id="go">Add to ${esc(dateLabel(state.date).toLowerCase() === 'today' ? 'today' : dateLabel(state.date))}</button>
    <button class="btn secondary" id="ed">Edit this food</button>`, s => {
    const q = $('#q', s);
    const setMode = m => {
      mode = m; q.value = r1(defQty(m));
      s.querySelectorAll('#seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
      $('#ql', s).textContent = m === 'g' ? `Amount (${food.basis === '100' ? (food.unit || 'g') : 'g'})` : `Number of servings (${food.servingLabel || 'serving'})`;
      const chips = m === 'g' ? [50, 100, 150, 200, 250] : [0.5, 1, 1.5, 2, 3];
      $('#qc', s).innerHTML = chips.map(c => `<button class="chip" data-v="${c}">${c}</button>`).join('') +
        (food.packGrams && canG ? `<button class="chip" id="pack">Whole pack (${food.packGrams} ${food.basis === '100' ? (food.unit || 'g') : 'g'})</button>` : '');
      const pk = $('#pack', s); if (pk) pk.onclick = () => { if (mode !== 'g') setMode('g'); q.value = food.packGrams; upd(); };
      $('#qc', s).querySelectorAll('.chip[data-v]').forEach(c => c.onclick = () => { q.value = c.dataset.v; upd(); });
      upd();
    };
    let pct = 100;
    const setPct = v => { pct = Math.max(1, Math.min(100, Math.round(v) || 100)); $('#pcti', s).value = pct;
      s.querySelectorAll('#pct button').forEach(b => b.classList.toggle('on', +b.dataset.p === pct)); upd(); };
    s.querySelectorAll('#pct button').forEach(b => b.onclick = () => setPct(+b.dataset.p));
    $('#pcti', s).oninput = () => { const v = num($('#pcti', s).value); if (v > 0) { pct = Math.min(100, v); s.querySelectorAll('#pct button').forEach(b => b.classList.toggle('on', +b.dataset.p === pct)); upd(); } };
    const upd = () => {
      const n = scale(calc(food, num(q.value), mode), pct / 100);
      $('#pv', s).innerHTML = `<b>${r0(n.kcal)} kcal</b> · P ${r1(n.p)} g · C ${r1(n.c)} g · F ${r1(n.f)} g${n.caf ? ` · ☕ ${r0(n.caf)} mg` : ''}${n.alc ? ` · 🍺 ${r1(n.alc)}` : ''}`;
    };
    s.querySelectorAll('#seg button').forEach(b => b.onclick = () => setMode(b.dataset.m));
    q.oninput = upd;
    $('#t', s).onchange = () => { if (!state.addMeal) $('#m', s).value = mealFor($('#t', s).value || t0); };
    setMode(mode); setPct(100);
    $('#go', s).onclick = () => {
      const qty = num(q.value); if (qty <= 0) return toast('Enter an amount');
      const n = scale(calc(food, qty, mode), pct / 100); const time = $('#t', s).value || t0;
      entries.push({ id: uid(), date: state.date, time, meal: $('#m', s).value, foodId: food.id, name: food.name,
        qty, mode, pct, amount: amountText(food, qty, mode, pct), ...n, exported: false, created: Date.now() });
      Object.assign(food, { uses: (food.uses || 0) + 1, lastUsed: Date.now(), lastQty: qty, lastMode: mode });
      saveEntries(); saveFoods(false); closeSheet();
      state.q = ''; state.tab = 'today'; state.addMeal = null; render(); toast(`Added ${r0(n.kcal)} kcal`);
    };
    $('#ed', s).onclick = () => editFood(food, f => logFood(f));
  });
}

function quickAdd() {
  const t0 = state.date === todayStr() ? nowTime() : '12:00';
  openSheet(`<h3>Quick add</h3><div class="muted small">For restaurant meals or one-offs. Only calories are required.</div>
    <label>What was it?</label><input type="text" id="nm" placeholder="e.g. shawarma plate">
    <label>Amount / portion</label><input type="text" id="am" placeholder="e.g. 1 plate">
    <div class="grid2"><div><label>Calories</label><input type="text" inputmode="decimal" id="k"></div>
    <div><label>Protein g</label><input type="text" inputmode="decimal" id="p"></div>
    <div><label>Carbs g</label><input type="text" inputmode="decimal" id="c"></div>
    <div><label>Fat g</label><input type="text" inputmode="decimal" id="f"></div>
    <div><label>Caffeine mg</label><input type="text" inputmode="decimal" id="caf"></div>
    <div><label>Alcohol (drinks)</label><input type="text" inputmode="decimal" id="alc"></div></div>
    <div class="grid2"><div><label>Meal</label><select id="m">${MEALS.map(m => `<option ${m === (state.addMeal || mealFor(t0)) ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div><label>Time</label><input type="time" id="t" value="${t0}"></div></div>
    <label class="row" style="color:var(--ink);font-size:15px;margin-top:14px"><input type="checkbox" id="sv" style="width:20px;height:20px"> Save to My foods for next time</label>
    <button class="btn" id="go">Add</button>`, s => {
    $('#t', s).onchange = () => { if (!state.addMeal) $('#m', s).value = mealFor($('#t', s).value || t0); };
    $('#go', s).onclick = () => {
      const name = $('#nm', s).value.trim() || 'Quick add'; const k = num($('#k', s).value);
      if (k <= 0) return toast('Enter calories');
      const amt = $('#am', s).value.trim() || '1 serving';
      const n = { kcal: k, p: num($('#p', s).value), c: num($('#c', s).value), f: num($('#f', s).value), caf: num($('#caf', s).value), alc: num($('#alc', s).value) };
      let foodId = null;
      if ($('#sv', s).checked) {
        const f = { id: uid(), name, basis: 'serving', servingLabel: amt, servingGrams: null, ...n, uses: 1, lastUsed: Date.now(), lastQty: 1, lastMode: 'serving' };
        foods.push(f); saveFoods(); foodId = f.id;
      }
      const time = $('#t', s).value || t0;
      entries.push({ id: uid(), date: state.date, time, meal: $('#m', s).value, foodId, name, qty: foodId ? 1 : null, mode: 'serving',
        amount: amt, ...n, exported: false, created: Date.now() });
      saveEntries(); closeSheet(); state.tab = 'today'; state.addMeal = null; render(); toast(`Added ${r0(k)} kcal`);
    };
  });
}

// ---------- Supplements ----------
function suppCard() {
  if (!supps.length) return `<button class="linkbtn" id="suppedit" style="margin:0 4px 8px;font-size:14px">＋ Track daily vitamins / supplements</button>`;
  const taken = new Set(suppLog.filter(l => l.date === state.date).map(l => l.suppId));
  const n = supps.filter(x => taken.has(x.id)).length;
  return `<div class="card" style="padding:12px 14px"><div class="spread"><b>Supplements <span class="small muted" style="font-weight:400">${n}/${supps.length}</span></b><button class="linkbtn" id="suppedit">Edit</button></div>
    <div class="chips">${supps.map(x => `<button class="chip ${taken.has(x.id) ? 'on' : ''}" data-supp="${x.id}">${taken.has(x.id) ? '✓' : '○'} ${esc(x.name)}${x.dose ? ` <span class="muted">${esc(x.dose)}</span>` : ''}</button>`).join('')}</div></div>`;
}
function toggleSupp(id) {
  const x = supps.find(s => s.id === id); if (!x) return;
  const ex = suppLog.find(l => l.date === state.date && l.suppId === id);
  if (ex) { if (ex.exported) { const d = store.get('suppDeleted', []); d.push(ex.id); store.set('suppDeleted', d); } suppLog = suppLog.filter(l => l !== ex); }
  else suppLog.push({ id: uid(), date: state.date, time: state.date === todayStr() ? nowTime() : '09:00', suppId: id, name: x.name, dose: x.dose || '', exported: false });
  saveSuppLog(); render();
}
function editSupps() {
  const draw = s => {
    $('#sl', s).innerHTML = supps.length ? supps.map(x => `<div class="item"><div class="grow"><div class="name">${esc(x.name)}</div><div class="small muted">${esc(x.dose || '')}</div></div>
      <button class="linkbtn" data-del="${x.id}" style="color:var(--warn);font-size:14px">Remove</button></div>`).join('') : '<div class="empty">No supplements yet</div>';
    s.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { supps = supps.filter(x => x.id !== b.dataset.del); saveSupps(); draw(s); });
  };
  openSheet(`<h3>Daily supplements</h3><div class="muted small">Tick them off on the Today screen. Past days keep their history if you remove one.</div>
    <div class="list" id="sl" style="margin-top:12px"></div>
    <div class="grid2"><div><label>Name</label><input type="text" id="sn" placeholder="e.g. Vitamin D"></div>
    <div><label>Dose (optional)</label><input type="text" id="sd" placeholder="e.g. 1000 IU"></div></div>
    <button class="btn secondary" id="sa">＋ Add</button><button class="btn" id="sdone">Done</button>`, s => {
    draw(s);
    $('#sa', s).onclick = () => { const name = $('#sn', s).value.trim(); if (!name) return toast('Enter a name');
      supps.push({ id: uid(), name, dose: $('#sd', s).value.trim() }); saveSupps(); $('#sn', s).value = ''; $('#sd', s).value = ''; draw(s); };
    $('#sdone', s).onclick = () => { closeSheet(); render(); };
  });
}
async function syncSupps() {
  const pending = suppLog.filter(l => !l.exported), deleted = store.get('suppDeleted', []);
  if (!pending.length && !deleted.length) return;
  const ids = new Set([...pending.map(l => l.id), ...deleted]);
  const HEADER = 'date,time,name,dose,source,notes';
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = await gh('GET', null, settings.ghSuppPath);
    let text = HEADER + '\n', sha;
    if (g.ok) { const f = await g.json(); text = b64ToText(f.content || ''); sha = f.sha; }
    else if (g.status !== 404) throw new Error('supplements: GitHub error ' + g.status);
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length);
    const header = lines.shift() || HEADER;
    const kept = lines.filter(l => { const m = l.match(/app:([a-z0-9]+)/); return !(m && ids.has(m[1])); });
    const added = pending.map(l => [l.date, l.time, l.name, l.dose, 'app', 'app:' + l.id].map(csvCell).join(','));
    const out = [header, ...kept, ...added].sort((a, b) => a === header ? -1 : b === header ? 1 : a.localeCompare(b)).join('\n') + '\n';
    const p = await gh('PUT', { message: `Supplements: ${added.length} logged${deleted.length ? `, ${deleted.length} removed` : ''}`, content: textToB64(out), ...(sha ? { sha } : {}) }, settings.ghSuppPath);
    if (p.status === 409 || p.status === 422) continue;
    if (!p.ok) throw new Error('supplements: GitHub error ' + p.status);
    const sent = new Set(pending.map(l => l.id));
    suppLog.forEach(l => { if (sent.has(l.id)) l.exported = true; }); store.set('suppLog', suppLog);
    store.set('suppDeleted', store.get('suppDeleted', []).filter(id => !ids.has(id)));
    return;
  }
}


// ---------- Saved meals ----------
const ITEM_KEYS = ['foodId', 'name', 'qty', 'mode', 'amount', 'kcal', 'p', 'c', 'f', 'caf', 'alc'];
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k] ?? null]));
function saveAsMeal(items, slot, existing) {
  const def = existing ? existing.name : `${cap(slot)}: ${items.slice(0, 3).map(e => e.name.split(',')[0]).join(' + ')}`;
  openSheet(`<h3>${existing ? 'Rename meal' : 'Save as meal'}</h3>
    <div class="muted small">${items.length} item${items.length === 1 ? '' : 's'} · ${r0(totals(items).kcal)} kcal. Log them all in one tap from the Add tab.</div>
    <label>Meal name</label><input type="text" id="nm" value="${esc(def)}">
    <div class="list" style="margin-top:12px">${items.map(e => `<div class="item"><div class="grow"><div class="name">${esc(e.name)}</div><div class="small muted">${esc(e.amount)}</div></div><div class="kcal">${r0(e.kcal)}</div></div>`).join('')}</div>
    <button class="btn" id="sv">Save meal</button>`, s => {
    $('#sv', s).onclick = () => {
      const name = $('#nm', s).value.trim(); if (!name) return toast('Enter a name');
      if (existing) existing.name = name;
      else meals.push({ id: uid(), name, items: items.map(e => pick(e, ITEM_KEYS)), lastUsed: 0 });
      saveMeals(); closeSheet(); render(); toast('Meal saved');
    };
  });
}
function logMeal(meal) {
  const t0 = state.date === todayStr() ? nowTime() : '12:00';
  const tot = totals(meal.items);
  const slot0 = meal.keepTimes ? meal.items[0].meal : (state.addMeal || mealFor(t0));
  openSheet(`<h3>${esc(meal.name)}</h3><div class="muted small">Untick anything you didn't have this time.</div>
    <div class="list" style="margin-top:10px">${meal.items.map((e, i) => `<label class="item" style="margin:0;color:var(--ink);font-size:16px">
      <input type="checkbox" data-i="${i}" checked style="width:20px;height:20px"><div class="grow"><div class="name">${esc(e.name)}</div><div class="small muted">${esc(e.amount)}</div></div><div class="kcal">${r0(e.kcal)}</div></label>`).join('')}</div>
    <div class="preview" id="pv"></div>
    <div class="grid2"><div><label>Meal</label><select id="m">${MEALS.map(m => `<option ${m === slot0 ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div><label>Time</label><input type="time" id="t" value="${meal.keepTimes ? meal.items[0].time : t0}"></div></div>
    <button class="btn" id="go">Add to ${esc(dateLabel(state.date).toLowerCase() === 'today' ? 'today' : dateLabel(state.date))}</button>
    ${meal.id ? '<div class="btnrow"><button class="btn secondary" id="rn">Rename</button><button class="btn danger" id="dl">Delete meal</button></div>' : ''}`, s => {
    const chosen = () => [...s.querySelectorAll('input[data-i]')].filter(c => c.checked).map(c => meal.items[+c.dataset.i]);
    const upd = () => { const t = totals(chosen()); $('#pv', s).innerHTML = `<b>${r0(t.kcal)} kcal</b> · P ${r0(t.p)} g · C ${r0(t.c)} g · F ${r0(t.f)} g`; };
    s.querySelectorAll('input[data-i]').forEach(c => c.onchange = upd); upd();
    $('#t', s).onchange = () => { if (!state.addMeal) $('#m', s).value = mealFor($('#t', s).value || t0); };
    $('#go', s).onclick = () => {
      const items = chosen(); if (!items.length) return toast('Nothing selected');
      const time = $('#t', s).value || t0, slot = $('#m', s).value;
      for (const it of items) {
        entries.push({ ...pick(it, ITEM_KEYS), caf: it.caf || 0, alc: it.alc || 0, id: uid(), date: state.date, time, meal: slot, exported: false, created: Date.now() });
        const f = foods.find(x => x.id === it.foodId); if (f) Object.assign(f, { uses: (f.uses || 0) + 1, lastUsed: Date.now() });
      }
      if (meal.id) meal.lastUsed = Date.now(), store.set('meals', meals);
      saveEntries(); saveFoods(false); closeSheet(); state.q = ''; state.tab = 'today'; state.addMeal = null; render();
      toast(`Added ${items.length} item${items.length === 1 ? '' : 's'} · ${r0(totals(items).kcal)} kcal`);
    };
    const rn = $('#rn', s); if (rn) rn.onclick = () => saveAsMeal(meal.items, '', meal);
    const dl = $('#dl', s); if (dl) dl.onclick = () => {
      if (!confirm(`Delete saved meal “${meal.name}”? Logged entries stay.`)) return;
      meals = meals.filter(m => m.id !== meal.id); saveMeals(); closeSheet(); render(); toast('Meal deleted');
    };
  });
}

// ---------- Foods ----------
function viewFoods() {
  $('#view').innerHTML = `<input type="search" id="s" placeholder="Search…" value="${esc(state.fq)}" autocomplete="off">
    <button class="btn" id="newf">＋ New food</button><div id="fl"></div>`;
  const draw = () => {
    const list = foods.filter(f => !state.fq || matches(f.name, state.fq)).sort((a, b) => a.name.localeCompare(b.name));
    $('#fl').innerHTML = `<h2>${list.length} foods</h2><div class="list">` + (list.length ? list.map(f => `<button class="item" data-id="${f.id}">
      <div class="grow"><div class="name">${esc(f.name)}</div><div class="small muted">${f.basis === '100' ? `per 100 ${esc(f.unit || 'g')}` : `per ${esc(f.servingLabel || 'serving')}`}: ${r0(f.kcal)} kcal · P ${r1(f.p)} · C ${r1(f.c)} · F ${r1(f.f)}</div></div></button>`).join('')
      : '<div class="empty">No foods</div>') + '</div>';
    const ml = meals.filter(m => !state.fq || matches(m.name, state.fq));
    if (ml.length) $('#fl').insertAdjacentHTML('afterbegin', `<h2>${ml.length} saved meal${ml.length === 1 ? '' : 's'}</h2><div class="list">` + ml.map(m => `<button class="item" data-meal="${m.id}">
      <div class="grow"><div class="name">🍽 ${esc(m.name)}</div><div class="small muted">${m.items.length} items · ${r0(totals(m.items).kcal)} kcal</div></div></button>`).join('') + '</div>');
    $('#fl').querySelectorAll('.item[data-id]').forEach(b => b.onclick = () => editFood(foods.find(f => f.id === b.dataset.id), () => render()));
    $('#fl').querySelectorAll('.item[data-meal]').forEach(b => b.onclick = () => logMeal(meals.find(m => m.id === b.dataset.meal)));
  };
  $('#s').oninput = e => { state.fq = e.target.value; draw(); };
  $('#newf').onclick = () => editFood(null, () => render());
  draw();
}

function editFood(food, after) {
  const isNew = !food || !food.id;
  const f = Object.assign({ name: '', basis: 'serving', unit: 'g', servingLabel: '', servingGrams: null, kcal: '', p: '', c: '', f: '', caf: 0, alc: 0 }, food || {});
  let basis = f.basis;
  openSheet(`<h3>${isNew ? 'New food' : 'Edit food'}</h3>
    ${f.fromOFF ? '<div class="notice" style="margin-top:8px">Found in Open Food Facts. Check the numbers against the label, then save.</div>' : ''}
    ${f.barcode && !f.fromOFF && isNew ? '<div class="notice" style="margin-top:8px">Barcode not found. Type the values from the label; next scan will find it.</div>' : ''}
    ${f.barcode ? `<div class="small muted">Barcode ${esc(f.barcode)}</div>` : ''}
    <label>Name</label><input type="text" id="nm" value="${esc(f.name)}" placeholder="e.g. Greek yogurt 2%">
    <label>Nutrition values are given</label>
    <div class="seg" id="seg"><button data-b="serving">per serving</button><button data-b="100">per 100 g / ml</button></div>
    <div id="b100"><label>Unit</label><div class="seg" id="useg"><button data-u="g">grams</button><button data-u="ml">ml</button></div></div>
    <div class="grid2"><div><label>Serving name</label><input type="text" id="sl" value="${esc(f.servingLabel || '')}" placeholder="e.g. 1 bar"></div>
    <div><label>Serving weight (g/ml)</label><input type="text" inputmode="decimal" id="sg" value="${f.servingGrams ?? ''}" placeholder="optional"></div></div>
    <div class="small muted" id="hint" style="margin-top:4px"></div>
    <label>Package size (g/ml), optional</label><input type="text" inputmode="decimal" id="pk" value="${f.packGrams ?? ''}" placeholder="e.g. 650 for a 650 g tub">
    <div class="grid2"><div><label>Calories</label><input type="text" inputmode="decimal" id="k" value="${f.kcal}"></div>
    <div><label>Protein g</label><input type="text" inputmode="decimal" id="p" value="${f.p}"></div>
    <div><label>Carbs g</label><input type="text" inputmode="decimal" id="c" value="${f.c}"></div>
    <div><label>Fat g</label><input type="text" inputmode="decimal" id="fa" value="${f.f}"></div>
    <div><label>Caffeine mg</label><input type="text" inputmode="decimal" id="caf" value="${f.caf || ''}"></div>
    <div><label>Alcohol (drinks)</label><input type="text" inputmode="decimal" id="alc" value="${f.alc || ''}"></div></div>
    <button class="btn" id="sv">Save</button>
    ${isNew ? '' : '<button class="btn danger" id="del">Delete food</button>'}`, s => {
    let unit = f.unit || 'g';
    const setB = b => {
      basis = b;
      s.querySelectorAll('#seg button').forEach(x => x.classList.toggle('on', x.dataset.b === b));
      $('#b100', s).style.display = b === '100' ? '' : 'none';
      $('#hint', s).textContent = b === '100'
        ? 'Copy the “per 100 g” column from the label. Serving is optional, for quick “1 cup”-style logging.'
        : 'Copy the “per serving” values from the label. Add serving weight if you also want to log by grams.';
    };
    const setU = u => { unit = u; s.querySelectorAll('#useg button').forEach(x => x.classList.toggle('on', x.dataset.u === u)); };
    s.querySelectorAll('#seg button').forEach(x => x.onclick = () => setB(x.dataset.b));
    s.querySelectorAll('#useg button').forEach(x => x.onclick = () => setU(x.dataset.u));
    setB(basis); setU(unit);
    $('#sv', s).onclick = () => {
      const name = $('#nm', s).value.trim(); if (!name) return toast('Enter a name');
      const sg = num($('#sg', s).value);
      const data = { name, basis, unit, servingLabel: $('#sl', s).value.trim() || (basis === 'serving' ? '1 serving' : ''), servingGrams: sg > 0 ? sg : null,
        kcal: num($('#k', s).value), p: num($('#p', s).value), c: num($('#c', s).value), f: num($('#fa', s).value), caf: num($('#caf', s).value), alc: num($('#alc', s).value),
        barcode: f.barcode || null, packGrams: num($('#pk', s).value) > 0 ? num($('#pk', s).value) : null };
      if (data.kcal <= 0 && data.p + data.c + data.f <= 0 && !/water|bubly|diet|zero/i.test(name)) return toast('Enter calories');
      let saved;
      if (isNew) { saved = { id: uid(), uses: 0, lastUsed: 0, ...data }; foods.push(saved); }
      else { saved = foods.find(x => x.id === food.id); Object.assign(saved, data); if (saved.lastMode === 'g' && !(saved.basis === '100' || saved.servingGrams)) delete saved.lastMode; }
      saveFoods(); closeSheet(); toast('Food saved'); after && after(saved);
    };
    const d = $('#del', s);
    if (d) d.onclick = () => {
      if (!confirm(`Delete “${food.name}” from My foods? Logged entries stay.`)) return;
      foods = foods.filter(x => x.id !== food.id); saveFoods(); closeSheet(); render(); toast('Deleted');
    };
  });
}


// ---------- barcode ----------
let scanner = null;
function loadScanLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/html5-qrcode.min.js'; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); });
}
function stopScanner() {
  const s = scanner; scanner = null; if (!s) return Promise.resolve();
  return (async () => { try { if (s.isScanning) await s.stop(); s.clear(); } catch (e) { } })();
}
function scanBarcode() {
  openSheet(`<h3>Scan barcode</h3>
    <button class="btn" id="ph">📷 Take a photo of the barcode</button>
    <div class="small muted" style="margin-top:4px">Opens the iPhone camera. No permission pop-up.</div>
    <input type="file" accept="image/*" capture="environment" id="phf" hidden>
    <div id="reader" style="width:100%;min-height:0;border-radius:12px;overflow:hidden;background:#000;margin-top:8px"></div>
    <div class="small muted" id="sst" style="margin-top:6px"></div>
    <button class="btn secondary" id="lv">Use live scanner instead</button>
    <label>Or type the number under the barcode</label>
    <div class="row"><input type="text" inputmode="numeric" id="bc" placeholder="e.g. 0055577120101"><button class="btn" id="bcgo" style="width:auto;margin:0;padding:11px 18px">Go</button></div>`, async s => {
    let fired = false;
    const done = async code => { if (fired) return; fired = true; await stopScanner(); closeSheet(); handleBarcode(String(code)); };
    $('#bcgo', s).onclick = () => { const c = $('#bc', s).value.replace(/\D/g, ''); if (c.length < 6) return toast('Enter the barcode digits'); done(c); };
    let F, cfg;
    const ready = async () => { if (F) return true; try { await loadScanLib(); } catch (e) { $('#sst', s).textContent = 'Scanner not loaded. Type the number instead.'; return false; }
      F = Html5QrcodeSupportedFormats; cfg = { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E], verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } }; return true; };
    $('#ph', s).onclick = () => $('#phf', s).click();
    $('#phf', s).onchange = async ev => {
      const file = ev.target.files[0]; if (!file) return;
      await stopScanner(); $('#sst', s).textContent = 'Reading the barcode…';
      if (!(await ready())) return;
      try { const h = new Html5Qrcode('reader', cfg); const code = await h.scanFile(file, false); try { h.clear(); } catch (e) { } done(code); }
      catch (e) { $('#sst', s).textContent = 'No barcode found in that photo. Fill the frame with the barcode, hold steady, or type the number.'; }
    };
    const startLive = async () => {
      if (!(await ready()) || !document.getElementById('reader')) return;
      $('#reader', s).style.minHeight = '220px'; $('#sst', s).textContent = 'Starting camera…';
      try {
        scanner = new Html5Qrcode('reader', cfg);
        await scanner.start({ facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(w, h) * 0.45) }) },
          code => done(code), () => { });
        $('#sst', s).textContent = 'Point the camera at the barcode.';
      } catch (e) { $('#reader', s).style.minHeight = '0'; $('#sst', s).textContent = 'Camera not available. Use the photo button or type the number.'; }
    };
    $('#lv', s).onclick = startLive;
  });
}
const normCode = c => String(c).replace(/\D/g, '').replace(/^0+/, '');
async function lookupOFF(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity,product_quantity`, { cache: 'no-store' });
  if (!r.ok) return null;
  const j = await r.json(); const p = j.product;
  if (j.status !== 1 || !p) return null;
  const n = p.nutriments || {};
  const name = [String(p.brands || '').split(',')[0].trim(), (p.product_name_en || p.product_name || '').trim()].filter(Boolean).join(' ') || 'Scanned product';
  const sq = num(p.serving_quantity);
  const pq = num(p.product_quantity) || num(String(p.quantity || '').replace(/[^0-9.]/g, ''));
  const ml = /ml|l\b/i.test(String(p.quantity || '') + ' ' + String(p.serving_size || ''));
  let k100 = n['energy-kcal_100g']; if (k100 == null && n.energy_100g != null) k100 = n.energy_100g / 4.184;
  if (k100 != null) return { name, basis: '100', unit: ml ? 'ml' : 'g', servingLabel: p.serving_size || '', servingGrams: sq > 0 ? sq : null,
    kcal: r1(k100), p: r1(n.proteins_100g), c: r1(n.carbohydrates_100g), f: r1(n.fat_100g), barcode: code, fromOFF: true, packGrams: pq > 0 ? pq : null };
  let ks = n['energy-kcal_serving']; if (ks == null && n.energy_serving != null) ks = n.energy_serving / 4.184;
  if (ks != null) return { name, basis: 'serving', servingLabel: p.serving_size || '1 serving', servingGrams: sq > 0 ? sq : null,
    kcal: r1(ks), p: r1(n.proteins_serving), c: r1(n.carbohydrates_serving), f: r1(n.fat_serving), barcode: code, fromOFF: true, packGrams: pq > 0 ? pq : null };
  return { name, basis: '100', unit: ml ? 'ml' : 'g', servingLabel: p.serving_size || '', servingGrams: sq > 0 ? sq : null, barcode: code };
}
async function handleBarcode(code) {
  const known = foods.find(x => x.barcode && normCode(x.barcode) === normCode(code));
  if (known) return logFood(known);
  if (!navigator.onLine) { toast('Offline, so enter the label values'); return editFood({ barcode: code, basis: '100' }, f => logFood(f)); }
  toast('Looking up…');
  let info = null;
  try { info = await lookupOFF(code); if (!info && code.length === 12) info = await lookupOFF('0' + code); } catch (e) { }
  editFood(info || { barcode: code, basis: '100' }, f => logFood(f));
}
