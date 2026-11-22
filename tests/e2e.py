"""End-to-end tests for the Food log app.

Runs the app in headless Chrome (phone-sized), with GitHub and Open Food Facts
mocked, and synthetic data only (this repo is public: never commit real data).

    pip install playwright && python -m playwright install chromium
    python tests/e2e.py            # or: python tests/e2e.py --chrome /usr/bin/google-chrome

Exits non-zero on the first failure. Screenshots go to /tmp/food-log-shots/.
"""
import asyncio, base64, json, os, random, socket, subprocess, sys, threading, time
from datetime import date, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = '/tmp/food-log-shots'
CHROME = sys.argv[sys.argv.index('--chrome') + 1] if '--chrome' in sys.argv else None
H = {'Access-Control-Allow-Origin': '*'}
TOKEN = 'github_pat_' + 'T' * 82
TODAY = date.today()
D = lambda n: (TODAY - timedelta(days=n)).isoformat()


def fixtures():
    rnd = random.Random(7)
    food = ['date,time,meal,description,calories,protein_g,carbs_g,fat_g,caffeine_mg,alcohol_drinks,source,notes']
    for n in range(1, 30):
        late = n % 4 == 0
        food.append(f'{D(n)},08:30,breakfast,"oatmeal with milk, 1 bowl (~300 g)",350,14,55,8,0,0,text,')
        food.append(f'{D(n)},{"22:15" if late else "19:00"},dinner,"chicken rice bowl, 1 bowl",{700 + rnd.randint(-100, 100)},{40 + n % 3 * 10},70,20,0,{1 if n % 5 == 0 else 0},photo,')
        if n % 3 == 0:
            food.append(f'{D(n)},15:30,drink,"latte, medium",180,11,17,7,130,0,text,')
    food.append(f'{D(0)},12:00,lunch,"spaghetti with lean ground lamb and carrots, 1 bowl (~300 g: ~150 g pasta, ~75 g lamb)",505,29,52,20,0,0,photo,"test row"')
    cols = 'date,sleep_score,sleep_hours,deep_h,light_h,rem_h,awake_h,sleep_start,sleep_end,sleep_avg_hr,sleep_avg_stress,awake_count,hrv_last_night,hrv_weekly_avg,hrv_status,hrv_baseline_low,hrv_baseline_high,resting_hr,min_hr,max_hr,avg_stress,max_stress,body_battery_high,body_battery_low,body_battery_charged,body_battery_drained,steps,distance_km,floors,active_kcal,total_kcal,intensity_min_moderate,intensity_min_vigorous,respiration_avg,spo2_avg'
    daily = [cols]
    for n in range(400, -1, -1):
        d = D(n); late_prev = (n + 1) % 4 == 0
        score = 60 + rnd.randint(0, 25) - (12 if late_prev else 0)
        daily.append(f'{d},{score},{6.5 + rnd.random():.2f},1.5,4.0,1.0,0.3,{D(n + 1)} 23:30,{d} 07:00,58,16,1,{38 + rnd.randint(0, 8) - (6 if (n + 1) % 5 == 0 else 0)},40,BALANCED,37,47,{54 + rnd.randint(0, 3)},50,150,25,90,{60 + rnd.randint(0, 30)},{10 + rnd.randint(0, 10)},50,50,{rnd.randint(3000, 12000)},5.0,8,{rnd.randint(150, 600)},{2100 + rnd.randint(0, 400) if n else 1400},{rnd.randint(0, 30)},{rnd.randint(0, 15)},15,95')
    weight = ['date,time,weight_kg,body_fat_pct,source,notes'] + [f'{D(n)},08:00,{70 - (21 - n) * 0.03:.2f},16,manual,' for n in range(21, -1, -3)]
    acts = ['activity_id,date,start_local,name,type,duration_min,distance_km,avg_hr,max_hr,kcal,aerobic_te,anaerobic_te,training_load,hr_z1_min,hr_z2_min,hr_z3_min,hr_z4_min,hr_z5_min']
    for n in range(0, 60, 2):
        acts.append(f'{1000 + n},{D(n)},{D(n)} 18:00,Test Run,running,30,5,150,170,300,3.0,1.0,60,1,5,10,10,4')
    import json, math
    T = list(range(0, 1800, 10))
    run = {'id': 1000, 'name': 'Test Run', 'type': 'running', 'start': f'{D(0)} 18:00', 'duration_s': 1800, 'moving_s': 1700, 'distance_m': 5000,
           'kcal': 300, 'avg_hr': 150, 'max_hr': 170, 'avg_speed': 2.78, 'elev_gain': 20, 'elev_loss': 20, 'cadence': 160, 'stride_cm': 100, 'gct_ms': 260,
           'vert_osc_cm': 8.1, 'vert_ratio': 8.2, 'avg_power': 250, 'max_power': 400, 'aerobic_te': 3.0, 'anaerobic_te': 1.0, 'te_label': 'TEMPO',
           'aerobic_msg': 'IMPACTING_TEMPO_22', 'anaerobic_msg': 'NO_ANAEROBIC_BENEFIT_0', 'load': 60, 'body_battery': -9, 'water_ml': 400,
           'hr_zones_s': [60, 300, 600, 600, 240], 'power_zones_s': [300, 300, 600, 400, 200], 'fastest_1k_s': 330, 'rpe': 70, 'min_hr': 95,
           'run_walk': [{'kind': 'run', 'count': 3, 'duration_s': 1500, 'distance_m': 4500}, {'kind': 'walk', 'count': 3, 'duration_s': 300, 'distance_m': 500}],
           'workout': {'name': 'Base', 'steps': [{'intensity': 'INTERVAL', 'type': 'TIME', 'value': 1800, 'target': 'HEART_RATE', 'low': 137, 'high': 164}]},
           'km_splits': [{'km': k, 'time_s': 350 + k * 3, 'avg_hr': 145 + k} for k in range(1, 6)],
           'chart': {'t': T, 'd': [t * 2.78 for t in T], 'hr': [140 + (t // 10) % 25 for t in T], 'spd': [2.6 + 0.3 * math.sin(t / 100) for t in T],
                     'ele': [150 + 5 * math.sin(t / 300) for t in T], 'cad': [160] * len(T), 'pwr': [250] * len(T), 'bb': [60 - t // 200 for t in T]},
           'route': [[43.70 + 0.004 * math.cos(i / 10), -79.25 + 0.006 * math.sin(i / 10)] for i in range(63)]}
    gym = {'id': 1002, 'name': 'Strength', 'type': 'running', 'start': f'{D(2)} 18:00', 'duration_s': 900, 'kcal': 90, 'avg_hr': 130, 'total_sets': 6, 'total_reps': 60,
           'sets': [{'exercise': 'PUSH_UP', 'sets': 3, 'reps': 35}, {'exercise': 'ROW', 'sets': 3, 'reps': 25, 'max_kg': 5.0}, {'exercise': 'PLANK', 'sets': 3, 'reps': 0, 'duration_s': 155}]}
    extra = {'data/activities/1000.json': json.dumps(run), 'data/activities/1002.json': json.dumps(gym)}
    return {**extra, 'data/food.csv': '\n'.join(food) + '\n', 'data/daily.csv': '\n'.join(daily) + '\n',
            'data/weight.csv': '\n'.join(weight) + '\n', 'data/activities.csv': '\n'.join(acts) + '\n'}


class Repo:
    def __init__(self): self.files = {k: {'text': v, 'sha': 'a0'} for k, v in fixtures().items()}; self.puts = []

    async def route(self, route):
        req = route.request
        if req.headers.get('authorization') != f'Bearer {TOKEN}' and req.method != 'OPTIONS':
            return await route.fulfill(status=401, headers=H, body='{}')
        if '/actions/' in req.url:
            if req.method == 'POST': self.dispatches = getattr(self, 'dispatches', 0) + 1; return await route.fulfill(status=204, headers=H, body='')
            if req.method == 'GET': return await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'workflow_runs': [{'status': 'completed', 'conclusion': 'success'}]}))
            return await route.fulfill(status=204, headers={**H, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'})
        path = req.url.split('/contents/')[1].split('?')[0]; f = self.files.get(path)
        if req.method == 'GET':
            if not f: return await route.fulfill(status=404, headers=H, body='{}')
            return await route.fulfill(status=200, content_type='application/json', headers=H,
                                       body=json.dumps({'content': base64.b64encode(f['text'].encode()).decode(), 'sha': f['sha']}))
        if req.method == 'PUT':
            b = json.loads(req.post_data)
            if f and b.get('sha') != f['sha']: return await route.fulfill(status=409, headers=H, body='{}')
            self.files[path] = {'text': base64.b64decode(b['content']).decode(), 'sha': f'p{len(self.puts)}'}; self.puts.append(path)
            return await route.fulfill(status=200, content_type='application/json', headers=H, body='{}')
        await route.fulfill(status=204, headers={**H, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'})

    def rows(self, path, marker='app:'): return [l for l in self.files.get(path, {'text': ''})['text'].splitlines() if marker in l]


CLAUDE_CALLS = []
async def claude(route):
    req = route.request
    if req.method == 'OPTIONS':
        return await route.fulfill(status=204, headers={**H, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'})
    if req.headers.get('x-api-key') != 'sk-ant-' + 'k' * 40:
        return await route.fulfill(status=401, content_type='application/json', headers=H, body=json.dumps({'error': {'message': 'invalid x-api-key'}}))
    CLAUDE_CALLS.append(json.loads(req.post_data))
    out = {'headline': 'Protein is your gap', 'summary': 'You averaged 68 g protein.', 'next': ['Add Greek yogurt', 'Strength session', 'Bed by 12'], 'food_idea': 'Chicken bowl ~600 kcal, 45 g protein', 'watch': 'Sleep under 6 h'}
    await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'content': [{'type': 'tool_use', 'id': 't1', 'name': 'coach_report', 'input': out}], 'usage': {'input_tokens': 5000, 'output_tokens': 700}}))


async def off(route):
    await route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'status': 1, 'product': {
        'product_name': 'Greek Yogurt 0%', 'brands': 'Testbrand', 'serving_size': '175 g', 'serving_quantity': 175, 'quantity': '650 g', 'product_quantity': 650,
        'nutriments': {'energy-kcal_100g': 57, 'proteins_100g': 10, 'carbohydrates_100g': 4, 'fat_100g': 0}}}))


def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    httpd = ThreadingHTTPServer(('127.0.0.1', port), partial(type('Q', (SimpleHTTPRequestHandler,), {'log_message': lambda *a: None}), directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f'http://localhost:{port}/', httpd


def check(cond, msg):
    if not cond: raise AssertionError(msg)
    print('  ✓', msg)


async def device(browser, repo, url, scheme='light', token=True):
    ctx = await browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme=scheme)
    await ctx.route('https://api.github.com/**', repo.route); await ctx.route('https://world.openfoodfacts.org/**', off); await ctx.route('https://api.anthropic.com/**', claude)
    pg = await ctx.new_page(); pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    await pg.goto(url); await pg.wait_for_timeout(300)
    if token:
        await tab(pg, 'more'); await pg.fill('#gt', TOKEN); await pg.click('#gsave'); await pg.wait_for_timeout(2500)
    return ctx, pg


async def tab(pg, name): await pg.click(f'#tabs button[data-t={name}]'); await pg.wait_for_timeout(250)


async def add_food(pg, query, qty=None, serving=False, pct=None, meal=None):
    await tab(pg, 'add'); await pg.fill('#s', query); await pg.click('#res .item[data-id]')
    if serving: await pg.click('#seg button[data-m=serving]')
    if qty is not None: await pg.fill('#q', str(qty))
    if pct: await pg.click(f'#pct button[data-p="{pct}"]')
    if meal: await pg.select_option('#m', meal)
    await pg.click('#go'); await pg.wait_for_timeout(200)


SWIPE_JS = """([sel, dx, dy]) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 200);
  const mk = (cx, cy) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
  el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(x, y)], changedTouches: [mk(x, y)], bubbles: true }));
  for (let i = 1; i <= 5; i++) el.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(x + dx * i / 5, y + dy * i / 5)], changedTouches: [mk(x + dx * i / 5, y + dy * i / 5)], bubbles: true }));
  el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(x + dx, y + dy)], bubbles: true })); }"""


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    url, httpd = serve()
    async with async_playwright() as p:
        browser = await p.chromium.launch(**({'executable_path': CHROME} if CHROME else {}), args=['--no-sandbox'])
        repo = Repo()

        print('Setup and sync')
        ctx, pg = await device(browser, repo, url)
        check('data/food_library.json' in repo.files, 'library backed up on first connect')
        await tab(pg, 'today'); await pg.wait_for_timeout(500)
        check(await pg.locator('#view .item', has_text='via Claude').count() >= 1, 'entries logged via Claude appear on Today')
        check('Spaghetti with lean ground lamb and carrots' in await pg.inner_text('#view'), 'Claude entry has a clean title')

        print('Logging')
        await add_food(pg, 'egg', 3, meal='breakfast'); await add_food(pg, 'cheese', 1, serving=True, meal='breakfast')
        await tab(pg, 'add'); await pg.fill('#s', 'activia'); await pg.click('#res .item[data-id]'); await pg.click('#pack'); await pg.click('#pct button[data-p="25"]')
        check((await pg.inner_text('#pv')).startswith('150 kcal'), 'whole pack × 25% = 150 kcal')
        await pg.click('#go'); await pg.wait_for_timeout(2500)
        check(len(repo.rows('data/food.csv')) == 3, 'app entries synced to food.csv')
        await pg.click('#view .item:has-text("Activia")'); await pg.fill('#ep', '50'); await pg.click('#sv'); await pg.wait_for_timeout(2500)
        check(any('50% of 650 g' in r and ',299,' in r for r in repo.rows('data/food.csv')) and len(repo.rows('data/food.csv')) == 3, 'edit updates the same row (no duplicate)')
        await tab(pg, 'add'); await pg.click('#quick'); await pg.fill('#nm', 'Shawarma plate'); await pg.fill('#k', '850'); await pg.click('#go'); await pg.wait_for_timeout(200)
        await pg.click('#view .item:has-text("Shawarma")'); await pg.click('#del'); await pg.wait_for_timeout(2500)
        check(not any('Shawarma' in r for r in repo.rows('data/food.csv')), 'delete removes the row')
        await pg.click('[data-save=breakfast]'); await pg.fill('#nm', 'Egg breakfast'); await pg.click('#sv'); await pg.wait_for_timeout(300)
        await tab(pg, 'add'); await pg.click('#res .item[data-meal]'); await pg.click('input[data-i="1"]'); await pg.click('#go'); await pg.wait_for_timeout(200)
        check(await pg.locator('#view .item', has_text='Egg').count() == 2, 'saved meal logs selected items')
        await tab(pg, 'add'); await pg.fill('#s', 'spaghetti')
        check(await pg.locator('#res .item[data-log]').count() >= 1, 'foods from the log are searchable in Add')
        await pg.click('#res .item[data-log]'); await pg.click('#go'); await pg.wait_for_timeout(200)
        check(any('Spaghetti' in f['name'] for f in await pg.evaluate("JSON.parse(localStorage['fl.foods'])")), 'picking a logged food saves it to My foods')

        print('Barcode')
        await tab(pg, 'add'); await pg.click('#scan'); await pg.fill('#bc', '0123456789012'); await pg.click('#bcgo'); await pg.wait_for_timeout(800)
        check('Open Food Facts' in await pg.inner_text('.sheet'), 'unknown barcode is looked up')
        await pg.click('#sv'); await pg.wait_for_timeout(300); await pg.click('#xclose')
        await tab(pg, 'add'); await pg.click('#scan'); await pg.fill('#bc', '123456789012'); await pg.click('#bcgo'); await pg.wait_for_timeout(500)
        check('Greek Yogurt' in await pg.inner_text('.sheet h3'), 'known barcode opens the saved food')
        await pg.click('#xclose')

        print('Supplements')
        await tab(pg, 'today'); await pg.click('#suppedit'); await pg.fill('#sn', 'Vitamin D'); await pg.fill('#sd', '1000 IU'); await pg.click('#sa'); await pg.click('#sdone')
        await pg.click('[data-supp] >> nth=0'); await pg.wait_for_timeout(2500)
        check(len(repo.rows('data/supplements.csv')) == 1, 'supplement tick synced')

        print('UI shortcuts')
        check(await pg.locator('#tabs button svg').count() == 6, 'tab bar uses drawn icons')
        await tab(pg, 'today'); await pg.click('[data-addm=lunch] >> nth=0')
        check('Lunch' in await pg.inner_text('#dlabel'), '＋ Lunch opens Add for lunch')
        await pg.fill('#s', 'banana'); await pg.click('#res .item[data-id]')
        check(await pg.input_value('#m') == 'lunch', 'meal preselected as lunch'); await pg.click('#go'); await pg.wait_for_timeout(200)
        check(await pg.locator('h2:has-text("Lunch") + .list .item', has_text='Banana').count() == 1, 'banana landed in lunch')
        await tab(pg, 'more')
        check(await pg.locator('#connedit').count() == 1, 'More shows compact "Connected" card')

        print('Gestures')
        await tab(pg, 'today'); await pg.evaluate(SWIPE_JS, ['#view', 150, 5]); await pg.wait_for_timeout(800)
        check(await pg.inner_text('#dlabel') == 'Yesterday', 'swipe right goes to yesterday')
        await pg.evaluate(SWIPE_JS, ['#view', -150, 5]); await pg.wait_for_timeout(800)
        check(await pg.inner_text('#dlabel') == 'Today', 'swipe left comes back to today')
        await pg.click('#wlog'); await pg.evaluate(SWIPE_JS, ['.sheet h3', 0, 200]); await pg.wait_for_timeout(400)
        check(await pg.locator('#bd').count() == 0, 'swiping a panel down closes it')
        check('user-scalable=no' in await pg.get_attribute('meta[name=viewport]', 'content'), 'zoom disabled')

        print('Weigh-in')
        before = repo.files['data/weight.csv']['text'].splitlines()
        await tab(pg, 'today'); await pg.click('#wlog'); await pg.fill('#wk', '69.5'); await pg.click('#wsv'); await pg.wait_for_timeout(2500)
        after = repo.files['data/weight.csv']['text'].splitlines()
        check(after[:len(before)] == before and len(after) == len(before) + 1 and 'app:' in after[-1] and ',69.50,' in after[-1], 'weigh-in appended to weight.csv, other rows untouched')
        check('69.5 kg' in await pg.inner_text('#wlog'), 'Today shows the weigh-in')

        print('Blood pressure')
        await pg.click('#bplog'); await pg.fill('#s1', '118'); await pg.fill('#d1', '76'); await pg.fill('#p1', '70'); await pg.fill('#s2', '116'); await pg.fill('#d2', '72'); await pg.click('#bpsv'); await pg.wait_for_timeout(2500)
        bp = repo.files.get('data/bp.csv', {'text': ''})['text'].splitlines()
        check(len(bp) == 2 and bp[0].startswith('date,time,period,systolic_1') and ',118,76,70,116,72,' in bp[1] and 'app:' in bp[1], 'BP saved to bp.csv with header')
        check('117/74' in await pg.inner_text('#bplog'), 'Today shows the BP average')

        print('Sync from Garmin button')
        await tab(pg, 'health'); await pg.wait_for_timeout(500); await pg.click('#gsync'); await pg.wait_for_timeout(3500)
        check(getattr(repo, 'dispatches', 0) >= 1, 'Sync button starts the Garmin workflow')
        if await pg.locator('[data-act]').count():
            await pg.click('[data-act="0"]'); await pg.wait_for_timeout(400)
            await pg.wait_for_timeout(1200)
            sh = pg.locator('.sheet')
            check(await sh.locator('text=Splits').count() == 1 and await sh.locator('.wkmap').count() == 1, 'workout details show route and splits')
            check(await sh.locator('svg[data-wk]').count() >= 4, 'workout details show charts')
            box = await sh.locator('svg[data-wk="hr"]').bounding_box()
            await pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + 40); await pg.mouse.down(); await pg.wait_for_timeout(150)
            check('bpm' in await sh.locator('#wkl-hr').inner_text(), 'touching a chart shows the value'); await pg.mouse.up()
            check(await sh.locator('text=of the time in your target').count() == 1, 'planned workout target shown')
            await pg.click('#xclose'); await pg.wait_for_timeout(400)
            await pg.click('[data-act="1"]'); await pg.wait_for_timeout(1200)
            check(await pg.locator('.sheet:has-text("Exercises"):has-text("Push up")').count() == 1, 'strength workout shows exercises')
            await pg.click('#xclose'); await pg.wait_for_timeout(400)
        else: print('  (no workouts in mock data, detail test skipped)')
        await tab(pg, 'today'); await pg.wait_for_timeout(300)

        print('Edit and delete entries logged via Claude')
        await pg.click('#view .item:has-text("Spaghetti with lean ground lamb and carrots"):has-text("via Claude")'); await pg.click('#redit')
        await pg.click('#rp button[data-p="50"]'); await pg.click('#rsv'); await pg.wait_for_timeout(2500)
        row = [l for l in repo.files['data/food.csv']['text'].splitlines() if 'spaghetti with lean ground lamb' in l][0]
        check('(ate 50%)' in row and ',253,' in row and 'edited in food app' in row, 'edit changes the matching food.csv row')
        n0 = len(repo.files['data/food.csv']['text'].splitlines())
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await tab(pg, 'today'); await pg.click('#view .item:has-text("Spaghetti with lean ground lamb and carrots"):has-text("via Claude")'); await pg.click('#rdel'); await pg.wait_for_timeout(2500)
        check(len(repo.files['data/food.csv']['text'].splitlines()) == n0 - 1 and not any('spaghetti with lean ground lamb' in l for l in repo.files['data/food.csv']['text'].splitlines()), 'delete removes only that row')

        print('AI coach')
        await tab(pg, 'ai')
        check(await pg.locator('#aiset').count() == 1, 'AI tab asks for a key first')
        await tab(pg, 'more'); await pg.fill('#aik', 'sk-ant-bad' + 'x' * 30); await pg.click('#aisv'); await tab(pg, 'ai'); await pg.click('#aiup'); await pg.wait_for_timeout(8000)
        check(await pg.locator('.aimain').count() == 0, 'rejected key shows no analysis')
        await tab(pg, 'more'); await pg.fill('#aik', 'sk-ant-' + 'k' * 40); await pg.click('#aisv'); await tab(pg, 'ai'); await pg.click('#aiup'); await pg.wait_for_timeout(9000)
        check('Protein is your gap' in await pg.inner_text('.aimain') and '1.7¢' in await pg.inner_text('.aimain'), 'Update shows analysis with cost')
        ctxt = CLAUDE_CALLS[-1]['messages'][0]['content']
        check('LAST 14 DAYS' in ctxt and 'GOAL' in ctxt and CLAUDE_CALLS[-1]['model'] == 'claude-sonnet-5-5' and CLAUDE_CALLS[-1]['tools'][0]['name'] == 'coach_report' and CLAUDE_CALLS[-1]['tool_choice']['type'] == 'auto', 'request includes goal, 14 days of data, Sonnet, report tool')
        await pg.wait_for_timeout(2500)
        check('data/ai_history.json' in repo.files and 'Protein is your gap' in repo.files['data/ai_history.json']['text'], 'AI history synced to repo')
        check('sk-ant' not in json.dumps(repo.files), 'API key never written to the repo')
        bad = {'at': '2026-01-01T10:00:00Z', 'model': 'claude-sonnet-5-5', 'cost': 0.01, 'data': {'1': 'Second step', 'headline': 'Odd shape', 'summary': 'S', 'next': '\n<parameter name="0">First step'}}
        await pg.evaluate("h => { const a = JSON.parse(localStorage['fl.aiHistory']); a.push(h); localStorage['fl.aiHistory'] = JSON.stringify(a); }", bad)
        await pg.reload(); await pg.wait_for_timeout(500); await tab(pg, 'ai')
        txt = await pg.inner_text('#view')
        morning = {'at': '2026-01-02T13:44:00Z', 'model': 'morning', 'cost': 0, 'data': {'headline': 'Green day', 'summary': 'Slept well.', 'next': ['Strength 30 min'], 'full': '## Analysis\n- **Recovery** good\n- HRV 44'}}
        await pg.evaluate("h => { const a = JSON.parse(localStorage['fl.aiHistory']); a.push(h); localStorage['fl.aiHistory'] = JSON.stringify(a); }", morning)
        await pg.reload(); await pg.wait_for_timeout(500); await tab(pg, 'ai')
        await pg.click('summary:has-text("Show full analysis")')
        txt2 = await pg.inner_text('#view')
        check('Morning analysis · free' in txt2 and 'Recovery' in txt2 and '**' not in txt2, 'morning analysis shows as free with expandable full text')
        check('Odd shape' in txt and 'First step' in txt and 'Second step' in txt and '<parameter' not in txt, 'oddly shaped AI answers still display as a list')

        print('Targets and Today burn')
        await tab(pg, 'more')
        check(await pg.locator('#tgsugg').count() == 1, 'suggested targets shown')
        await pg.select_option('#goal', 'lose0.25'); await pg.click('#tgapply'); await pg.wait_for_timeout(200)
        s = await pg.evaluate("JSON.parse(localStorage['fl.settings'])")
        check(1500 < s['kcal'] < 2400 and 100 < s['protein'] < 160, f"targets applied ({s['kcal']} kcal, {s['protein']} g)")
        await tab(pg, 'today')
        check('burn' in (await pg.inner_text('#view')).lower(), 'Today shows expected burn')

        print('Other device')
        ctx2, pg2 = await device(browser, repo, url)
        await tab(pg2, 'today'); await pg2.wait_for_timeout(500)
        check(await pg2.locator('#view .item', has_text='other device').count() >= 1, 'second device shows first device entries')
        check(any(f['name'] == 'Egg breakfast' for f in await pg2.evaluate("JSON.parse(localStorage['fl.meals']||'[]')")), 'second device restored saved meals')

        print('Screens render (light and dark)')
        for scheme in ['light', 'dark']:
            c3, p3 = await device(browser, repo, url, scheme)
            for t, ranges in [('stats', ['w', 'lw', '30']), ('health', ['7', '30', '90', '365'])]:
                await tab(p3, t); await p3.wait_for_timeout(1200)
                for r in ranges:
                    await p3.click(f'#{"rng" if t == "stats" else "hr"} button[data-r="{r}"]'); await p3.wait_for_timeout(200)
                    await p3.screenshot(path=f'{SHOTS}/{t}-{r}-{scheme}.png', full_page=True)
            await tab(p3, 'stats'); await p3.click('#rng button[data-r="30"]'); await p3.wait_for_timeout(200)
            check(await p3.locator('#insights').count() == 1, f'insights card shown ({scheme})')
            for t in ['today', 'add', 'more']:
                await tab(p3, t); await p3.screenshot(path=f'{SHOTS}/{t}-{scheme}.png', full_page=True)
            check(not p3.errors, f'no script errors ({scheme})'); await c3.close()

        print('Offline')
        await pg.reload(); await pg.wait_for_timeout(1500); await ctx.set_offline(True)
        await pg.reload(wait_until='domcontentloaded'); await pg.wait_for_timeout(800)
        check(await pg.locator('#tabs button').count() == 6, 'app loads offline')
        check(not pg.errors and not pg2.errors, 'no script errors on devices')
        await browser.close()
    httpd.shutdown(); print('\nAll tests passed.')

if __name__ == '__main__':
    asyncio.run(main())
