# Tablet layout checks

Run the complete viewport suite with:

```sh
npm run test:tablet
```

On a new machine, install the Playwright Chromium browser once before the first
run:

```sh
npx playwright install chromium
```

The suite covers the public pages `index.html`, `tournaments.html`, and
`apply.html`, plus the member pages `members-directory.html`,
`members-calendar.html`, `members-applications.html`, and
`members-volunteers.html`.

Every route is checked at 768×1024, 834×1194, and 1024×1366 in portrait mode.
The checks fail if either the document or body scroll width exceeds the
viewport width. The committed PNGs in `tests/tablet-baselines/` are visual
baselines for review; update them intentionally with:

```sh
npx playwright test tests/tablet-layout.spec.mjs --update-snapshots
```

The suite starts the same Python static server used by the project workflow
when port 5000 is not already in use.