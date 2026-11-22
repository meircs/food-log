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
      if (Math.abs(dx) < 24 && Math.abs(dy) < 10) return;
      if (sheet || $('#bd')) mode = 'none';   // sheets handle their own drag-to-close
      else if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 2 && (state.tab === 'today' || state.tab === 'add')) mode = 'day';
      else if (dy > 0 && startScroll <= 0 && window.scrollY <= 0 && settings.ghToken) mode = 'pull';
      else mode = 'none';
    }
    if (mode === 'day' && !sliding) { const v = $('#view'), m = Math.min(70, Math.abs(dx) * 0.4); v.style.transition = 'none'; v.style.transform = `translateX(${Math.sign(dx) * m}px)`; v.style.opacity = String(1 - m / 350); }  // short, damped nudge only
    if (mode === 'pull') {
      ptr = ptr || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'ptr' });
      const p = Math.min(dy, 90); ptr.style.transform = `translate(-50%, ${p - 60}px)`; ptr.textContent = dy > 70 ? '↻ Release to sync' : '↓ Pull to sync';
    }
  }, { passive: true });
  document.addEventListener('touchend', e => {
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy, fast = Date.now() - st < 600;
    if (mode === 'day' && !sliding) { const v = $('#view');
      if ((Math.abs(dx) > 110 || (fast && Math.abs(dx) > 60)) && !$('#bd')) slideDay(dx < 0 ? 1 : -1);
      else { v.style.transition = 'transform .3s cubic-bezier(.2,.9,.25,1), opacity .2s'; v.style.transform = 'translateX(0)'; v.style.opacity = '1'; setTimeout(() => { v.style.transition = ''; v.style.transform = ''; v.style.opacity = ''; }, 320); } }
    if (mode === 'pull' && ptr) {
      if (dy > 70) { ptr.textContent = '↻ Syncing…'; store.set('remotePulled', 0); store.set('garminPulled', 0);
        sync(true).finally(() => { if (ptr) { ptr.style.transform = 'translate(-50%,-60px)'; const p = ptr; ptr = null; setTimeout(() => p.remove(), 200); } render(); }); }
      else { const p = ptr; ptr = null; p.style.transform = 'translate(-50%,-60px)'; setTimeout(() => p.remove(), 200); }
    }
    mode = null; sheet = null;
  }, { passive: true });
  // iOS sometimes cancels a touch (system gesture, notification, scroll takeover): never leave the page half-dragged.
  const snapBack = () => {
    if (mode === 'day' && !sliding) { const v = $('#view'); if (v) { v.style.transition = 'transform .25s ease, opacity .2s'; v.style.transform = 'translateX(0)'; v.style.opacity = '1';
      setTimeout(() => { v.style.transition = ''; v.style.transform = ''; v.style.opacity = ''; }, 260); } }
    if (ptr) { const p = ptr; ptr = null; p.style.transform = 'translate(-50%,-60px)'; setTimeout(() => p.remove(), 200); }
    mode = null; sheet = null;
  };
  document.addEventListener('touchcancel', snapBack, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) snapBack(); });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });  // no double-tap zoom
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false }); // no pinch zoom (iOS)
})();
