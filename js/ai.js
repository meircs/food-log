'use strict';
/* AI tab: on Update, sends a compact summary of recent food, weight, supplements and Garmin data
   to the Claude API (with the user's own key) and shows the analysis. History syncs to the repo. */

let aiHistory = store.get('aiHistory', []); // newest first: {at, model, cost, data:{headline, summary, next[], food_idea, watch}}
const AI_MODELS = { 'claude-sonnet-5-5': ['Sonnet 5.5 (recommended)', 2, 10], 'claude-haiku-5-5': ['Haiku 5.5 (cheapest)', 0.1, 0.5], 'claude-opus-5-5': ['Opus 5.5 (deepest)', 4, 20] };
let aiBusy = false;
// Credit left: Anthropic has no API for the balance, so you type the balance shown in the Console
// and the app subtracts what each Update costs from then on (Updates from this phone only).
function aiCredit() {
  if (settings.aiBal == null || !settings.aiBalAt) return null;
  const spent = store.get('aiSpend', []).filter(x => x.at > settings.aiBalAt).reduce((a, x) => a + (x.cost || 0), 0);
  return { left: Math.max(0, settings.aiBal - spent), spent, start: settings.aiBal, at: settings.aiBalAt };
}
function aiCreditHTML() {
  const c = aiCredit();
  if (!c) return `<div class="small muted" style="text-align:center;margin:-4px 0 10px"><button class="linkbtn small" id="aibal">Set your credit balance to see how much is left</button></div>`;
  const pct = c.start ? c.left / c.start * 100 : 0, per = aiHistory.filter(h => h.cost).slice(0, 10), avg = per.length ? per.reduce((a, h) => a + h.cost, 0) / per.length : 0;
  return `<div class="card" style="padding:10px 14px;margin-top:0"><div class="spread"><span class="small muted">API credit left (estimate)</span><button class="linkbtn small" id="aibal">Update</button></div>
    <div class="spread" style="align-items:baseline"><b style="font-size:20px;color:${c.left < 1 ? 'var(--warn)' : 'var(--ink)'}">$${c.left.toFixed(2)}</b><span class="small muted">of $${c.start.toFixed(2)}${avg ? ` · ≈ ${Math.floor(c.left / avg)} more updates` : ''}</span></div>
    <div class="bar" style="margin:6px 0 2px"><i style="width:${pct}%;background:${c.left < 1 ? 'var(--warn)' : 'var(--accent)'}"></i></div>
    <div class="small muted">Spent $${c.spent.toFixed(2)} here since ${new Date(c.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Check the exact balance at platform.claude.com → Billing.</div></div>`;
}
function editAiCredit() {
  openSheet(`<h3>API credit balance</h3><div class="small muted">Open platform.claude.com → Settings → Billing and type the credit balance shown there. The app then counts down as you use Update.</div>
    <label>Balance (USD)</label><input id="abal" type="text" inputmode="decimal" placeholder="e.g. 4.85" value="${settings.aiBal != null ? r1(aiCredit() ? aiCredit().left : settings.aiBal) : ''}">
    <button class="btn" id="absv" style="margin-top:14px">Save</button>`, sh => {
    sh.querySelector('#absv').onclick = () => { const v = num(sh.querySelector('#abal').value);
      if (!(v >= 0)) return toast('Enter the balance in dollars');
      settings.aiBal = v; settings.aiBalAt = new Date().toISOString(); saveSettings(); closeSheet(); render(); toast('Balance saved'); };
  });
}

