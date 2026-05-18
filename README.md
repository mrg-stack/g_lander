# Lander News Landing Page

Direct RSS landing page with one box per feed and the first 10 titles in each box.

## How It Works

1. `app.js` loads RSS URLs from `feeds.txt`.
2. The page fetches each feed in the browser.
3. It renders one card per source with up to 10 clickable headlines.

## Files

- `index.html`, `styles.css`, `app.js`: landing page UI and logic.
- `feeds.txt`: RSS source list (one URL per line).

## Local Run

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

## GitHub Pages

1. Push to GitHub.
2. In repository Settings -> Pages.
3. Deploy from branch `main`, folder `/ (root)`.

## Customize

- Add/remove feeds in `feeds.txt`.
- Change titles per feed in `app.js` via `TITLES_PER_FEED`.
- Adjust design in `styles.css`.

Note: Opening `index.html` as `file://` blocks network requests in most browsers. Use a local server or GitHub Pages.
