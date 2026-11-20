'use strict';
/* Food log — offline calorie tracker. Data lives in this browser's localStorage.
   Export produces rows in the same format as data/food.csv in the garmin-health repo. */

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('fl.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fl.' + k, JSON.stringify(v)); return true; } catch (e) { toast('Could not save. Storage is blocked or full.'); return false; } }
};

// ---------- seed library (from food.csv, Nov 2026) ----------
// basis '100' = values per 100 g (or ml); basis 'serving' = values per one serving.
const SEED = [
  ['Egg, large', 'serving', '1 egg', 50, 72, 6.3, 0.4, 4.8],
  ['Cheese, semi-hard (cheddar/gouda)', '100', '1 slice', 20, 380, 25, 1.5, 30],
  ['Cooking oil or butter', '100', '1 tsp', 5, 850, 0, 0, 95],
  ['Onion', '100', '1/2 onion', 55, 40, 1.1, 9, 0.1],
  ['Chicken breast, cooked', '100', '', null, 165, 31, 0, 3.6],
  ['Lean ground lamb, cooked', '100', '', null, 250, 26, 0, 16],
  ['Spaghetti, cooked', '100', '1 cup', 140, 158, 5.8, 31, 0.9],
  ['White rice, cooked', '100', '1 cup', 160, 130, 2.7, 28, 0.3],
  ['Naan / flatbread', '100', '1 piece', 100, 290, 9, 50, 6],
  ['Banana, medium', 'serving', '1 banana', 120, 105, 1.3, 27, 0.4],
  ['Croissant, plain butter', 'serving', '1 croissant', 60, 240, 5, 27, 13],
  ['Latte, medium, 2% milk (2 shots)', 'serving', '1 cup (355 ml)', null, 180, 11, 17, 7, 130],
  ['Black tea with milk, large mug', 'serving', '1 mug (350 ml)', null, 30, 2, 3, 1, 55],
  ['Espresso shot', 'serving', '1 shot', null, 2, 0.1, 0, 0, 65],
  ['Milk, 2%', '100', '1 cup (250 ml)', 250, 50, 3.4, 4.8, 2],
  ['Apple juice, 100%', '100', '1 bottle (500 ml)', 500, 46, 0.1, 11.2, 0],
  ['bubly sparkling water', 'serving', '1 can (355 ml)', null, 0, 0, 0, 0],
  ['Beer, regular 5%', 'serving', '1 bottle (341 ml)', null, 145, 1.5, 13, 0, 0, 1],
  ['KitKat mini bar', 'serving', '1 mini bar', 12, 60, 0.7, 7.7, 3, 2],
  ['Nature Valley Crunchy, roasted almond', 'serving', '1 pouch (2 bars, 42 g)', 42, 190, 4, 29, 7],
  ['Kirkland Soft & Chewy granola bar, choc chip', 'serving', '1 bar (24 g)', 24, 100, 1, 17, 3],
  ['Sour cream, Gay Lea 14%', '100', '1 tbsp', 15, 180, 3, 4, 14],
  ['Activia berry yogurt 2.4%', '100', '3/4 cup', 175, 92, 3.8, 13, 2.4, 0, 0, 650],
  ['Plain yogurt', '100', '3/4 cup', 175, 70, 5, 6, 3],
  ['Pulmuone teriyaki stir-fry udon', 'serving', '1 pack', 220, 400, 8, 80, 7],
  ['Udon stir-fry with vegetables (home)', 'serving', '1 bowl (~300 g)', 300, 400, 10, 70, 8],
  ["Soup's On roasted red pepper & gouda soup", 'serving', '1 bowl (350 ml)', null, 200, 7, 18, 11],
  ['Chicken souvlaki box (half)', 'serving', 'half box', null, 425, 23, 48, 15],
].map(([name, basis, servingLabel, servingGrams, kcal, p, c, f, caf = 0, alc = 0, packGrams = null]) =>
  ({ name, basis, servingLabel, servingGrams, kcal, p, c, f, caf, alc, packGrams }));

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];

// ---------- state ----------
let foods = store.get('foods', null);
if (!foods) { foods = SEED.map(f => ({ ...f, id: uid(), uses: 0, lastUsed: 0 })); store.set('foods', foods); }
let entries = store.get('entries', []);
foods.forEach(f => { if (f.packGrams === undefined && /^Activia berry yogurt/.test(f.name)) f.packGrams = 650; });
let settings = Object.assign({ kcal: 2200, protein: 130, ghRepo: 'meircs/garmin-health', ghPath: 'data/food.csv', ghLibPath: 'data/food_library.json', ghSuppPath: 'data/supplements.csv', ghToken: '' }, store.get('settings', {}));
const state = { tab: 'today', date: todayStr(), q: '', fq: '' };

let meals = store.get('meals', []);
let supps = store.get('supps', []);       // [{id, name, dose}]
let suppLog = store.get('suppLog', []);   // [{id, date, time, suppId, name, dose, exported}]
const saveSupps = () => { store.set('supps', supps); bumpLib(); scheduleSync(); };
const saveSuppLog = () => { store.set('suppLog', suppLog); scheduleSync(); };
let remote = store.get('remote', []); // rows Claude logged in food.csv (read-only here)
// changed=true marks the library for backup; usage stats alone don't trigger a backup commit.
const saveFoods = (changed = true) => { store.set('foods', foods); if (changed) { bumpLib(); scheduleSync(); } };
const saveMeals = () => { store.set('meals', meals); bumpLib(); scheduleSync(); };
function bumpLib() { store.set('libRev', store.get('libRev', 0) + 1); store.set('libEdited', true); }
const libDirty = () => store.get('libRev', 0) !== store.get('libSynced', 0);
const saveEntries = () => { store.set('entries', entries); scheduleSync(); };
const saveSettings = () => store.set('settings', settings);