function aiContext() {
  const all = [...entries, ...remote];
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), -i)).reverse();
  const rows = days.map(d => {
    const es = all.filter(e => e.date === d), t = totals(es), h = health[d] || {};
    const late = es.some(e => e.time >= '21:00' && e.kcal >= 150), caf = es.some(e => e.time >= '14:00' && (e.caf || 0) > 0);
    const alc = es.reduce((a, e) => a + (e.alc || 0), 0);
    const wk = acts.filter(a => a.date === d && a.type !== 'walking').map(a => `${a.type} ${r0(a.dur)}min`).join('+');
    const g = garmin[d];
    return [d + (d === todayStr() ? '(today,partial)' : ''), es.length ? r0(t.kcal) : '-', es.length ? r0(t.p) : '-', es.length ? r0(t.c) : '-', es.length ? r0(t.f) : '-',
      late ? 'late' : '', caf ? 'pm-caf' : '', alc ? r1(alc) + 'drinks' : '', wk || '', h.hrs != null ? r1(h.hrs) : '', h.score ?? '', h.hrv ?? '', h.rhr ?? '',
      h.steps ?? '', h.bbHi ?? '', g && d < todayStr() ? r0(g.total) : ''].join(',');
  });
  const w = weights.filter(x => x.date >= addDays(todayStr(), -30)).map(x => `${x.date}:${r1(x.kg)}`).join(' ');
  const sup = supps.map(x => { const k = days.slice(-7).filter(d => suppLog.some(l => l.date === d && l.suppId === x.id)).length; return `${x.name} ${k}/7`; }).join(', ');
  const todayEs = all.filter(e => e.date === todayStr()).map(e => `${e.time} ${e.name} ${r0(e.kcal)}kcal ${r0(e.p)}gP`).join('; ');
  const m = targetModel(), prev = aiHistory[0];
  return `GOAL: ${(GOALS[settings.goal || 'recomp'] || GOALS.maintain)[0]}. Targets: ${settings.kcal} kcal, ${settings.protein} g protein/day. Height 169 cm. Garmin maintenance estimate: ${m.gAvg ? r0(m.gAvg) : 'unknown'} kcal/day.
LAST 14 DAYS (date,kcal,protein_g,carbs_g,fat_g,late_meal,caffeine_after_2pm,alcohol,workouts,sleep_h,sleep_score,hrv_ms,resting_hr,steps,body_battery_high,garmin_kcal_burned):
${rows.join('\n')}
('-' = no food logged that day; food values are estimates.)
WEIGHT (kg, last 30 days): ${w || 'none logged'}
SUPPLEMENTS (days taken, last 7): ${sup || 'none tracked'}
TODAY SO FAR: ${todayEs || 'nothing logged yet'} (time now ${nowTime()})
PREVIOUS ADVICE (${prev ? new Date(prev.at).toLocaleString() : 'none'}): ${prev ? [prev.data.headline, ...(prev.data.next || [])].join(' | ') : 'none'}`;
}

const AI_SYSTEM = `You are a concise, practical nutrition and training coach inside a personal food and health tracking app. The user is an adult man (169 cm) doing home/outdoor training, aiming to build muscle and lose fat. Use ONLY the data given; food numbers are estimates and some days may be under-logged (say so if a day looks incomplete rather than treating it as real intake). Compare with his targets and his own recent averages, notice trends and links (e.g. protein vs training days, late meals vs sleep), and give specific, realistic next steps with foods and amounts where useful. If he followed or ignored previous advice, acknowledge it briefly. Wellness guidance only: no diagnosis, no extreme diets; if something looks medically concerning, suggest checking with a doctor.
Be brief: the headline is one short line, the summary is 2-3 sentences, each next step is one sentence. Always report by calling the coach_report tool exactly once, with no other text.`;
const AI_TOOL = { name: 'coach_report', description: 'Report the coaching analysis to show in the app.', input_schema: { type: 'object', properties: {
  headline: { type: 'string', description: 'One line, max 80 characters' },
  summary: { type: 'string', description: '2-3 sentences with the key numbers' },
  next: { type: 'array', items: { type: 'string' }, description: 'A JSON array of 3 strings: specific actions for the rest of today / tomorrow, one sentence each' },
  food_idea: { type: 'string', description: 'One concrete meal or snack that fits what is left today, with rough kcal and protein' },
  watch: { type: 'string', description: 'One thing to keep an eye on this week, or empty' } }, required: ['headline', 'summary', 'next'] } };

