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
  ['Activia berry yogurt 2.4%', '100', '3/4 cup', 175, 92, 3.8, 13, 2.4],
  ['Plain yogurt', '100', '3/4 cup', 175, 70, 5, 6, 3],
  ['Pulmuone teriyaki stir-fry udon', 'serving', '1 pack', 220, 400, 8, 80, 7],
  ['Udon stir-fry with vegetables (home)', 'serving', '1 bowl (~300 g)', 300, 400, 10, 70, 8],
  ["Soup's On roasted red pepper & gouda soup", 'serving', '1 bowl (350 ml)', null, 200, 7, 18, 11],
  ['Chicken souvlaki box (half)', 'serving', 'half box', null, 425, 23, 48, 15],
].map(([name, basis, servingLabel, servingGrams, kcal, p, c, f, caf = 0, alc = 0]) =>
  ({ name, basis, servingLabel, servingGrams, kcal, p, c, f, caf, alc }));

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];

// ---------- state ----------
let foods = store.get('foods', null);
if (!foods) { foods = SEED.map(f => ({ ...f, id: uid(), uses: 0, lastUsed: 0 })); store.set('foods', foods); }
let entries = store.get('entries', []);
let settings = Object.assign({ kcal: 2200, protein: 130, ghRepo: 'meircs/garmin-health', ghPath: 'data/food.csv', ghToken: '' }, store.get('settings', {}));
const state = { tab: 'today', date: todayStr(), q: '', fq: '' };

const saveFoods = () => store.set('foods', foods);
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
function amountText(food, qty, mode) {
  if (mode === 'g') return `${r1(qty)} ${food.basis === '100' ? (food.unit || 'g') : 'g'}`;
  const lbl = food.servingLabel || 'serving';
  return qty === 1 ? lbl : `${r1(qty)} × ${lbl.replace(/^1 /, '')}`;
}
function totals(list) {
  return list.reduce((a, e) => ({ kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f }), { kcal: 0, p: 0, c: 0, f: 0 });
}

// ---------- sheet ----------
function openSheet(html, mount) {
  closeSheet();
  const bd = document.createElement('div'); bd.className = 'backdrop'; bd.id = 'bd';
  bd.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div>${html}</div>`;
  bd.addEventListener('click', e => { if (e.target === bd) closeSheet(); });
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
    h.innerHTML = `<h1>${state.tab === 'foods' ? 'My foods' : 'Settings & export'}</h1>`;
  }
}
function renderTabs() {
  const pending = entries.filter(e => !e.exported).length;
  const tabs = [['today', '◐', 'Today'], ['add', '＋', 'Add'], ['foods', '☰', 'Foods'], ['more', '⇪', 'Export']];
  $('#tabs').innerHTML = tabs.map(([k, i, l]) =>
    `<button data-t="${k}" class="${state.tab === k ? 'on' : ''}"><span>${i}</span>${l}${k === 'more' && pending ? `<i class="badge">${pending}</i>` : ''}</button>`).join('');
  $('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => { state.tab = b.dataset.t; render(); window.scrollTo(0, 0); });
}
function render() {
  renderHeader(); renderTabs();
  ({ today: viewToday, add: viewAdd, foods: viewFoods, more: viewMore })[state.tab]();
}

// ---------- Today ----------
function viewToday() {
  const day = entries.filter(e => e.date === state.date).sort((a, b) => a.time.localeCompare(b.time));
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
    <div class="small muted" id="syncline" style="margin:-4px 4px 8px">${esc(syncStatus())}</div>`;
  if (!day.length) html += `<div class="list"><div class="empty">Nothing logged yet.<br><button class="btn" id="goadd" style="max-width:220px;margin:12px auto 0">Add food</button></div></div>`;
  for (const m of MEALS) {
    const items = day.filter(e => e.meal === m); if (!items.length) continue;
    html += `<h2><span class="spread"><span>${cap(m)}</span><span>${r0(totals(items).kcal)} kcal</span></span></h2><div class="list">` +
      items.map(e => `<button class="item" data-id="${e.id}"><div class="grow"><div class="name">${esc(e.name)}</div>
        <div class="small muted">${esc(e.time)} · ${esc(e.amount)}</div></div><div class="kcal">${r0(e.kcal)}</div></button>`).join('') + `</div>`;
  }
  if (day.length) html += `<button class="btn secondary" id="goadd" style="margin-top:16px">＋ Add food</button>`;
  $('#view').innerHTML = html;
  const g = $('#goadd'); if (g) g.onclick = () => { state.tab = 'add'; render(); };
  $('#view').querySelectorAll('.item').forEach(b => b.onclick = () => editEntry(entries.find(e => e.id === b.dataset.id)));
}

