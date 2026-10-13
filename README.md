# Houston Deaf Network (hdn)

New website build for houstondeafnetwork.com. Hand-written HTML/CSS/vanilla JS, no framework or build step.

## Structure

- `index.html` — homepage with all sections (about, resources, events, businesses, jobs, FAQ, contact)
- `styles.css` — all styling, theme variables included
- `script.js` — mobile nav, footer year, contact form handling
- `assets/` — logo files pulled from the live site

## Theming

Light and dark themes follow the visitor's OS preference via `prefers-color-scheme`, same pattern as lduongh. There is no manual toggle. Theme colors live as CSS variables at the top of `styles.css`; the dark overrides sit in the `@media (prefers-color-scheme: dark)` block. The header logo swaps between the dark and light mark the same way.

## Cache busting

Mobile browsers cache stylesheets aggressively. After changing `styles.css` or `script.js`, bump the `?v=N` query in `index.html` so visitors see fresh files.

## Contact form

Submissions go to info@houstondeafnetwork.com via FormSubmit ajax, mirroring the current live site. The first submission triggers a one-time confirmation email to that address, approve it to activate.

## Preview

Open `index.html` directly, or serve the folder (`python3 -m http.server`) for a closer match to production.
