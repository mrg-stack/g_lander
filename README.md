# G Lander

A lightweight personal start page with:

- Circular quick-launch links.
- Automatic favicon loading for links without custom icons.
- A DuckDuckGo search bar.

RSS feed functionality is no longer part of this project.

## Files

- `index.html`: page structure and links.
- `styles.css`: visual style, layout, and responsiveness.
- `app.js`: search focus behavior and favicon loading.

## Local Run

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

## Customize

- Add, remove, or reorder launcher links in `index.html`.
- Tweak spacing, colors, and breakpoints in `styles.css`.
- Adjust interaction behavior in `app.js`.
