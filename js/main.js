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
