# Cost Tracker Miami 🌴

A cutesy, Wynwood-mural-style web app for tracking what the Miami trip really costs.
You install it on your iPhone from Safari; there's no App Store involved.

## What it does

- One screen for Miami, with a **prediction** (your budget guess). Tap it to change it.
- **The crew**: Sophia, Elizabeth, Jackie and Hector. On first launch each person taps
  themselves, so "my total" is their own share.
- **Costs** record who paid and who it's split between: everyone, any mix of the crew, plus
  people outside the crew. Each share is `total ÷ people` (for example `30.95 / 2 = 15.48`).
  The amount box also does math, like `12.50+4`.
- **Kindness** is what you covered for everyone else on bills you paid.
- **Settle up** nets out who owes whom with as few payments as possible.
- **The math** shows the same `Total: … = 124.95` / `Kindness: … = 47.11` lines as a
  notes-app list, and **Share as text** sends them anywhere.
- Works offline. Data is saved on the device; use **Save backup** / **Restore** at the bottom
  to keep a copy.

## Put it on your iPhone

Open **https://hecbatista.github.io/trip-cost-tracker/** in **Safari** on your iPhone, tap **Share ⬆️**, then **Add to Home Screen**.

It opens full-screen like a normal app.

Friends can use the same link. Each phone starts empty and keeps its own costs, so nobody
sees anyone else's. Tap **Load the example list** on an empty screen to load the original
Miami notes.

## Developing

It's plain HTML/CSS/JS with no build step:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Every push to `main` is copied to the `gh-pages` branch (see `.github/workflows/deploy.yml`),
which GitHub Pages serves. When you change a file, bump `VERSION` in `sw.js` so installed
copies pick up the update.
