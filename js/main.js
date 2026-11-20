'use strict';
/* Boot: service worker, sync triggers, first render. */
// ---------- boot ----------
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  // When a new version takes over, reload once so it shows straight away (skip while a panel is open).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || window.__reloading) return;
    const go = () => { window.__reloading = true; location.reload(); };
    if (!$('#bd')) go(); else { const t = setInterval(() => { if (!$('#bd')) { clearInterval(t); go(); } }, 1000); }
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.update().catch(() => { });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => { }); });
  }).catch(() => { });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.tab === 'today' && state.date !== todayStr() && state.lastSeenToday === state.date) { state.date = todayStr(); render(); }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(); });
window.addEventListener('online', () => scheduleSync());
setInterval(() => { if (document.visibilityState === 'visible') sync(false); }, 60000);
state.lastSeenToday = state.date;
render();
scheduleSync();

// ---------- app-like gestures ----------
(() => {
  let sx = 0, sy = 0, st = 0, mode = null, sheet = null, ptr = null, startScroll = 0;
  const inScroller = el => { for (; el && el !== document.body; el = el.parentElement) { if (el.scrollWidth > el.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true; } return false; };
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { mode = null; return; }
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); mode = null; startScroll = window.scrollY;
    sheet = e.target.closest && e.target.closest('.sheet');
    if (sheet && sheet.scrollTop > 0) sheet = null;              // let the panel scroll first
    if (e.target.closest && (e.target.closest('input,select,textarea,svg') || inScroller(e.target))) mode = 'none';
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (mode === 'none' || e.touches.length !== 1) return;
    const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (!mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (sheet) mode = dy > 0 && Math.abs(dy) > Math.abs(dx) ? 'sheet' : 'none';
      else if (Math.abs(dx) > Math.abs(dy) * 1.5 && (state.tab === 'today' || state.tab === 'add')) mode = 'day';
      else if (dy > 0 && startScroll <= 0 && window.scrollY <= 0 && settings.ghToken) mode = 'pull';
      else mode = 'none';
    }
    if (mode === 'sheet') sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
    if (mode === 'pull') {
      ptr = ptr || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'ptr' });
      const p = Math.min(dy, 90); ptr.style.transform = `translate(-50%, ${p - 60}px)`; ptr.textContent = dy > 70 ? '↻ Release to sync' : '↓ Pull to sync';
    }
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy, fast = Date.now() - st < 600;
    if (mode === 'sheet' && sheet) { if (dy > 110 || (fast && dy > 50)) { sheet.style.transform = 'translateY(100%)'; setTimeout(closeSheet, 150); } else sheet.style.transform = ''; }
    if (mode === 'day' && Math.abs(dx) > 60 && !$('#bd')) { state.date = addDays(state.date, dx < 0 ? 1 : -1); render(dx < 0 ? 'in-right' : 'in-left'); }
    if (mode === 'pull' && ptr) {
      if (dy > 70) { ptr.textContent = '↻ Syncing…'; store.set('remotePulled', 0); store.set('garminPulled', 0);
        sync(true).finally(() => { if (ptr) { ptr.style.transform = 'translate(-50%,-60px)'; const p = ptr; ptr = null; setTimeout(() => p.remove(), 200); } render(); }); }
      else { const p = ptr; ptr = null; p.style.transform = 'translate(-50%,-60px)'; setTimeout(() => p.remove(), 200); }
    }
    mode = null; sheet = null;
  }, { passive: true });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });  // no double-tap zoom
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false }); // no pinch zoom (iOS)
})();
