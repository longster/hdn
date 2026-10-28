# Form wiring: FormSubmit -> Cloudflare Worker

Apply these changes when the Worker is deployed and the Notion
integration is live. Until then the FormSubmit path stays as-is.
No DNS change is needed for this step.

## 1. index.html, the form (around line 179)

Replace the FormSubmit action with the Worker URL, and add the
honeypot field. The honeypot is visually hidden but NOT
`display: none`, so bots that ignore CSS still see it, while screen
readers skip it via `aria-hidden` and `tabindex="-1"`.

BEFORE:
```html
<form class="contact-form" id="contact-form" action="https://formsubmit.co/ajax/info@houstondeafnetwork.com" method="POST">
```

AFTER:
```html
<form class="contact-form" id="contact-form" action="https://hdn-submit.YOUR-SUBDOMAIN.workers.dev" method="POST">
```

Add this inside the form, right after the opening tag:
```html
<label class="hp-field" aria-hidden="true">Company<input type="text" name="mx_check" tabindex="-1" autocomplete="off"></label>
```

Delete this line (FormSubmit-only hidden field):
```html
<input type="hidden" name="_subject" value="New HDN website submission">
```

Update the comment above the form to point here instead of FormSubmit.

## 2. styles.css, add the honeypot rule

```css
.hp-field {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
```

## 3. script.js, the submit handler (around line 425)

Change the comment, then change the fetch body so the honeypot is
sent but the FormSubmit-only fields are not. The double-submit guard,
the "Sending..." state, the success text, and the error text all stay
exactly as they are.

BEFORE:
```js
// ---------- contact form via FormSubmit ajax ----------
```

AFTER:
```js
// ---------- contact form via Cloudflare Worker -> Notion ----------
// Fallback: if the Worker is ever down, swap form.action back to the
// FormSubmit URL (see git history) and this handler works unchanged.
```

The fetch call itself needs no change: it already POSTs JSON built
from `new FormData(form)`, which now includes `mx_check` (honeypot),
`name`, `email`, `listing_type`, and `message`. The Worker reads
exactly those fields.

## 4. Cache bumps

Bump `?v=` on styles.css and script.js in index.html after these edits,
and verify the new versions live before announcing the switch.

## Fallback

If the Worker ever fails in production, the one-line revert is:
set `form.action` back to
`https://formsubmit.co/ajax/info@houstondeafnetwork.com` and remove
the honeypot label. Submissions go back to email until the Worker is
fixed. Nothing else changes.
