# Trip Cost Tracker 🌴

A cutesy, Wynwood-mural-style web app for tracking what a trip really costs.
You install it on your iPhone from Safari; there's no App Store involved.

## What it does

- **Trips** with a name, emoji, and a **prediction** (your budget guess).
- **Costs** with a bill total and how many people split it. Your share is `total ÷ people`
  (for example `30.95 / 2 = 15.48`). The amount box also does math, like `12.50+4`.
- **Kindness** is what you covered for your crew: everyone else's share when you paid a
  split bill, plus any "treat for someone" costs.
- **The math** shows the same `Total: … = 124.95` / `Kindness: … = 47.11` lines as a
  notes-app list, and **Share as text** sends them anywhere.
- Works offline. Data is saved on the device; use **Save backup** / **Restore** on the trips
  screen to keep a copy.

## Put it on your iPhone

1. On GitHub, go to **Settings → Pages**. Under **Build and deployment**, choose
   **Deploy from a branch**, then pick `main` and `/ (root)`. Save.
2. After about a minute, the site is live at `https://<your-username>.github.io/trip-cost-tracker/`.
3. Open that link in **Safari** on your iPhone, tap **Share ⬆️**, then **Add to Home Screen**.

It opens full-screen like a normal app.

## Developing

It's plain HTML/CSS/JS with no build step:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

When you change a file, bump `VERSION` in `sw.js` so installed copies pick up the update.