// ---------- helpers ----------
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function pad(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function nowTime() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; }
function dateLabel(s) {
  if (s === todayStr()) return 'Today';
  if (s === addDays(todayStr(), -1)) return 'Yesterday';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function mealFor(t) { const h = +t.slice(0, 2) + +t.slice(3) / 60; return h < 10.5 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : h < 21.5 ? 'dinner' : 'snack'; }
function r0(x) { return Math.round(x || 0); }
function r1(x) { return Math.round((x || 0) * 10) / 10; }
function num(v) { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function $(sel, root = document) { return root.querySelector(sel); }
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function baseUnit(f) { return f.basis === '100' ? (f.unit || 'g') : 'serving'; }

// Nutrition for `qty` of `food` in `mode` ('serving' | 'g').
function calc(food, qty, mode) {
  let factor;
  if (food.basis === '100') factor = mode === 'g' ? qty / 100 : qty * (food.servingGrams || 0) / 100;
  else factor = mode === 'g' ? (food.servingGrams ? qty / food.servingGrams : 0) : qty;
  return { kcal: food.kcal * factor, p: food.p * factor, c: food.c * factor, f: food.f * factor, caf: (food.caf || 0) * factor, alc: (food.alc || 0) * factor };
}
function scale(n, k) { return Object.fromEntries(Object.entries(n).map(([key, v]) => [key, v * k])); }
function amountText(food, qty, mode, pct = 100) {
  let t;
  if (mode === 'g') t = `${r1(qty)} ${food.basis === '100' ? (food.unit || 'g') : 'g'}`;
  else { const lbl = food.servingLabel || 'serving'; t = qty === 1 ? lbl : `${r1(qty)} × ${lbl.replace(/^1 /, '')}`; }
  return pct < 100 ? `${r0(pct)}% of ${t}` : t;
}
function totals(list) {
  return list.reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }), { kcal: 0, p: 0, c: 0, f: 0 });
}

