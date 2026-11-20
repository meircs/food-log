'use strict';
/* More tab: sync settings, targets, export, backup. */
function targetsHTML() {
  const goal = settings.goal || 'maintain', s2 = suggestTargets(goal);
  const opts = Object.entries(GOALS).map(([k, g]) => `<option value="${k}" ${k === goal ? 'selected' : ''}>${g[0]}</option>`).join('');
  if (!s2) return `<div class="small muted" style="margin-top:4px">Suggested targets appear once there's a week of Garmin data (needs the sync token).</div>`;
  const m = s2.m;
  return `<label>Goal</label><select id="goal">${opts}</select>
    <div class="preview" id="tgsugg"><b>Suggested: ${fmt(s2.kcal)} kcal${s2.protein ? ` · ${s2.protein} g protein` : ''}</b>
      <div class="small" style="margin-top:4px">Maintenance ≈ ${fmt(m.maint)} kcal/day${m.obs ? ` (Garmin ${fmt(m.gAvg)}, your food + weight trend ${fmt(m.obs)})` : ` from your Garmin burn over ${m.gDays} days`}.
      ${s2.protein ? `Protein ${GOALS[goal][2]} g per kg at ${r1(m.kg)} kg.` : 'Log a weigh-in to get a protein target.'}</div></div>
    <div class="small muted" style="margin-top:6px">${m.obs ? 'Refined with your logged food and weight trend.' : 'After 2+ weeks of logging food and weighing in, this gets checked against your real weight change.'} Estimates, not medical advice.</div>
    <button class="btn" id="tgapply">Use suggested targets</button>`;
}
function viewMore() {
  const pending = entries.filter(e => !e.exported);
  const lastExp = store.get('lastExport', 0);
  const days = lastExp ? Math.floor((Date.now() - lastExp) / 864e5) : null;
  $('#view').innerHTML = `
    <button class="item card" id="gofoods" style="border:1px solid var(--line);border-radius:var(--r);margin-bottom:12px"><div class="grow"><b>My foods &amp; saved meals</b><div class="small muted">${foods.length} foods · ${meals.length} meal${meals.length === 1 ? '' : 's'} · edit, add, delete</div></div><div class="muted">›</div></button>
    ${!settings.ghToken && pending.length && (days === null || days >= 7) ? `<div class="notice">Your entries are stored only on this phone. ${days === null ? 'You haven’t exported yet.' : `Last export was ${days} days ago.`} Export at least once a week.</div>` : ''}
    ${settings.ghToken && !store.get('syncError', '') && !state.showConn ? `<div class="card"><div class="conn"><span style="color:var(--accent);font-size:20px">✓</span><div class="grow" style="flex:1"><b>Connected</b>
      <div class="small muted">${esc(settings.ghRepo)} · ${esc(syncStatus() || 'up to date')}</div></div><button class="linkbtn" id="connedit">Change</button></div>
      <button class="btn secondary" id="gsync">Sync now</button></div>` : `<div class="card"><b>Auto-sync to your health repo</b>
      <div class="muted small" style="margin-top:4px">${settings.ghToken
        ? `On. New entries go to <b>${esc(settings.ghRepo)}/${esc(settings.ghPath)}</b> by themselves whenever you're online, and your foods and saved meals are backed up to <b>${esc(settings.ghLibPath)}</b>.`
        : 'Off. Paste a GitHub token (repo contents: read and write) to send entries to your health log automatically.'}</div>
      <div class="small" style="margin-top:6px">${esc(syncStatus() || 'Nothing waiting')}</div>
      <label>GitHub token</label><input type="text" id="gt" value="${esc(settings.ghToken)}" placeholder="github_pat_…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="-webkit-text-security:disc">
      ${settings.ghToken ? `<div class="small muted" style="margin-top:4px">Saved: ${esc(settings.ghToken.slice(0, 15))}… (${settings.ghToken.length} characters)</div>` : ''}
      <div class="grid2"><div><label>Repo</label><input type="text" id="gr" value="${esc(settings.ghRepo)}" autocapitalize="off"></div>
      <div><label>File</label><input type="text" id="gp" value="${esc(settings.ghPath)}" autocapitalize="off"></div></div>
      <div class="btnrow"><button class="btn secondary" id="gsave">Save &amp; test</button><button class="btn" id="gsync" ${settings.ghToken ? '' : 'disabled'}>Sync now</button></div>
    </div>`}
    ${settings.ghToken ? '' : `<div class="card"><b>Manual export</b>
      <div class="muted small" style="margin-top:4px">If auto-sync is off: share the file to the <b>Google Drive → Food log</b> folder, and Claude adds it to your health log.</div>
      <button class="btn" id="exn" ${pending.length ? '' : 'disabled'}>Share ${pending.length} new ${pending.length === 1 ? 'entry' : 'entries'}</button>
      <button class="btn secondary" id="cpy" ${pending.length ? '' : 'disabled'}>Copy new entries as text</button>
      <div class="small muted" style="margin-top:8px">${lastExp ? `Last export: ${new Date(lastExp).toLocaleString()}` : 'Not exported yet'} · ${entries.length} entries total</div>
    </div>`}
    <div class="card"><b>AI coach</b>
      <div class="small muted" style="margin-top:4px">Your Claude API key from platform.claude.com. Stays on this phone; only sent to Claude when you tap Update.</div>
      <label>Claude API key</label><input type="text" id="aik" value="${esc(settings.aiKey || '')}" placeholder="sk-ant-…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="-webkit-text-security:disc">
      ${settings.aiKey ? `<div class="small muted" style="margin-top:4px">Saved: ${esc(settings.aiKey.slice(0, 10))}… (${settings.aiKey.length} characters)</div>` : ''}
      <label>Model</label><select id="aimodel">${Object.entries(AI_MODELS).map(([k, v]) => `<option value="${k}" ${k === (settings.aiModel || 'claude-sonnet-5-5') ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      <button class="btn secondary" id="aisv">Save</button></div>
    <div class="card"><b>Daily targets</b>${targetsHTML()}
      <label>Or set your own</label><div class="grid2"><div><label>Calories</label><input type="text" inputmode="numeric" id="tk" value="${settings.kcal}"></div>
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
    <div class="small muted" style="text-align:center;margin-top:8px">Food log v27 · works offline</div>`;
  $('#gofoods').onclick = () => { state.tab = 'foods'; render(); window.scrollTo(0, 0); };
  const markDone = () => { pending.forEach(e => e.exported = true); saveEntries(); store.set('lastExport', Date.now()); render(); };
  if ($('#exn')) $('#exn').onclick = async () => {
    const ok = await shareFile(toCSV(pending), `food-${todayStr()}-${nowTime().replace(':', '')}.csv`, 'text/csv');
    if (ok) { markDone(); toast('Exported'); }
  };
  if ($('#cpy')) $('#cpy').onclick = async () => {
    try { await navigator.clipboard.writeText(toCSV(pending)); } catch (e) { return toast('Copy failed'); }
    if (confirm('Copied. Mark these entries as exported?')) { markDone(); toast('Marked as exported'); }
  };
  const ce = $('#connedit'); if (ce) ce.onclick = () => { state.showConn = true; render(); };
  const gsv = $('#gsave'); if (gsv) gsv.onclick = async () => {
    settings.ghToken = $('#gt').value.replace(/\s+/g, '');
    if (settings.ghToken && !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(settings.ghToken)) { toast(`That doesn't look like a GitHub token (starts “${settings.ghToken.slice(0, 6)}”, ${settings.ghToken.length} chars). Copy it again.`); return; } settings.ghRepo = $('#gr').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
    settings.ghPath = $('#gp').value.trim().replace(/^\//, ''); saveSettings();
    if (!settings.ghToken) { store.set('syncError', ''); render(); return toast('Auto-sync turned off'); }
    if (!navigator.onLine) { render(); return toast('Saved. Will test when online.'); }
    try {
      const g = await gh('GET');
      if (g.ok) { const f = await g.json(); const rows = b64ToText(f.content || '').trim().split('\n').length - 1; store.set('syncError', ''); toast(`Connected ✓ (${rows} rows in file)`); state.showConn = false; if (store.get('libEdited', false) || !(await loadLibraryFromRepo(false).catch(() => false))) bumpLib(); render(); sync(false); }
      else { store.set('syncError', g.status === 404 ? 'repo or file not found' : 'token rejected'); toast(g.status === 404 ? 'Repo or file not found (check token access)' : 'Token rejected'); render(); }
    } catch (e) { toast('Could not reach GitHub'); }
  };
  $('#gsync').onclick = () => sync(true);
  const lrl = $('#lrl'); if (lrl) lrl.onclick = () => loadLibraryFromRepo(true).catch(() => toast('Could not reach GitHub'));
  $('#exa').onclick = () => shareFile(toCSV(entries), `food-all-${todayStr()}.csv`, 'text/csv');
  $('#unx').onclick = () => { if (confirm('Mark every entry as not exported? They will be included in the next export.')) { entries.forEach(e => e.exported = false); saveEntries(); render(); } };
  const gsel = $('#goal'); if (gsel) gsel.onchange = () => { settings.goal = gsel.value; saveSettings(); render(); };
  const tga = $('#tgapply'); if (tga) tga.onclick = () => { const s2 = suggestTargets(settings.goal || 'maintain'); if (!s2) return;
    settings.kcal = s2.kcal; if (s2.protein) settings.protein = s2.protein; saveSettings(); render(); toast(`Targets set: ${fmt(settings.kcal)} kcal, ${settings.protein} g protein`); };
  $('#aisv').onclick = () => { const k = $('#aik').value.replace(/\s+/g, '');
    if (k && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) return toast(`That doesn't look like a Claude API key (starts “${k.slice(0, 7)}”, ${k.length} chars)`);
    settings.aiKey = k; settings.aiModel = $('#aimodel').value; saveSettings(); render(); toast(k ? 'AI key saved' : 'AI key removed'); };
  $('#svt').onclick = () => { settings.kcal = r0(num($('#tk').value)) || settings.kcal; settings.protein = r0(num($('#tp').value)) || settings.protein; saveSettings(); toast('Targets saved'); };
  $('#bk').onclick = () => shareFile(JSON.stringify({ app: 'food-log', v: 2, at: new Date().toISOString(), foods, meals, entries, settings: { ...settings, ghToken: '', aiKey: '' } }, null, 1), `food-backup-${todayStr()}.json`, 'application/json');
  $('#rs').onclick = () => $('#rf').click();
  $('#rf').onchange = async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'food-log' || !Array.isArray(d.foods) || !Array.isArray(d.entries)) throw new Error('bad');
      if (!confirm(`Replace everything on this phone with the backup (${d.foods.length} foods, ${d.entries.length} entries)?`)) return;
      foods = d.foods; entries = d.entries; meals = d.meals || meals; const tok = settings.ghToken, aiK = settings.aiKey; settings = Object.assign(settings, d.settings || {}); settings.ghToken = settings.ghToken || tok; settings.aiKey = settings.aiKey || aiK; store.set('meals', meals);
      saveFoods(); saveEntries(); saveSettings(); render(); toast('Backup restored');
    } catch (e) { toast('That file is not a Food log backup'); }
  };
}
