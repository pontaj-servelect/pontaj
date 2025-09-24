
# Timesheet – GPS Logger (GitHub Pages)

A static site that logs Start/Finish with precise GPS into a **Google Sheet** via **Google Forms**.
Works on any device over HTTPS (GitHub Pages).

## Files
- `index.html` – Mobile-friendly UI with GPS + hidden Google Forms submit
- `config.json` – Put your Form `formResponse` URL and `entry.xxxxx` IDs here
- `assets/favicon.png` – Optional favicon

## Configure (one time)
1. Create a Google Form with these short-answer fields (exact names don’t matter):
   - Action, Timestamp, Latitude, Longitude, Accuracy(m), Device, Notes, MapsLink
2. Link the form to a Google Sheet (Responses → green Sheets icon).
3. Open the **live form** (eye icon). View source (or inspect) to find:
   - The `<form action=".../formResponse">` URL → copy it.
   - Each input’s `name="entry.xxxxxxxx"` → copy IDs for each field.
4. Edit `config.json` and replace:
   - `"formAction"` with your formResponse URL
   - `"fields"` values with the corresponding `entry.xxxxxxxx` IDs

## Deploy to GitHub Pages
1. Create a new repo on GitHub (e.g., `timesheet-gps`).
2. Upload `index.html`, `config.json`, and the `assets` folder to the repo root.
3. In the repo: Settings → Pages →
   - **Source:** Deploy from a branch
   - **Branch:** `main` (or `master`) / root
4. Wait for Pages to build; your site is served at `https://<your-user>.github.io/<repo>/`

## Use
- Open your GitHub Pages URL on your phone.
- Allow location when prompted.
- Tap **Start** / **Finish**. Data is submitted to the Google Form and appears in your linked Sheet.

## Troubleshooting
- If buttons do nothing: make sure you’re on the HTTPS GitHub Pages URL (not a local file).
- If rows don’t appear: double-check `config.json` values (form action + entry IDs).
- If your form requires login to respond, either stay logged in or configure form to accept responses from anyone with the link.