async function aiUpdate() {
  if (aiBusy) return;
  if (!settings.aiKey) { toast('Add your Claude API key in More first'); return; }
  if (!navigator.onLine) { toast("You're offline"); return; }
  aiBusy = true; viewAI();
  try {
    try { await syncGarminNow(t => { const b = $('#aiup'); if (b) b.textContent = '✦ ' + t; }); } catch (e) { }
    { const b = $('#aiup'); if (b) b.textContent = '✦ Analyzing your data…'; }
    const model = settings.aiModel || 'claude-sonnet-5-5';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': settings.aiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 2000, system: AI_SYSTEM, tools: [AI_TOOL], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: aiContext() }] })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j.error && j.error.message) || '';
      throw new Error(r.status === 401 ? 'API key rejected. Check it in More.' : /credit|balance/i.test(msg) ? 'Out of API credit. Top up at platform.claude.com.' : r.status === 429 ? 'Too many requests. Try again in a minute.' : `Claude API error ${r.status}${msg ? ': ' + msg : ''}`);
    }
    const tool = (j.content || []).find(c => c.type === 'tool_use' && c.input);
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    let data = tool ? tool.input : null;
    if (!data) { try { data = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim()); } catch (e) { data = salvage(text); } }
    data = normAI(data);
    if (!data || !data.headline) throw new Error('Claude returned an incomplete answer. Tap Update again.');
    const p = AI_MODELS[model] || AI_MODELS['claude-sonnet-5-5'], u = j.usage || {};
    const cost = ((u.input_tokens || 0) * p[1] + (u.output_tokens || 0) * p[2]) / 1e6;
    aiHistory.unshift({ at: new Date().toISOString(), model, cost, data }); aiHistory = aiHistory.slice(0, 30);
    store.set('aiSpend', [...store.get('aiSpend', []), { at: new Date().toISOString(), cost }].slice(-2000));
    store.set('aiHistory', aiHistory); store.set('aiDirty', true); scheduleSync();
    toast('Updated');
  } catch (e) { toast(e.message === 'Failed to fetch' ? 'Could not reach Claude. Check your connection.' : e.message); }
  finally { aiBusy = false; if (state.tab === 'ai') viewAI(); }
}

