# Food log

An offline food and calorie log for iPhone. Open the page in Safari, then Share → **Add to Home Screen**.

- Your entries and food library are stored only on your phone (no data in this repo).
- Barcode scanning looks products up in [Open Food Facts](https://world.openfoodfacts.org).
- Optional auto-sync writes entries to a CSV in a private GitHub repo using a token you paste into the app. The token is kept on the phone only.

Barcode scanning uses [html5-qrcode](https://github.com/mebjas/html5-qrcode) (Apache-2.0, see `vendor/`).

## Code

- `js/core.js`: storage, seed library, state, helpers, sheets, tab bar
- `js/sync.js`: CSV export and GitHub sync
- `js/food.js`: Today, Add, supplements, saved meals, My foods, barcode
- `js/stats.js`: Stats tab, targets model, food and health patterns, Garmin pull
- `js/health.js`: Health tab
- `js/home.js`: Home tab (scores, coaching, activity status, Health Monitor, Cardio Load, Timeline)
- `js/pages.js`: detail pages from Home (Strain, Recovery, Sleep, Stress, Energy Bank), metric sheets, Cardio/Muscular Load, Journal Insights, sleep need, workout Cardio Focus
- `js/more.js`: settings, targets, export, backup
- `js/main.js`: boot

Run `python tests/e2e.py` before every release (see the file for setup). Bump `CACHE` in `sw.js` when files change.
