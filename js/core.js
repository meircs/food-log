'use strict';
/* Food log: storage, seed library, state, helpers, sheets and app chrome.
   Data lives in this browser's localStorage and syncs to the garmin-health repo. */
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
let bpLog = store.get('bpLog', []); // in-app BP [{id,date,time,period,s1,d1,p1,s2,d2,p2,exported}]
let weightLog = store.get('weightLog', []); // in-app weigh-ins [{id,date,time,kg,bf,exported}]
let remoteOps = store.get('remoteOps', []); // pending edits/deletes of rows Claude logged
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
// The page behind is frozen while a sheet is open (iOS otherwise scrolls it),
// and the sheet can be dragged down to close, like iOS sheets.
let sheetLocked = false;
function lockPage() {
  if (sheetLocked) return; sheetLocked = true;
  document.documentElement.classList.add('locked');   // overflow hidden: page stays exactly where it is
}
function unlockPage() {
  if (!sheetLocked) return; sheetLocked = false;
  document.documentElement.classList.remove('locked');
}
function openSheet(html, mount) {
  closeSheet(false);
  const bd = document.createElement('div'); bd.className = 'backdrop'; bd.id = 'bd';
  bd.innerHTML = `<div class="sheet" role="dialog"><div class="grab"></div><button class="xbtn" id="xclose" aria-label="Close">✕</button>${html}</div>`;
  bd.addEventListener('click', e => { if (e.target === bd) closeSheet(); });
  bd.querySelector('#xclose').onclick = closeSheet;
  // Touches on the dimmed area never scroll anything.
  bd.addEventListener('touchmove', e => { if (e.target === bd) e.preventDefault(); }, { passive: false });
  lockPage();
  document.body.appendChild(bd);
  dragToClose(bd.firstElementChild);
  mount && mount(bd.firstElementChild);
}
function dragToClose(sh) {
  let y0 = null, dy = 0, t0 = 0, dragging = false;
  sh.addEventListener('touchstart', e => {
    const t = e.target;
    if (e.touches.length !== 1 || t.closest('svg[data-wk], input, textarea, select, video, .noswipe')) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); dragging = false;
  }, { passive: true });
  sh.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const d = e.touches[0].clientY - y0;
    if (!dragging) {
      if (d > 6 && sh.scrollTop <= 0) { dragging = true; sh.style.transition = 'none'; }
      else if (Math.abs(d) > 6) { y0 = null; return; }   // normal scrolling inside the sheet
      else return;
    }
    dy = Math.max(0, d); e.preventDefault();
    sh.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  const end = () => {
    if (!dragging) { y0 = null; return; }
    const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
    dragging = false; y0 = null;
    if (dy > 110 || (fast && dy > 40)) closeSheet();
    else { sh.style.transition = 'transform .25s cubic-bezier(.2,.9,.25,1)'; sh.style.transform = ''; }
  };
  sh.addEventListener('touchend', end); sh.addEventListener('touchcancel', end);
}
function closeSheet(animated = true) {
  stopScanner(); const b = $('#bd'); if (!b || b.dataset.closing) return;
  const sh = b.firstElementChild;
  if (!animated || !sh) { b.remove(); unlockPage(); return; }
  b.dataset.closing = '1'; b.id = 'bd-closing'; b.classList.add('closing'); b.style.pointerEvents = 'none';
  sh.style.transition = 'transform .26s cubic-bezier(.4,0,.8,.6)'; sh.style.transform = 'translateY(100%)';
  unlockPage();
  setTimeout(() => b.remove(), 260);
}
// iOS-like day change: content slides out, the new day slides in with an ease-out curve.
let sliding = false;
function slideDay(dir, fromX = 0) {
  const v = $('#view'); if (sliding || !v) return; sliding = true;
  const W = window.innerWidth;
  v.style.transition = 'transform .18s cubic-bezier(.4,0,1,1), opacity .18s'; v.style.transform = `translateX(${-dir * W * 0.6}px)`; v.style.opacity = '0';
  setTimeout(() => {
    state.date = addDays(state.date, dir); render();
    v.style.transition = 'none'; v.style.transform = `translateX(${dir * W * 0.35}px)`; v.style.opacity = '0'; void v.offsetWidth;
    v.style.transition = 'transform .34s cubic-bezier(.2,.9,.25,1), opacity .25s ease-out'; v.style.transform = 'translateX(0)'; v.style.opacity = '1';
    setTimeout(() => { v.style.transition = ''; v.style.transform = ''; v.style.opacity = ''; sliding = false; }, 360);
  }, 170);
}

// ---------- chrome ----------
function renderHeader() {
  const h = $('#hdr');
  if (state.tab === 'today' || state.tab === 'add') {
    h.innerHTML = `<button class="iconbtn" id="prev" aria-label="Previous day">‹</button>
      <h1 id="dlabel">${state.tab === 'add' ? 'Add to ' + (state.addMeal ? cap(state.addMeal) + ', ' : '') : ''}${esc(dateLabel(state.date))}</h1>
      <button class="iconbtn" id="next" aria-label="Next day">›</button>`;
    $('#prev').onclick = () => slideDay(-1);
    $('#next').onclick = () => slideDay(1);
    $('#dlabel').onclick = () => { state.date = todayStr(); render(); };
  } else {
    h.innerHTML = `${state.tab === 'foods' ? '<button class="iconbtn" id="back" aria-label="Back">‹</button>' : ''}<h1>${{ foods: 'My foods & meals', stats: 'Stats', health: 'Health', ai: 'AI coach', more: 'More' }[state.tab]}</h1>${state.tab === 'foods' ? '<span style="width:40px"></span>' : ''}`;
    const bk = $('#back'); if (bk) bk.onclick = () => { state.tab = 'more'; render(); };
  }
}
const ICONS = {
  today: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  stats: '<path d="M5 20V11M12 20V5M19 20v-7"/>',
  health: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  ai: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  more: '<path d="M5 7h14M5 12h14M5 17h14"/>'
};
const icon = k => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
function renderTabs() {
  const pending = entries.filter(e => !e.exported).length;
  const tabs = [['today', 'today', 'Today'], ['add', 'add', 'Add'], ['stats', 'stats', 'Stats'], ['health', 'health', 'Health'], ['ai', 'ai', 'AI'], ['more', 'more', 'More']];
  $('#tabs').innerHTML = tabs.map(([k, i, l]) =>
    `<button data-t="${k}" class="${state.tab === k || (k === 'more' && state.tab === 'foods') ? 'on' : ''}"><span>${icon(i)}</span>${l}${k === 'more' && pending ? `<i class="badge">${pending}</i>` : ''}</button>`).join('');
  $('#tabs').querySelectorAll('button').forEach(b => b.onclick = () => { state.tab = b.dataset.t; state.addMeal = null; render('fade'); window.scrollTo(0, 0); });
}
function render(anim) {
  renderHeader(); renderTabs();
  const v = $('#view'); if (v && anim) { v.classList.remove('in-left', 'in-right', 'fade'); void v.offsetWidth; v.classList.add(anim); }
  ({ today: viewToday, add: viewAdd, stats: viewStats, health: viewHealth, ai: viewAI, foods: viewFoods, more: viewMore })[state.tab]();
}