// Models sometimes return "next" as one string or as numbered keys; turn it all into a clean list.
function normAI(d) {
  if (!d || typeof d !== 'object') return d;
  const o = { ...d }; let arr = [];
  if (Array.isArray(o.next)) arr = o.next.slice();
  else if (typeof o.next === 'string') {
    try { const p = JSON.parse(o.next); if (Array.isArray(p)) arr = p; } catch (e) { }
    if (!arr.length) arr = o.next.replace(/<\/?parameter[^>]*>/g, '\n').split(/\n+/).map(x => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  }
  Object.keys(o).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b).forEach(k => { if (typeof o[k] === 'string') arr.push(o[k]); delete o[k]; });
  o.next = arr.map(x => String(x).trim()).filter(Boolean).slice(0, 5);
  ['headline', 'summary', 'food_idea', 'watch', 'full'].forEach(k => { if (o[k] != null && typeof o[k] !== 'string') o[k] = String(o[k]); });
  return o;
}
// Pull fields out of a JSON answer that was cut off mid-way.
function salvage(text) {
  if (!/^\s*\{/.test(text || '')) return text ? { headline: 'Analysis', summary: text, next: [] } : null;
  const str = k => { const m = text.match(new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"')); return m ? JSON.parse('"' + m[1] + '"') : ''; };
  const nextM = text.match(/"next"\s*:\s*\[([\s\S]*)/);
  const next = nextM ? [...nextM[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => JSON.parse('"' + m[1] + '"')) : [];
  const h = str('headline'); return h ? { headline: h, summary: str('summary'), next, food_idea: str('food_idea'), watch: str('watch') } : null;
}
function aiCardHTML(h, big) {
  let d = h.data || {}; if (/^\s*\{/.test(d.summary || '')) d = salvage(d.summary) || d; d = normAI(d) || {};
  const at = new Date(h.at);
  const when = at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `<div class="card ${big ? 'aimain' : ''}">
    <div class="spread"><span class="small muted">${esc(when)}</span><span class="small muted">${h.model === 'morning' ? 'Morning analysis · free' : esc((AI_MODELS[h.model] || [h.model])[0].split(' (')[0])}${h.cost ? ` · ${h.cost < 0.01 ? '<1¢' : r1(h.cost * 100) + '¢'}` : ''}</span></div>
    <div style="font-size:${big ? 19 : 16}px;font-weight:650;margin-top:6px">${esc(d.headline || '')}</div>
    ${d.summary ? `<div style="margin-top:6px;line-height:1.45">${esc(d.summary)}</div>` : ''}
    ${(d.next || []).length ? `<div class="small muted" style="margin-top:10px;font-weight:600">NEXT</div><ol style="margin:4px 0 0;padding-left:20px;line-height:1.45">${d.next.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    ${d.food_idea ? `<div class="preview" style="margin-top:10px">🍽 ${esc(d.food_idea)}</div>` : ''}
    ${d.watch ? `<div class="small" style="margin-top:8px"><b>Watch:</b> ${esc(d.watch)}</div>` : ''}
    ${d.full ? `<details style="margin-top:10px"><summary class="linkbtn" style="font-size:14px;cursor:pointer">Show full analysis</summary><div style="margin-top:6px;line-height:1.45;font-size:15px">${miniMd(d.full)}</div></details>` : ''}</div>`;
}

// Very small, safe markdown for the full morning analysis: headings, bullets, bold, links kept as text.
function miniMd(t) {
  const inline = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let html = '', list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  String(t || '').replace(/\r/g, '').split('\n').forEach(line => {
    const l = line.trim();
    if (!l) { close(); return; }
    let m;
    if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); html += `<div style="font-weight:650;margin:12px 0 4px">${inline(m[1])}</div>`; }
    else if ((m = l.match(/^[-•*]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul style="margin:4px 0;padding-left:20px">'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol style="margin:4px 0;padding-left:20px">'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else { close(); html += `<div style="margin:4px 0">${inline(l)}</div>`; }
  });
  close(); return html;
}
function safeCard(h, big) { try { return aiCardHTML(h, big); } catch (e) { return `<div class="card small muted">Couldn't show this analysis (${esc(h.at || '')}).</div>`; } }
function viewAI() {
  if (!settings.aiKey) {
    $('#view').innerHTML = `<div class="card"><b>AI coach</b><div class="small muted" style="margin-top:6px">Tap Update any time and Claude looks at your recent food, weight, supplements and Garmin data, then suggests what to do next. Uses your own Claude API key (about 1–2¢ per update with Sonnet).</div>
      <button class="btn" id="aiset">Add API key</button></div>`;
    $('#aiset').onclick = () => { state.tab = 'more'; render(); setTimeout(() => { const el = $('#aik'); if (el) el.scrollIntoView({ block: 'center' }); }, 50); };
    return;
  }
  const [latest, ...older] = aiHistory;
  const spent = aiHistory.filter(h => h.at >= new Date(Date.now() - 30 * 864e5).toISOString()).reduce((a, h) => a + (h.cost || 0), 0);
  $('#view').innerHTML = `<button class="btn" id="aiup" ${aiBusy ? 'disabled' : ''}>${aiBusy ? '✦ Analyzing your data…' : '✦ Update (API, quick)'}</button>${freeBtnHTML()}
    <div class="small muted" style="text-align:center;margin:6px 0 10px">${latest ? (() => { const n = aiHistory.filter(h => h.at >= new Date(Date.now() - 30 * 864e5).toISOString()).length; return `Last 30 days: ${n} update${n === 1 ? '' : 's'} · about $${spent.toFixed(2)}`; })() : 'Looks at your last 14 days, your goal and what you have eaten today.'}</div>
    ${aiCreditHTML()}
    ${latest ? safeCard(latest, true) : '<div class="empty">No analysis yet. Tap Update.</div>'}
    ${older.length ? `<h2>Earlier</h2>${older.slice(0, 10).map(h => safeCard(h, false)).join('')}` : ''}
    <div class="small muted" style="margin:12px 4px">Sends a summary of your numbers (not photos) to Claude through your API key. Estimates, not medical advice.</div>`;
  $('#aiup').onclick = aiUpdate;
  const fb = $('#aifree'); if (fb) fb.onclick = freeAnalysis;
  if (freeState()) pollFree();
  const ab = $('#aibal'); if (ab) ab.onclick = editAiCredit;
}

// ---------- free analysis via the Claude scheduled task (uses the Claude plan, not API credit) ----------
// The app starts garmin-health's morning.yml workflow, which fires the routine's API trigger.
// The routine takes a few minutes and writes its result into ai_history.json, which we poll for.
let freeTimer = null;
function freeState() { const s = store.get('freeRun', null); return s && Date.now() - s.t < 12 * 60000 ? s : null; }
function freeBtnHTML() {
  const f = freeState();
  return `<button class="btn secondary" id="aifree" ${f ? 'disabled' : ''} style="margin-top:8px">${f ? `☀ Claude is analyzing… ${Math.max(1, Math.round((Date.now() - f.t) / 60000))} min (usually 3–5)` : '☀ Free analysis (Claude plan)'}</button>`;
}
async function freeAnalysis() {
  if (freeState()) return;
  if (!settings.ghToken) return toast('Connect GitHub in More first');
  const api = `https://api.github.com/repos/${settings.ghRepo}/actions/workflows/morning.yml`;
  const H = { Authorization: `Bearer ${settings.ghToken}`, Accept: 'application/vnd.github+json' };
  const since = new Date(Date.now() - 10000).toISOString();
  store.set('freeRun', { t: Date.now(), since }); viewAI();
  try {
    try { await syncGarminNow(() => {}); } catch (e) { }   // fresh Garmin data first, so Claude doesn't have to wait for it
    const d = await fetch(api + '/dispatches', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
    if (d.status === 403) throw new Error('Your GitHub token needs “Actions: Read and write”.');
    if (d.status === 404) throw new Error('The morning workflow is missing in garmin-health.');
    if (!d.ok) throw new Error('GitHub error ' + d.status);
    for (let i = 0; i < 25; i++) {                       // confirm the routine actually started (~10–60 s)
      await new Promise(r => setTimeout(r, 4000));
      const r = await fetch(`${api}/runs?event=workflow_dispatch&per_page=1&created=${encodeURIComponent('>=' + since)}`, { headers: H, cache: 'no-store' });
      if (!r.ok) continue;
      const run = ((await r.json()).workflow_runs || [])[0];
      if (run && run.status === 'completed') {
        if (run.conclusion !== 'success') throw new Error('Claude didn’t start. Check that the routine token is saved in GitHub (ROUTINE_FIRE_TOKEN).');
        break;
      }
    }
    toast('Claude is on it. Results in a few minutes.');
    pollFree();
  } catch (e) { store.set('freeRun', null); viewAI(); toast(e.message === 'Failed to fetch' ? 'Could not reach GitHub.' : e.message); }
}
function pollFree() {
  clearTimeout(freeTimer);
  const f = freeState(); if (!f) { freeTimer = null; return; }
  freeTimer = setTimeout(async () => {
    try { await pullAI(); } catch (e) { }
    const got = aiHistory.find(h => h.model === 'morning' && h.at > f.since);
    if (got) { store.set('freeRun', null); toast('New analysis ready'); if (state.tab === 'ai') viewAI(); if (state.tab === 'today') render(); return; }
    if (state.tab === 'ai') { const b = $('#aifree'); if (b) b.outerHTML = freeBtnHTML(); }
    pollFree();
  }, 25000);
}

async function syncAI() {
  if (!store.get('aiDirty', false)) return;
  const path = settings.ghPath.replace(/[^/]*$/, '') + 'ai_history.json';
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = await gh('GET', null, path); let sha, remoteH = [];
    if (g.ok) { const f = await g.json(); sha = f.sha; try { remoteH = JSON.parse(b64ToText(f.content || '')).history || []; } catch (e) { } }
    else if (g.status !== 404) throw new Error('AI history: GitHub error ' + g.status);
    const byAt = new Map([...remoteH, ...aiHistory].map(h => [h.at, h]));
    const merged = [...byAt.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
    const p = await gh('PUT', { message: 'Food app: AI coach history', content: textToB64(JSON.stringify({ history: merged }, null, 1) + '\n'), ...(sha ? { sha } : {}) }, path);
    if (p.status === 409 || p.status === 422) continue;
    if (!p.ok) throw new Error('AI history: GitHub error ' + p.status);
    aiHistory = merged; store.set('aiHistory', aiHistory); store.set('aiDirty', false); return;
  }
}
async function pullAI() {
  const g = await gh('GET', null, settings.ghPath.replace(/[^/]*$/, '') + 'ai_history.json', await ghHead()); if (!g.ok) return;
  try { const remoteH = JSON.parse(b64ToText((await g.json()).content || '')).history || [];
    const byAt = new Map([...aiHistory, ...remoteH].map(h => [h.at, h]));
    aiHistory = [...byAt.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30); store.set('aiHistory', aiHistory);
    if (state.tab === 'ai' && !aiBusy) viewAI(); } catch (e) { }
}
