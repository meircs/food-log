'use strict';
/* CSV export and GitHub sync (entries, library, supplements, entries logged elsewhere). */
// ---------- Export / settings ----------
const CSV_HEADER = 'date,time,meal,description,calories,protein_g,carbs_g,fat_g,caffeine_mg,alcohol_drinks,source,notes';
function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function toCSV(list) {
  return [CSV_HEADER, ...[...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(e => [
    e.date, e.time, e.meal, `${e.name}, ${e.amount}`, r0(e.kcal), r0(e.p), r0(e.c), r0(e.f), r0(e.caf), r1(e.alc), 'app',
    ['app:' + e.id, e.note].filter(Boolean).join(' ')
  ].map(v => String(v ?? '').replace(/\s*[\r\n]+\s*/g, ' ')).map(csvCell).join(','))].join('\n') + '\n';
}


// ---------- GitHub sync ----------
async function sync(manual) {
  if (!settings.ghToken) { if (manual) toast('Add your GitHub token first'); return; }
  if (syncing) return;
  const suppWork = suppLog.some(l => !l.exported) || store.get('suppDeleted', []).length;
  const wWork = weightLog.some(w => !w.exported) || store.get('wDeleted', []).length;
  const work = entries.some(e => !e.exported) || store.get('deleted', []).length || libDirty() || suppWork || wWork || remoteOps.length;
  await syncEntries(manual);
  if (navigator.onLine && (remoteOps.length || wWork)) { syncing = true; try { await syncRemoteOps(); await syncWeights(); } catch (e) { store.set('syncError', e.message); } finally { syncing = false; } }
  if (navigator.onLine && (manual || Date.now() - store.get('remotePulled', 0) > 60000)) { try { await pullRemote(); } catch (e) { store.set('syncError', 'could not reach GitHub: ' + e.message); } }
  if (navigator.onLine) { try { await pullGarmin(false); } catch (e) { } }
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
// App rows are written as "<food name>, <amount>": split at the last top-level comma.
function splitAppDesc(d) {
  d = String(d || ''); let depth = 0, cut = -1;
  for (let i = 0; i < d.length; i++) { const ch = d[i]; if (ch === '(') depth++; else if (ch === ')') depth = Math.max(0, depth - 1); else if (ch === ',' && !depth && d[i + 1] === ' ') cut = i; }
  return cut > 0 ? { name: d.slice(0, cut), amount: d.slice(cut + 2) } : { name: d, amount: '' };
}
async function syncWeights() {
  const pending = weightLog.filter(w => !w.exported), deleted = store.get('wDeleted', []);
  if (!pending.length && !deleted.length) return;
  const path = settings.ghPath.replace(/[^/]*$/, '') + 'weight.csv', ids = new Set([...pending.map(w => w.id), ...deleted]);
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = await gh('GET', null, path); let text = 'date,time,weight_kg,body_fat_pct,source,notes\n', sha;
    if (g.ok) { const f = await g.json(); text = b64ToText(f.content || ''); sha = f.sha; } else if (g.status !== 404) throw new Error('weight: GitHub error ' + g.status);
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length);
    const kept = lines.filter((l, i) => { if (!i) return true; const m = l.match(/app:([a-z0-9]+)/); return !(m && ids.has(m[1])); });
    const added = pending.map(w => [w.date, w.time, w.kg.toFixed(2), w.bf ?? '', 'manual', 'logged in food app app:' + w.id].map(csvCell).join(','));
    const p = await gh('PUT', { message: `Weigh-in from food app${pending.length ? ' ' + pending.map(w => w.date).join(', ') : ''}`, content: textToB64([...kept, ...added].join('\n') + '\n'), ...(sha ? { sha } : {}) }, path);
    if (p.status === 409 || p.status === 422) continue;
    if (!p.ok) throw new Error('weight: GitHub error ' + p.status);
    const sent = new Set(pending.map(w => w.id)); weightLog.forEach(w => { if (sent.has(w.id)) w.exported = true; }); store.set('weightLog', weightLog);
    store.set('wDeleted', store.get('wDeleted', []).filter(id => !ids.has(id))); return;
  }
}
// Apply edits/deletes of rows Claude logged: change only the matching line, leave every other line as it is.
async function syncRemoteOps() {
  if (!remoteOps.length) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = await gh('GET'); if (!g.ok) throw new Error('GitHub error ' + g.status);
    const f = await g.json(); const lines = b64ToText(f.content || '').replace(/\r/g, '').split('\n');
    const head = parseCSV(lines[0])[0]; const ix = k => head.indexOf(k);
    const ops = remoteOps.slice(); let changed = 0;
    for (const op of ops) {
      const i = lines.findIndex((l, k) => { if (!k || !l) return false; const r = parseCSV(l)[0] || []; return r[ix('date')] === op.date && r[ix('time')] === op.time && r[ix('description')] === op.desc; });
      if (i < 0) continue;
      if (op.op === 'del') lines.splice(i, 1);
      else { const r = parseCSV(lines[i])[0]; const v = op.vals;
        ['calories', 'protein_g', 'carbs_g', 'fat_g', 'meal', 'time'].forEach(k => { r[ix(k)] = String(v[k]); });
        if (v.pct) { r[ix('description')] = `${r[ix('description')]} (ate ${v.pct}%)`; }
        r[ix('notes')] = [r[ix('notes')], 'edited in food app'].filter(Boolean).join('; ');
        lines[i] = r.map(csvCell).join(','); }
      changed++;
    }
    if (changed) {
      const p = await gh('PUT', { message: `Food app: ${changed} edit${changed === 1 ? '' : 's'} to logged entries`, content: textToB64(lines.join('\n')), sha: f.sha });
      if (p.status === 409 || p.status === 422) continue;
      if (!p.ok) throw new Error('GitHub error ' + p.status);
    }
    remoteOps = remoteOps.filter(o => !ops.includes(o)); store.set('remoteOps', remoteOps); store.set('remotePulled', 0); return;
  }
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
      meal: MEALS.includes(r[ix('meal')]) ? r[ix('meal')] : 'snack', ...(appId(r) ? splitAppDesc(r[ix('description')]) : { name: prettyName(r[ix('description')]).title, amount: prettyName(r[ix('description')]).detail }), full: r[ix('description')] || '',
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
