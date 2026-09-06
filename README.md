# Life Calendar

Static GitHub Pages calendar/tracker.

## Files
- `index.html` — page structure
- `style.css` — styling and responsive layout
- `app.js` — calendar, filters, selected-day editing and overdue calculation
- `data.json` — initial database

## GitHub Pages
Upload all four files to a repository and enable **Settings → Pages → Deploy from a branch**.

## Data editing
GitHub Pages cannot write changes back into `data.json` from the browser because it is a static site. The Save button therefore stores changes in the browser's `localStorage`.

To permanently update the shared JSON file, edit `data.json` in the repository and commit the change. The JSON dates are automatically sorted by the app whenever a selected-day change is saved locally.

## Frequency
The initial `Csere` frequencies are:
- Ágynemű: 14 days
- Kilépők: 21 days
- Vízszűrő csere: 30 days
- bobby szűrő csere: 30 days
- Viráglocsolás: 7 days
- Mosógép szűrő tisztítás: 30 days
- Mosógép tisztítás: 30 days
- Mosogatógép tisztítás: 14 days

The other items have no frequency because none was specified.