function editEntry(e) {
  const food = foods.find(f => f.id === e.foodId);
  openSheet(`<h3>${esc(e.name)}</h3><div class="muted small">${esc(e.amount)} · ${r0(e.kcal)} kcal · P ${r0(e.p)} · C ${r0(e.c)} · F ${r0(e.f)}</div>
    ${food && e.qty != null ? `<label>Amount (${e.mode === 'g' ? baseUnitLabel(food, 'g') : esc(food.servingLabel || 'servings')})</label>
      <input type="text" inputmode="decimal" id="q" value="${e.qty}">` : ''}
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
        Object.assign(e, calc(food, q, e.mode), { qty: q, amount: amountText(food, q, e.mode) });
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
  if (q) {
    const hits = foods.filter(f => matches(f.name, q)).sort((a, b) => (b.uses || 0) - (a.uses || 0));
    html = hits.length ? `<h2>Results</h2><div class="list">${hits.map(row).join('')}</div>`
      : `<div class="list"><div class="empty">No match for “${esc(q)}”.<br><button class="btn" id="mk" style="max-width:240px;margin:12px auto 0">Create “${esc(q)}”</button></div></div>`;
  } else {
    const recent = foods.filter(f => f.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 8);
    if (recent.length) html += `<h2>Recent</h2><div class="list">${recent.map(row).join('')}</div>`;
    html += `<h2>All foods</h2><div class="list">${[...foods].sort((a, b) => a.name.localeCompare(b.name)).map(row).join('')}</div>`;
  }
  $('#res').innerHTML = html;
  $('#res').querySelectorAll('.item').forEach(b => b.onclick = () => logFood(foods.find(f => f.id === b.dataset.id)));
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
      $('#qc', s).innerHTML = chips.map(c => `<button class="chip" data-v="${c}">${c}</button>`).join('');
      $('#qc', s).querySelectorAll('.chip').forEach(c => c.onclick = () => { q.value = c.dataset.v; upd(); });
      upd();
    };
    const upd = () => {
      const n = calc(food, num(q.value), mode);
      $('#pv', s).innerHTML = `<b>${r0(n.kcal)} kcal</b> · P ${r1(n.p)} g · C ${r1(n.c)} g · F ${r1(n.f)} g${n.caf ? ` · ☕ ${r0(n.caf)} mg` : ''}${n.alc ? ` · 🍺 ${r1(n.alc)}` : ''}`;
    };
    s.querySelectorAll('#seg button').forEach(b => b.onclick = () => setMode(b.dataset.m));
    q.oninput = upd;
    $('#t', s).onchange = () => { $('#m', s).value = mealFor($('#t', s).value || t0); };
    setMode(mode);
    $('#go', s).onclick = () => {
      const qty = num(q.value); if (qty <= 0) return toast('Enter an amount');
      const n = calc(food, qty, mode); const time = $('#t', s).value || t0;
      entries.push({ id: uid(), date: state.date, time, meal: $('#m', s).value, foodId: food.id, name: food.name,
        qty, mode, amount: amountText(food, qty, mode), ...n, exported: false, created: Date.now() });
      Object.assign(food, { uses: (food.uses || 0) + 1, lastUsed: Date.now(), lastQty: qty, lastMode: mode });
      saveEntries(); saveFoods(); closeSheet();
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

// ---------- Foods ----------
function viewFoods() {
  $('#view').innerHTML = `<input type="search" id="s" placeholder="Search…" value="${esc(state.fq)}" autocomplete="off">
    <button class="btn" id="newf">＋ New food</button><div id="fl"></div>`;
  const draw = () => {
    const list = foods.filter(f => !state.fq || matches(f.name, state.fq)).sort((a, b) => a.name.localeCompare(b.name));
    $('#fl').innerHTML = `<h2>${list.length} foods</h2><div class="list">` + (list.length ? list.map(f => `<button class="item" data-id="${f.id}">
      <div class="grow"><div class="name">${esc(f.name)}</div><div class="small muted">${f.basis === '100' ? `per 100 ${esc(f.unit || 'g')}` : `per ${esc(f.servingLabel || 'serving')}`}: ${r0(f.kcal)} kcal · P ${r1(f.p)} · C ${r1(f.c)} · F ${r1(f.f)}</div></div></button>`).join('')
      : '<div class="empty">No foods</div>') + '</div>';
    $('#fl').querySelectorAll('.item').forEach(b => b.onclick = () => editFood(foods.find(f => f.id === b.dataset.id), () => render()));
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
        barcode: f.barcode || null };
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
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity`, { cache: 'no-store' });
  if (!r.ok) return null;
  const j = await r.json(); const p = j.product;
  if (j.status !== 1 || !p) return null;
  const n = p.nutriments || {};
  const name = [String(p.brands || '').split(',')[0].trim(), (p.product_name_en || p.product_name || '').trim()].filter(Boolean).join(' ') || 'Scanned product';
  const sq = num(p.serving_quantity);
  const ml = /ml|l\b/i.test(String(p.quantity || '') + ' ' + String(p.serving_size || ''));
  let k100 = n['energy-kcal_100g']; if (k100 == null && n.energy_100g != null) k100 = n.energy_100g / 4.184;
  if (k100 != null) return { name, basis: '100', unit: ml ? 'ml' : 'g', servingLabel: p.serving_size || '', servingGrams: sq > 0 ? sq : null,
    kcal: r1(k100), p: r1(n.proteins_100g), c: r1(n.carbohydrates_100g), f: r1(n.fat_100g), barcode: code, fromOFF: true };
  let ks = n['energy-kcal_serving']; if (ks == null && n.energy_serving != null) ks = n.energy_serving / 4.184;
  if (ks != null) return { name, basis: 'serving', servingLabel: p.serving_size || '1 serving', servingGrams: sq > 0 ? sq : null,
    kcal: r1(ks), p: r1(n.proteins_serving), c: r1(n.carbohydrates_serving), f: r1(n.fat_serving), barcode: code, fromOFF: true };
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
let syncTimer = null, syncing = false;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), 1500); }
function syncStatus() {
  const pending = entries.filter(e => !e.exported).length;
  if (!settings.ghToken) return pending ? `${pending} not exported · auto-sync is off (set it up in Export)` : '';
  const last = store.get('lastSync', 0);
  const err = store.get('syncError', '');
  if (pending) return `${pending} waiting to sync${err ? ' · ' + err : navigator.onLine ? '' : ' · offline'}`;
  return last ? `✓ Synced ${new Date(last).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
}
function b64ToText(b) { const bin = atob(b.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))); }
function textToB64(t) { const by = new TextEncoder().encode(t); let bin = ''; for (let i = 0; i < by.length; i += 0x8000) bin += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); return btoa(bin); }
async function gh(method, body) {
  const url = `https://api.github.com/repos/${settings.ghRepo}/contents/${settings.ghPath.split('/').map(encodeURIComponent).join('/')}`;
  return fetch(url, { method, cache: 'no-store', headers: { Authorization: `Bearer ${settings.ghToken}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
async function sync(manual) {
  const pending = entries.filter(e => !e.exported);
  const deleted = store.get('deleted', []);
  const refresh = () => { const l = $('#syncline'); if (l) l.textContent = syncStatus(); renderTabs(); };
  if (!settings.ghToken) { if (manual) toast('Add your GitHub token first'); return; }
  if (!pending.length && !deleted.length) { if (manual) toast('Already up to date'); return; }
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
    ${!settings.ghToken && pending.length && (days === null || days >= 7) ? `<div class="notice">Your entries are stored only on this phone. ${days === null ? 'You haven’t exported yet.' : `Last export was ${days} days ago.`} Export at least once a week.</div>` : ''}
    <div class="card"><b>Auto-sync to your health repo</b>
      <div class="muted small" style="margin-top:4px">${settings.ghToken
        ? `On. New entries go to <b>${esc(settings.ghRepo)}/${esc(settings.ghPath)}</b> by themselves whenever you're online.`
        : 'Off. Paste a GitHub token (repo contents: read and write) to send entries to your health log automatically.'}</div>
      <div class="small" style="margin-top:6px">${esc(syncStatus() || 'Nothing waiting')}</div>
      <label>GitHub token</label><input type="password" id="gt" value="${esc(settings.ghToken)}" placeholder="github_pat_…" autocomplete="off">
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
      <button class="btn secondary" id="exa">Share all entries (CSV)</button>
      <button class="btn secondary" id="unx">Mark all entries as not exported</button>
    </div>
    <div class="small muted" style="text-align:center;margin-top:8px">Food log v2 · works offline</div>`;
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
    settings.ghToken = $('#gt').value.trim(); settings.ghRepo = $('#gr').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
    settings.ghPath = $('#gp').value.trim().replace(/^\//, ''); saveSettings();
    if (!settings.ghToken) { store.set('syncError', ''); render(); return toast('Auto-sync turned off'); }
    if (!navigator.onLine) { render(); return toast('Saved. Will test when online.'); }
    try {
      const g = await gh('GET');
      if (g.ok) { const f = await g.json(); const rows = b64ToText(f.content || '').trim().split('\n').length - 1; store.set('syncError', ''); toast(`Connected ✓ (${rows} rows in file)`); render(); sync(false); }
      else { store.set('syncError', g.status === 404 ? 'repo or file not found' : 'token rejected'); toast(g.status === 404 ? 'Repo or file not found (check token access)' : 'Token rejected'); render(); }
    } catch (e) { toast('Could not reach GitHub'); }
  };
  $('#gsync').onclick = () => sync(true);
  $('#exa').onclick = () => shareFile(toCSV(entries), `food-all-${todayStr()}.csv`, 'text/csv');
  $('#unx').onclick = () => { if (confirm('Mark every entry as not exported? They will be included in the next export.')) { entries.forEach(e => e.exported = false); saveEntries(); render(); } };
  $('#svt').onclick = () => { settings.kcal = r0(num($('#tk').value)) || settings.kcal; settings.protein = r0(num($('#tp').value)) || settings.protein; saveSettings(); toast('Targets saved'); };
  $('#bk').onclick = () => shareFile(JSON.stringify({ app: 'food-log', v: 1, at: new Date().toISOString(), foods, entries, settings }, null, 1), `food-backup-${todayStr()}.json`, 'application/json');
  $('#rs').onclick = () => $('#rf').click();
  $('#rf').onchange = async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'food-log' || !Array.isArray(d.foods) || !Array.isArray(d.entries)) throw new Error('bad');
      if (!confirm(`Replace everything on this phone with the backup (${d.foods.length} foods, ${d.entries.length} entries)?`)) return;
      foods = d.foods; entries = d.entries; settings = Object.assign(settings, d.settings || {});
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
state.lastSeenToday = state.date;
render();
scheduleSync();