// ---------- sheet ----------
function openSheet(html, mount) {
  closeSheet();
  const bd = document.createElement('div'); bd.className = 'backdrop'; bd.id = 'bd';
  bd.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div><button class="xbtn" id="xclose" aria-label="Close">✕</button>${html}</div>`;
  bd.addEventListener('click', e => { if (e.target === bd) closeSheet(); });
  bd.querySelector('#xclose').onclick = closeSheet;
  document.body.appendChild(bd);
  mount && mount(bd.firstElementChild);
}
function closeSheet() { stopScanner(); const b = $('#bd'); b && b.remove(); }

// ---------- chrome ----------
function renderHeader() {
  const h = $('#hdr');
  if (state.tab === 'today' || state.tab === 'add') {
    h.innerHTML = `<button class="iconbtn" id="prev" aria-label="Previous day">‹</button>
      <h1 id="dlabel">${state.tab === 'add' ? 'Add to ' : ''}${esc(dateLabel(state.date))}</h1>
      <button class="iconbtn" id="next" aria-label="Next day">›</button>`;
    $('#prev').onclick = () => { state.date = addDays(state.date, -1); render(); };
    $('#next').onclick = () => { state.date = addDays(state.date, 1); render(); };
    $('#dlabel').onclick = () => { state.date = todayStr(); render(); };
  } else {
    h.innerHTML = `${state.tab === 'foods' ? '<button class="iconbtn" id="back" aria-label="Back">‹</button>' : ''}<h1>${{ foods: 'My foods & meals', stats: 'Stats', health: 'Health', more: 'More' }[state.tab]}</h1>${state.tab === 'foods' ? '<span style="width:40px"></span>' : ''}`;
    const bk = $('#back'); if (bk) bk.onclick = () => { state.tab = 'more'; render(); };
  }
}
function renderTabs() {
  const pending = entries.filter(e => !e.exported).length;
  const tabs = [['today', '◐', 'Today'], ['add', '＋', 'Add'], ['stats', '▥', 'Stats'], ['health', '♡', 'Health'], ['more', '☰', 'More']];
  $('#tabs').innerHTML = tabs.map(([k, i, l]) =>
    `<button data-t="${k}" class="${state.tab === k || (k === 'more' && state.tab === 'foods') ? 'on' : ''}"><span>${i}</span>${l}${k === 'more' && pending ? `<i class="badge">${pending}</i>` : ''}</button>`).join('');
  $('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => { state.tab = b.dataset.t; render(); window.scrollTo(0, 0); });
}
function render() {
  renderHeader(); renderTabs();
  ({ today: viewToday, add: viewAdd, stats: viewStats, health: viewHealth, foods: viewFoods, more: viewMore })[state.tab]();
}

// ---------- Today ----------
function viewToday() {
  const day = [...entries, ...remote].filter(e => e.date === state.date).sort((a, b) => a.time.localeCompare(b.time));
  const t = totals(day);
  const left = settings.kcal - t.kcal;
  const pct = Math.min(100, settings.kcal ? t.kcal / settings.kcal * 100 : 0);
  const pPct = settings.protein ? Math.min(100, t.p / settings.protein * 100) : 0;
  let html = `<div class="card">
    <div class="spread"><div><div class="big">${r0(t.kcal)}</div><div class="muted small">of ${settings.kcal} kcal</div></div>
    <div style="text-align:right"><div style="font-size:22px;font-weight:650;color:${left < 0 ? 'var(--warn)' : 'var(--accent)'}">${r0(Math.abs(left))}</div>
    <div class="muted small">${left < 0 ? 'over' : 'left'}</div></div></div>
    <div class="bar ${left < 0 ? 'over' : ''}"><i style="width:${pct}%"></i></div>
    <div class="macros">
      <div class="macro"><span class="small muted"><i class="dot" style="background:var(--p)"></i>Protein</span><b>${r0(t.p)} g</b><span class="small muted">${r0(pPct)}% of ${settings.protein}</span></div>
      <div class="macro"><span class="small muted"><i class="dot" style="background:var(--c)"></i>Carbs</span><b>${r0(t.c)} g</b></div>
      <div class="macro"><span class="small muted"><i class="dot" style="background:var(--f)"></i>Fat</span><b>${r0(t.f)} g</b></div>
    </div></div>
    <div class="small muted" id="syncline" style="margin:-4px 4px 8px">${esc(syncStatus())}</div>
    ${suppCard()}`;
  if (!day.length) html += `<div class="list"><div class="empty">Nothing logged yet.<br><button class="btn" id="goadd" style="max-width:220px;margin:12px auto 0">Add food</button></div></div>`;
  for (const m of MEALS) {
    const items = day.filter(e => e.meal === m); if (!items.length) continue;
    html += `<h2><span class="spread"><span>${cap(m)} · ${r0(totals(items).kcal)} kcal</span><button class="linkbtn" data-save="${m}">Save as meal</button></span></h2><div class="list">` +
      items.map(e => `<button class="item" data-id="${e.id}"><div class="grow"><div class="name">${esc(e.name)}</div>
        <div class="small muted">${esc(e.time)}${e.amount ? ' · ' + esc(e.amount) : ''}${e.remote ? ` · <span style="color:var(--accent)">${e.other ? 'other device' : 'via Claude'}</span>` : ''}</div></div><div class="kcal">${r0(e.kcal)}</div></button>`).join('') + `</div>`;
  }
  if (day.length) html += `<button class="btn secondary" id="goadd" style="margin-top:16px">＋ Add food</button>`;
  $('#view').innerHTML = html;
  const g = $('#goadd'); if (g) g.onclick = () => { state.tab = 'add'; render(); };
  $('#view').querySelectorAll('[data-supp]').forEach(b => b.onclick = () => toggleSupp(b.dataset.supp));
  const se = $('#suppedit'); if (se) se.onclick = editSupps;
  $('#view').querySelectorAll('.item').forEach(b => b.onclick = () => { const e = day.find(x => x.id === b.dataset.id); e.remote ? showRemote(e) : editEntry(e); });
  $('#view').querySelectorAll('[data-save]').forEach(b => b.onclick = () => saveAsMeal(day.filter(e => e.meal === b.dataset.save), b.dataset.save));
}

function showRemote(e) {
  openSheet(`<h3>${esc(e.name)}</h3><div class="small" style="color:var(--accent);margin-top:2px">${e.other ? 'Logged in the app on another device' : 'Logged via Claude'}</div>
    ${e.full ? `<div class="small muted" style="margin-top:6px">${esc(e.full)}</div>` : ''}
    <div class="preview"><b>${r0(e.kcal)} kcal</b> · P ${r0(e.p)} g · C ${r0(e.c)} g · F ${r0(e.f)} g${e.caf ? ` · ☕ ${r0(e.caf)} mg` : ''}${e.alc ? ` · 🍺 ${r1(e.alc)}` : ''}</div>
    <div class="small muted" style="margin-top:8px">${esc(e.date)} ${esc(e.time)} · ${esc(e.meal)}${e.note ? ' · ' + esc(e.note) : ''}</div>
    <div class="small muted" style="margin-top:10px">${e.other ? 'To change or delete it, open the app on the device where you logged it.' : 'To change or delete this one, tell Claude. It updates here on the next sync.'}</div>
    <button class="btn secondary" id="dup">Log again now (in the app)</button>`, s => {
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
    html += hits.length ? `<h2>Results</h2><div class="list">${hits.map(row).join('')}</div>`
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
    <div class="grid2"><div><label>Meal</label><select id="m">${MEALS.map(m => `<option ${m === mealFor(t0) ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
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
    $('#t', s).onchange = () => { $('#m', s).value = mealFor($('#t', s).value || t0); };
    setMode(mode); setPct(100);
    $('#go', s).onclick = () => {
      const qty = num(q.value); if (qty <= 0) return toast('Enter an amount');
      const n = scale(calc(food, qty, mode), pct / 100); const time = $('#t', s).value || t0;
      entries.push({ id: uid(), date: state.date, time, meal: $('#m', s).value, foodId: food.id, name: food.name,
        qty, mode, pct, amount: amountText(food, qty, mode, pct), ...n, exported: false, created: Date.now() });
      Object.assign(food, { uses: (food.uses || 0) + 1, lastUsed: Date.now(), lastQty: qty, lastMode: mode });
      saveEntries(); saveFoods(false); closeSheet();
      state.q = ''; state.tab = 'today'; render(); toast(`Added ${r0(n.kcal)} kcal`);
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
    <div class="grid2"><div><label>Meal</label><select id="m">${MEALS.map(m => `<option ${m === mealFor(t0) ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div><label>Time</label><input type="time" id="t" value="${t0}"></div></div>
    <label class="row" style="color:var(--ink);font-size:15px;margin-top:14px"><input type="checkbox" id="sv" style="width:20px;height:20px"> Save to My foods for next time</label>
    <button class="btn" id="go">Add</button>`, s => {
    $('#t', s).onchange = () => { $('#m', s).value = mealFor($('#t', s).value || t0); };
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
      saveEntries(); closeSheet(); state.tab = 'today'; render(); toast(`Added ${r0(k)} kcal`);
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

// ---------- Stats ----------
let garmin = store.get('garmin', {});   // date -> {total, active}
let weights = store.get('weights', []); // [{date, kg}]
let health = store.get('health', {});   // date -> Garmin daily metrics
let acts = store.get('acts', []);       // workouts, newest first
async function pullGarmin(force) {
  if (!settings.ghToken || !navigator.onLine) return;
  if (!force && Date.now() - store.get('garminPulled', 0) < 10 * 60000) return;
  const dir = settings.ghPath.replace(/[^/]*$/, '');
  const read = async f => { const g = await gh('GET', null, dir + f); return g.ok ? parseCSV(b64ToText((await g.json()).content || '')) : null; };
  const [d, w, a] = await Promise.all([read('daily.csv'), read('weight.csv'), read('activities.csv')]);
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
      dur: num(r[ix('duration_min')]), km: num(r[ix('distance_km')]), hr: num(r[ix('avg_hr')]), kcal: num(r[ix('kcal')]), ate: num(r[ix('aerobic_te')]), load: num(r[ix('training_load')]) }))
      .sort((x, y) => (y.date + y.start).localeCompare(x.date + x.start));
    store.set('acts', acts); }
  if (w) { const h = w.shift(); const iD = h.indexOf('date'), iK = h.indexOf('weight_kg');
    const by = {}; w.forEach(r => { if (r[iD] && num(r[iK]) > 0) by[r[iD]] = num(r[iK]); });
    weights = Object.keys(by).sort().map(k => ({ date: k, kg: by[k] })); store.set('weights', weights); }
  store.set('garminPulled', Date.now());
  if (state.tab === 'stats') viewStats();
  if (state.tab === 'health') viewHealth();
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
  const n = state.range || 7;
  const days = Array.from({ length: n }, (_, i) => addDays(todayStr(), i - n + 1));
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
  let html = `<div class="seg" id="rng"><button data-r="7">7 days</button><button data-r="30">30 days</button></div>
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
  if (kT > 0) {
    const seg = [['Protein', kP, 'var(--p)', sumP], ['Carbs', kC, 'var(--c)', sumC], ['Fat', kF, 'var(--f)', sumF]];
    html += `<div class="card"><b>Where calories come from</b> <span class="small muted">· ${n}-day average</span>
      <div style="display:flex;gap:2px;height:16px;margin:12px 0 10px">${seg.map(([, k, c]) => `<div style="flex:${k};background:${c};border-radius:4px"></div>`).join('')}</div>
      <div class="macros" style="margin-top:0">${seg.map(([l, k, c, g]) => `<div class="macro"><span class="small muted"><i class="dot" style="background:${c}"></i>${l}</span><b>${r0(k / kT * 100)}%</b><span class="small muted">${r0(g / doneN)} g / day</span></div>`).join('')}</div></div>`;
  }
  if (supps.length) {
    html += `<div class="card"><b>Supplements</b> <span class="small muted">· days taken, last ${n} days</span>` + supps.map(x => {
      const k = days.filter(d => suppLog.some(l => l.date === d && l.suppId === x.id)).length;
      return `<div style="margin-top:10px"><div class="spread small"><span>${esc(x.name)}</span><span class="muted">${k}/${n} days · ${r0(k / n * 100)}%</span></div>
        <div class="bar" style="margin:4px 0 0"><i style="width:${k / n * 100}%;background:var(--p)"></i></div></div>`;
    }).join('') + `</div>`;
  }
  const wr = weights.filter(w => w.date >= addDays(todayStr(), -Math.max(n, 30) + 1));
  if (wr.length >= 2) {
    const ch = wr[wr.length - 1].kg - wr[0].kg;
    html += `<div class="card"><div class="spread"><b>Weight</b><span class="small muted">${ch > 0 ? '+' : ch < 0 ? '−' : '±'}${r1(Math.abs(ch))} kg since ${shortDay(wr[0].date, true)}</span></div>
      ${lineChart({ pts: wr.map(w => ({ date: w.date, v: w.kg })), color: 'var(--accent)' })}</div>`;
  } else if (wr.length === 1) html += `<div class="card"><b>Weight</b><div class="small muted" style="margin-top:4px">${r1(wr[0].kg)} kg on ${shortDay(wr[0].date, true)}. The chart appears after two weigh-ins.</div></div>`;
  const top = {}; all.filter(e => days.includes(e.date)).forEach(e => { const k = e.name; top[k] = top[k] || { k: 0, n: 0 }; top[k].k += e.kcal; top[k].n++; });
  const tl = Object.entries(top).sort((a, b) => b[1].k - a[1].k).slice(0, 5);
  if (tl.length) html += `<h2>Biggest calorie sources · ${n} days</h2><div class="list">${tl.map(([name, v]) => `<div class="item"><div class="grow"><div class="name">${esc(name)}</div><div class="small muted">${v.n}× · ${kT ? r0(v.k / Math.max(1, per.reduce((a, t) => a + t.kcal, 0)) * 100) : 0}% of calories</div></div><div class="kcal">${fmt(v.k)}</div></div>`).join('')}</div>`;
  html += `<div class="small muted" style="margin:14px 4px">Averages use full days you logged food (today is left out until it's over). Garmin calories update after the morning sync.</div>`;
  $('#view').innerHTML = html;
  $('#rng').querySelectorAll('button').forEach(b => { b.classList.toggle('on', +b.dataset.r === n); b.onclick = () => { state.range = +b.dataset.r; viewStats(); }; });
  const wire = (id, fn) => { const svg = $('#' + id); if (!svg) return; svg.querySelectorAll('.hit').forEach(h => h.onclick = () => {
    svg.querySelectorAll('.hit').forEach(x => x.setAttribute('fill', 'transparent')); h.setAttribute('fill', 'rgba(127,127,127,.12)'); $('#' + id + '-cap').innerHTML = fn(+h.dataset.i); }); };
  wire('kchart', i => `<b style="color:var(--ink)">${shortDay(days[i], true)}</b> · eaten ${per[i].kcal ? fmt(per[i].kcal) : '–'}${burned[i] != null ? ` · burned ${fmt(burned[i])} · ${per[i].kcal ? (per[i].kcal - burned[i] > 0 ? '+' : '−') + fmt(Math.abs(per[i].kcal - burned[i])) : ''}` : days[i] === todayStr() ? ' · today, in progress' : ''}`);
  wire('pchart', i => `<b style="color:var(--ink)">${shortDay(days[i], true)}</b> · ${per[i].p ? r0(per[i].p) + ' g protein' : 'nothing logged'}`);
  wire('wchart', i => `<b style="color:var(--ink)">${shortDay(wr[i].date, true)}</b> · ${r1(wr[i].kg)} kg`);
  pullGarmin(false);
}

// ---------- Health ----------
function hBuckets(r) {
  const days = Array.from({ length: r }, (_, i) => addDays(todayStr(), i - r + 1));
  const md = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  if (r <= 31) return days.map(d => ({ label: r <= 7 ? shortDay(d) : d.slice(8).replace(/^0/, ''), tip: shortDay(d, true), days: [d] }));
  if (r <= 120) { const b = []; for (let i = days.length % 7; i < days.length; i += 7) { const ds = days.slice(i, i + 7); b.push({ label: md(ds[0]), tip: `Week of ${md(ds[0])}`, days: ds }); } return b; }
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
  let html = `<div class="card">
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
  const weeks = Array.from({ length: nW }, (_, i) => { const end = addDays(todayStr(), -7 * (nW - 1 - i)); const ds = Array.from({ length: 7 }, (_, k) => addDays(end, k - 6));
    const [y, m, d] = ds[0].split('-').map(Number); const lab = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return { label: lab, tip: `Week ending ${shortDay(end, true)}`, days: ds }; });
  const imM = weeks.map(b => bSum(b, h => h.imMod)), imV = weeks.map(b => bSum(b, h => (h.imVig || 0) * 2));
  html += `<div class="card"><b>Intensity minutes</b> <span class="small muted">· per week, vigorous counts double</span>${leg([['Moderate', 'var(--sa)'], ['Vigorous ×2', 'var(--sd)'], ['150 min goal', 'var(--muted)', 'dash']])}
    ${hBars({ id: 'him', buckets: weeks, series: [{ name: 'Vigorous', color: 'var(--sd)', vals: imV }, { name: 'Moderate', color: 'var(--sa)', vals: imM }], target: 150 })}</div>`;
  const loads = weeks.map(b => { const v = acts.filter(a => b.days.includes(a.date)).reduce((s2, a) => s2 + a.load, 0); return v || null; });
  html += `<div class="card"><b>Training load</b> <span class="small muted">· per week, from workouts</span>${hBars({ id: 'hload', buckets: weeks, series: [{ name: 'Load', color: 'var(--f)', vals: loads }] })}</div>`;
  const icon = t => ({ running: '🏃', walking: '🚶', cycling: '🚴', strength_training: '🏋', swimming: '🏊', hiking: '🥾' }[t] || '•');
  if (wk.length) html += `<h2>Workouts · ${wk.length}</h2><div class="list">${wk.slice(0, 20).map(a => `<div class="item"><div style="width:24px;text-align:center">${icon(a.type)}</div><div class="grow">
      <div class="name">${esc(a.name || a.type)}</div><div class="small muted">${esc(shortDay(a.date, true))} ${esc(a.start)} · ${r0(a.dur)} min${a.km ? ` · ${r1(a.km)} km` : ''}${a.hr ? ` · ${r0(a.hr)} bpm` : ''}${a.ate ? ` · TE ${r1(a.ate)}` : ''}</div></div><div class="kcal">${r0(a.kcal)}</div></div>`).join('')}</div>
      ${wk.length > 20 ? `<div class="small muted" style="margin:6px 4px">Showing the latest 20.</div>` : ''}`;
  html += `<div class="small muted" style="margin:14px 4px">From your Garmin, synced to garmin-health each morning. Last night = the sleep that ended on ${esc(shortDay(last, true))}.</div>`;
  $('#view').innerHTML = html;
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
  const slot0 = meal.keepTimes ? meal.items[0].meal : mealFor(t0);
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
    $('#t', s).onchange = () => { $('#m', s).value = mealFor($('#t', s).value || t0); };
    $('#go', s).onclick = () => {
      const items = chosen(); if (!items.length) return toast('Nothing selected');
      const time = $('#t', s).value || t0, slot = $('#m', s).value;
      for (const it of items) {
        entries.push({ ...pick(it, ITEM_KEYS), caf: it.caf || 0, alc: it.alc || 0, id: uid(), date: state.date, time, meal: slot, exported: false, created: Date.now() });
        const f = foods.find(x => x.id === it.foodId); if (f) Object.assign(f, { uses: (f.uses || 0) + 1, lastUsed: Date.now() });
      }
      if (meal.id) meal.lastUsed = Date.now(), store.set('meals', meals);
      saveEntries(); saveFoods(false); closeSheet(); state.q = ''; state.tab = 'today'; render();
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

// ---------- Export / settings ----------
const CSV_HEADER = 'date,time,meal,description,calories,protein_g,carbs_g,fat_g,caffeine_mg,alcohol_drinks,source,notes';
function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function toCSV(list) {
  return [CSV_HEADER, ...[...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(e => [
    e.date, e.time, e.meal, `${e.name}, ${e.amount}`, r0(e.kcal), r0(e.p), r0(e.c), r0(e.f), r0(e.caf), r1(e.alc), 'app',
    ['app:' + e.id, e.note].filter(Boolean).join(' ')
  ].map(v => String(v ?? '').replace(/\s*[\r\n]+\s*/g, ' ')).map(csvCell).join(','))].join('\n') + '\n';
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
    <div id="reader" style="width:100%;min-height:220px;border-radius:12px;overflow:hidden;background:#000;margin-top:8px"></div>
    <div class="small muted" id="sst" style="margin-top:6px">Starting camera…</div>
    <button class="btn secondary" id="ph">Take a photo of the barcode instead</button>
    <input type="file" accept="image/*" capture="environment" id="phf" hidden>
    <label>Or type the number under the barcode</label>
    <div class="row"><input type="text" inputmode="numeric" id="bc" placeholder="e.g. 0055577120101"><button class="btn" id="bcgo" style="width:auto;margin:0;padding:11px 18px">Go</button></div>`, async s => {
    let fired = false;
    const done = async code => { if (fired) return; fired = true; await stopScanner(); closeSheet(); handleBarcode(String(code)); };
    $('#bcgo', s).onclick = () => { const c = $('#bc', s).value.replace(/\D/g, ''); if (c.length < 6) return toast('Enter the barcode digits'); done(c); };
    try { await loadScanLib(); } catch (e) { $('#sst', s).textContent = 'Scanner not loaded. Type the number instead.'; return; }
    if (!document.getElementById('reader')) return; // sheet closed while loading
    const F = Html5QrcodeSupportedFormats;
    const cfg = { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E], verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } };
    $('#ph', s).onclick = () => $('#phf', s).click();
    $('#phf', s).onchange = async ev => {
      const file = ev.target.files[0]; if (!file) return;
      await stopScanner();
      try { const h = new Html5Qrcode('reader', cfg); const code = await h.scanFile(file, false); try { h.clear(); } catch (e) { } done(code); }
      catch (e) { $('#sst', s).textContent = 'No barcode found in that photo. Try closer, or type the number.'; }
    };
    try {
      scanner = new Html5Qrcode('reader', cfg);
      await scanner.start({ facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(Math.min(w, h) * 0.45) }) },
        code => done(code), () => { });
      $('#sst', s).textContent = 'Point the camera at the barcode.';
    } catch (e) {
      $('#sst', s).textContent = 'Camera not available. Allow camera access in Settings, or use a photo / type the number.';
    }
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

// ---------- GitHub sync ----------
async function sync(manual) {
  if (!settings.ghToken) { if (manual) toast('Add your GitHub token first'); return; }
  if (syncing) return;
  const suppWork = suppLog.some(l => !l.exported) || store.get('suppDeleted', []).length;
  const work = entries.some(e => !e.exported) || store.get('deleted', []).length || libDirty() || suppWork;
  await syncEntries(manual);
  if (navigator.onLine && (manual || Date.now() - store.get('remotePulled', 0) > 60000)) { try { await pullRemote(); } catch (e) { store.set('syncError', 'could not reach GitHub: ' + e.message); } }
  { const l = $('#syncline'); if (l) l.textContent = syncStatus(); if (state.tab === 'more') render(); }
  if (suppWork && navigator.onLine) { syncing = true; try { await syncSupps(); } catch (e) { store.set('syncError', e.message); } finally { syncing = false; } }
  if (!work) { if (manual) toast(store.get('syncError', '') ? 'Sync problem: ' + store.get('syncError', '') : 'Up to date ✓'); return; }
  if (!navigator.onLine || !libDirty()) return;
  syncing = true;
  try { await syncLibrary(); if (manual) toast('Library backed up'); }
  catch (e) { store.set('syncError', 'library: ' + (e.message === 'Failed to fetch' ? 'no connection' : e.message)); if (manual) toast('Library backup failed'); }
  finally { syncing = false; const l = $('#syncline'); if (l) l.textContent = syncStatus(); if (state.tab === 'more') render(); }
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// Turn a long logged description into a short title plus detail line.
function prettyName(desc) {
  const full = String(desc || '').trim();
  let main = full, detail = '';
  let cut = -1, depth = 0;
  for (let i = 0; i < full.length - 1; i++) {
    const ch = full[i];
    if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (!depth && (ch === ',' || ch === ':') && full[i + 1] === ' ') { cut = i; break; }
  }
  if (cut > 0) { main = full.slice(0, cut); detail = full.slice(cut + 2); }
  const strip = t => t.replace(/\([^)]*\)/g, '').replace(/~?\s?\d+(\.\d+)?\s?(g|ml|kg|oz)\b\s*(of\s)?/gi, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim();
  let title = strip(main) || strip(full) || 'Logged via Claude';
  title = title.charAt(0).toUpperCase() + title.slice(1);
  const qty = (main.match(/\(([^)]*)\)/) || [])[1];
  detail = [qty, detail].filter(Boolean).join(', ').replace(/\s{2,}/g, ' ').trim();
  return { title, detail };
}
async function pullRemote() {
  const g = await gh('GET');
  if (!g.ok) { store.set('syncError', g.status === 401 ? 'GitHub token rejected (401)' : g.status === 403 ? 'token has no access to this repo (403)' : g.status === 404 ? 'repo or file not found: give the token access to garmin-health (404)' : 'GitHub error ' + g.status); return; }
  store.set('syncError', '');
  const rows = parseCSV(b64ToText((await g.json()).content || ''));
  const head = rows.shift() || []; const ix = k => head.indexOf(k);
  const since = addDays(todayStr(), -60);
  const mine = new Set([...entries.map(e => e.id), ...store.get('deleted', [])]);
  const appId = r => ((r[ix('notes')] || '').match(/app:([a-z0-9]+)/) || [])[1];
  remote = rows.filter(r => r.length >= head.length - 1 && r[ix('date')] >= since && !(appId(r) && mine.has(appId(r))))
    .map((r, i) => ({ id: 'r' + i + '-' + r[ix('date')] + r[ix('time')], remote: true, other: !!appId(r), date: r[ix('date')], time: r[ix('time')] || '12:00',
      meal: MEALS.includes(r[ix('meal')]) ? r[ix('meal')] : 'snack', name: prettyName(r[ix('description')]).title, amount: prettyName(r[ix('description')]).detail, full: r[ix('description')] || '',
      kcal: num(r[ix('calories')]), p: num(r[ix('protein_g')]), c: num(r[ix('carbs_g')]), f: num(r[ix('fat_g')]),
      caf: num(r[ix('caffeine_mg')]), alc: num(r[ix('alcohol_drinks')]), note: r[ix('notes')] || '' }));
  store.set('remote', remote); store.set('remotePulled', Date.now());
  if (state.tab === 'today') render();
}

async function syncLibrary() {
  const rev = store.get('libRev', 0);
  const body = JSON.stringify({ app: 'food-log', v: 2, updated: new Date().toISOString(), foods, meals, supps }, null, 1) + '\n';
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = await gh('GET', null, settings.ghLibPath);
    if (g.status === 401 || g.status === 403) throw new Error('token rejected');
    let sha; if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error('GitHub error ' + g.status);
    const p = await gh('PUT', { message: `Food app: library backup (${foods.length} foods, ${meals.length} meals)`, content: textToB64(body), ...(sha ? { sha } : {}) }, settings.ghLibPath);
    if (p.status === 409 || p.status === 422) continue;
    if (!p.ok) throw new Error('GitHub error ' + p.status);
    store.set('libSynced', rev); return true;
  }
  throw new Error('file kept changing');
}
async function loadLibraryFromRepo(ask) {
  const g = await gh('GET', null, settings.ghLibPath);
  if (g.status === 404) { if (ask) toast('No library backup in the repo yet'); return false; }
  if (!g.ok) { if (ask) toast('Could not read library backup'); return false; }
  const d = JSON.parse(b64ToText((await g.json()).content || ''));
  if (!Array.isArray(d.foods)) { if (ask) toast('Library file looks wrong'); return false; }
  if (ask && !confirm(`Replace this phone's library with the repo backup (${d.foods.length} foods, ${(d.meals || []).length} meals)?`)) return false;
  foods = d.foods; meals = d.meals || []; if (Array.isArray(d.supps) && !supps.length) { supps = d.supps; store.set('supps', supps); }
  store.set('foods', foods); store.set('meals', meals);
  store.set('libRev', 0); store.set('libSynced', 0); store.set('libEdited', false);
  render(); toast(`Library loaded: ${foods.length} foods, ${meals.length} meals`); return true;
}
let syncTimer = null, syncing = false;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), 1500); }
function syncStatus() {
  const pending = entries.filter(e => !e.exported).length;
  if (!settings.ghToken) return pending ? `${pending} not exported · auto-sync is off (set it up in Export)` : '';
  const last = store.get('lastSync', 0);
  const err = store.get('syncError', '');
  if (err) return `⚠ ${pending ? pending + ' waiting · ' : ''}${err}`;
  if (pending) return `${pending} waiting to sync${navigator.onLine ? '' : ' · offline'}`;
  return last ? `✓ Synced ${new Date(last).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
}
function b64ToText(b) { const bin = atob(b.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))); }
function textToB64(t) { const by = new TextEncoder().encode(t); let bin = ''; for (let i = 0; i < by.length; i += 0x8000) bin += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); return btoa(bin); }
async function gh(method, body, path = settings.ghPath) {
  const url = `https://api.github.com/repos/${settings.ghRepo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  return fetch(url, { method, cache: 'no-store', headers: { Authorization: `Bearer ${settings.ghToken}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function syncEntries(manual) {
  const pending = entries.filter(e => !e.exported);
  const deleted = store.get('deleted', []);
  const refresh = () => { const l = $('#syncline'); if (l) l.textContent = syncStatus(); renderTabs(); };
  if (!settings.ghToken) { if (manual) toast('Add your GitHub token first'); return; }
  if (!pending.length && !deleted.length) return;
  if (!navigator.onLine) { if (manual) toast('Offline. Will sync when back online.'); refresh(); return; }
  if (syncing) return; syncing = true;
  const ids = new Set([...pending.map(e => e.id), ...deleted]);
  const revs = new Map(pending.map(e => [e.id, e.rev || 0]));
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const g = await gh('GET');
      if (g.status === 401 || g.status === 403) throw new Error('GitHub token rejected');
      if (g.status === 404) throw new Error('Repo or file not found');
      if (!g.ok) throw new Error('GitHub error ' + g.status);
      const file = await g.json();
      let text = b64ToText(file.content || '');
      const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length);
      const header = lines.shift() || CSV_HEADER;
      const kept = lines.filter(l => { const m = l.match(/app:([a-z0-9]+)/); return !(m && ids.has(m[1])); });
      const added = pending.length ? toCSV(pending).trim().split('\n').slice(1) : [];
      const out = [header, ...kept, ...added].join('\n') + '\n';
      const p = await gh('PUT', { message: `Food app: ${added.length} entr${added.length === 1 ? 'y' : 'ies'}${deleted.length ? `, ${deleted.length} removed` : ''}`, content: textToB64(out), sha: file.sha });
      if (p.status === 409 || p.status === 422) continue; // file changed meanwhile; retry
      if (!p.ok) throw new Error('GitHub error ' + p.status);
      entries.forEach(e => { if (revs.has(e.id) && revs.get(e.id) === (e.rev || 0)) e.exported = true; });
      store.set('entries', entries);
      store.set('deleted', store.get('deleted', []).filter(id => !ids.has(id)));
      store.set('lastSync', Date.now()); store.set('lastExport', Date.now()); store.set('syncError', '');
      if (manual) toast(`Synced ${added.length} ${added.length === 1 ? 'entry' : 'entries'}`);
      return;
    }
    throw new Error('File kept changing; try again');
  } catch (e) {
    store.set('syncError', e.message === 'Failed to fetch' ? 'no connection' : e.message);
    if (manual) toast('Sync failed: ' + store.get('syncError', ''));
  } finally { syncing = false; refresh(); if (state.tab === 'more') render(); }
}
async function shareFile(text, name, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
function viewMore() {
  const pending = entries.filter(e => !e.exported);
  const lastExp = store.get('lastExport', 0);
  const days = lastExp ? Math.floor((Date.now() - lastExp) / 864e5) : null;
  $('#view').innerHTML = `
    <button class="item card" id="gofoods" style="border:1px solid var(--line);border-radius:var(--r);margin-bottom:12px"><div class="grow"><b>My foods &amp; saved meals</b><div class="small muted">${foods.length} foods · ${meals.length} meals · edit, add, delete</div></div><div class="muted">›</div></button>
    ${!settings.ghToken && pending.length && (days === null || days >= 7) ? `<div class="notice">Your entries are stored only on this phone. ${days === null ? 'You haven’t exported yet.' : `Last export was ${days} days ago.`} Export at least once a week.</div>` : ''}
    <div class="card"><b>Auto-sync to your health repo</b>
      <div class="muted small" style="margin-top:4px">${settings.ghToken
        ? `On. New entries go to <b>${esc(settings.ghRepo)}/${esc(settings.ghPath)}</b> by themselves whenever you're online, and your foods and saved meals are backed up to <b>${esc(settings.ghLibPath)}</b>.`
        : 'Off. Paste a GitHub token (repo contents: read and write) to send entries to your health log automatically.'}</div>
      <div class="small" style="margin-top:6px">${esc(syncStatus() || 'Nothing waiting')}</div>
      <label>GitHub token</label><input type="text" id="gt" value="${esc(settings.ghToken)}" placeholder="github_pat_…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="-webkit-text-security:disc">
      ${settings.ghToken ? `<div class="small muted" style="margin-top:4px">Saved: ${esc(settings.ghToken.slice(0, 15))}… (${settings.ghToken.length} characters)</div>` : ''}
      <div class="grid2"><div><label>Repo</label><input type="text" id="gr" value="${esc(settings.ghRepo)}" autocapitalize="off"></div>
      <div><label>File</label><input type="text" id="gp" value="${esc(settings.ghPath)}" autocapitalize="off"></div></div>
      <div class="btnrow"><button class="btn secondary" id="gsave">Save &amp; test</button><button class="btn" id="gsync" ${settings.ghToken ? '' : 'disabled'}>Sync now</button></div>
    </div>
    <div class="card"><b>Manual export</b>
      <div class="muted small" style="margin-top:4px">If auto-sync is off: share the file to the <b>Google Drive → Food log</b> folder, and Claude adds it to your health log.</div>
      <button class="btn" id="exn" ${pending.length ? '' : 'disabled'}>Share ${pending.length} new ${pending.length === 1 ? 'entry' : 'entries'}</button>
      <button class="btn secondary" id="cpy" ${pending.length ? '' : 'disabled'}>Copy new entries as text</button>
      <div class="small muted" style="margin-top:8px">${lastExp ? `Last export: ${new Date(lastExp).toLocaleString()}` : 'Not exported yet'} · ${entries.length} entries total</div>
    </div>
    <div class="card"><b>Daily targets</b>
      <div class="grid2"><div><label>Calories</label><input type="text" inputmode="numeric" id="tk" value="${settings.kcal}"></div>
      <div><label>Protein g</label><input type="text" inputmode="numeric" id="tp" value="${settings.protein}"></div></div>
      <button class="btn secondary" id="svt">Save targets</button></div>
    <div class="card"><b>Backup</b>
      <div class="muted small" style="margin-top:4px">Full copy of foods, entries and settings. Use it to move to a new phone.</div>
      <button class="btn secondary" id="bk">Save backup file</button>
      <button class="btn secondary" id="rs">Restore from backup</button>
      <input type="file" id="rf" accept=".json,application/json" hidden>
      ${settings.ghToken ? '<button class="btn secondary" id="lrl">Restore food library from repo</button>' : ''}
      <button class="btn secondary" id="exa">Share all entries (CSV)</button>
      <button class="btn secondary" id="unx">Mark all entries as not exported</button>
    </div>
    <div class="small muted" style="text-align:center;margin-top:8px">Food log v14 · works offline</div>`;
  $('#gofoods').onclick = () => { state.tab = 'foods'; render(); window.scrollTo(0, 0); };
  const markDone = () => { pending.forEach(e => e.exported = true); saveEntries(); store.set('lastExport', Date.now()); render(); };
  $('#exn').onclick = async () => {
    const ok = await shareFile(toCSV(pending), `food-${todayStr()}-${nowTime().replace(':', '')}.csv`, 'text/csv');
    if (ok) { markDone(); toast('Exported'); }
  };
  $('#cpy').onclick = async () => {
    try { await navigator.clipboard.writeText(toCSV(pending)); } catch (e) { return toast('Copy failed'); }
    if (confirm('Copied. Mark these entries as exported?')) { markDone(); toast('Marked as exported'); }
  };
  $('#gsave').onclick = async () => {
    settings.ghToken = $('#gt').value.replace(/\s+/g, '');
    if (settings.ghToken && !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(settings.ghToken)) { toast(`That doesn't look like a GitHub token (starts “${settings.ghToken.slice(0, 6)}”, ${settings.ghToken.length} chars). Copy it again.`); return; } settings.ghRepo = $('#gr').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
    settings.ghPath = $('#gp').value.trim().replace(/^\//, ''); saveSettings();
    if (!settings.ghToken) { store.set('syncError', ''); render(); return toast('Auto-sync turned off'); }
    if (!navigator.onLine) { render(); return toast('Saved. Will test when online.'); }
    try {
      const g = await gh('GET');
      if (g.ok) { const f = await g.json(); const rows = b64ToText(f.content || '').trim().split('\n').length - 1; store.set('syncError', ''); toast(`Connected ✓ (${rows} rows in file)`); if (store.get('libEdited', false) || !(await loadLibraryFromRepo(false).catch(() => false))) bumpLib(); render(); sync(false); }
      else { store.set('syncError', g.status === 404 ? 'repo or file not found' : 'token rejected'); toast(g.status === 404 ? 'Repo or file not found (check token access)' : 'Token rejected'); render(); }
    } catch (e) { toast('Could not reach GitHub'); }
  };
  $('#gsync').onclick = () => sync(true);
  const lrl = $('#lrl'); if (lrl) lrl.onclick = () => loadLibraryFromRepo(true).catch(() => toast('Could not reach GitHub'));
  $('#exa').onclick = () => shareFile(toCSV(entries), `food-all-${todayStr()}.csv`, 'text/csv');
  $('#unx').onclick = () => { if (confirm('Mark every entry as not exported? They will be included in the next export.')) { entries.forEach(e => e.exported = false); saveEntries(); render(); } };
  $('#svt').onclick = () => { settings.kcal = r0(num($('#tk').value)) || settings.kcal; settings.protein = r0(num($('#tp').value)) || settings.protein; saveSettings(); toast('Targets saved'); };
  $('#bk').onclick = () => shareFile(JSON.stringify({ app: 'food-log', v: 2, at: new Date().toISOString(), foods, meals, entries, settings: { ...settings, ghToken: '' } }, null, 1), `food-backup-${todayStr()}.json`, 'application/json');
  $('#rs').onclick = () => $('#rf').click();
  $('#rf').onchange = async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'food-log' || !Array.isArray(d.foods) || !Array.isArray(d.entries)) throw new Error('bad');
      if (!confirm(`Replace everything on this phone with the backup (${d.foods.length} foods, ${d.entries.length} entries)?`)) return;
      foods = d.foods; entries = d.entries; meals = d.meals || meals; const tok = settings.ghToken; settings = Object.assign(settings, d.settings || {}); settings.ghToken = settings.ghToken || tok; store.set('meals', meals);
      saveFoods(); saveEntries(); saveSettings(); render(); toast('Backup restored');
    } catch (e) { toast('That file is not a Food log backup'); }
  };
}

// ---------- boot ----------
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.tab === 'today' && state.date !== todayStr() && state.lastSeenToday === state.date) { state.date = todayStr(); render(); }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(); });
window.addEventListener('online', () => scheduleSync());
setInterval(() => { if (document.visibilityState === 'visible') sync(false); }, 60000);
state.lastSeenToday = state.date;
render();
scheduleSync();
