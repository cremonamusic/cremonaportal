# Cremona Music Portal

Forked from the I TALK portal (`../italk-main`) and rebranded. Same architecture:
static pages on Firebase Hosting, Firebase Auth + Firestore + Storage via the v10
ESM CDN, Cloud Functions for email, Tailwind via CDN with a per-page config block.

## Before this will run

The Firebase credentials were deliberately replaced with placeholders so this
copy cannot talk to the live I TALK project. Create a Cremona Firebase project,
then replace these across the repo:

| Placeholder | Where |
|---|---|
| `REPLACE_ME_CREMONA_API_KEY` | `public/js/firebase-config.js` + 35 pages that inline their own config |
| `REPLACE_ME_SENDER_ID` | same |
| `REPLACE_ME_APP_ID` | same |
| `REPLACE_ME_MEASUREMENT_ID` | `public/js/firebase-config.js` |

```bash
grep -rl REPLACE_ME_CREMONA_API_KEY public | xargs sed -i '' 's/REPLACE_ME_CREMONA_API_KEY/<your key>/g'
```

Also update: `.firebaserc` + `firebase.json` (`cremona-portal`), the
`cremonamusic.com` domains, the reCAPTCHA site key on `index.html`, and the R2
upload worker host (`cremona-upload-worker.…workers.dev`) if you use one.

Local preview (clean URLs, no auth — interior pages will bounce to login):

```bash
node /path/to/devserver.js
```

## Branding

Palette is applied as literal hex across the per-page `tailwind.config` blocks
and inline styles — there are no CSS variables to flip.

| Token | Value | |
|---|---|---|
| primary | `#3B2A1E` | walnut — header, sidebar, headings |
| primary-container | `#C8A951` | gold — fills, active borders |
| secondary | `#7A5A16` | deep gold — links/actions, AA on cream |
| surface / background | `#FAF6EF` | cream |
| on-surface | `#2B2019` | body text |

### Logo assets (must be supplied)

Two files, saved into `public/`:

| File | Artwork | Used by |
|---|---|---|
| `public/logo.png` | horizontal — *cremona / music of STRINGS* | portal header, login page, all legacy page headers |
| `public/logo-stacked.png` | stacked — same plus 台北音樂工作室 | sidebar rail head |

**Both must have a transparent background.** The header and rail are walnut, and
the black artwork is inverted to white with `filter:invert(1)` — a white matte
would invert into a black box. If white artwork is supplied instead, delete the
`filter:invert(1)` from `#cm-header-logo` and `#cm-rail-logo` in
`js/portal-nav.js`. SVG is preferred over PNG for the rail, which renders the
stacked mark at ~168px wide.

Until these files exist the header degrades to a plain "Cremona Music" wordmark
rather than a broken-image glyph.

## Navigation

`public/js/portal-nav.js` is the single source of nav for every portal page. It
injects the walnut header and the collapsible rail, and **removes the page's own
`<header>`** — which is why the retrofit was one script tag per page rather than
30 hand-edited headers. A page only declares:

```html
<body data-portal="teacher" data-page="home">
<script src="/js/portal-nav.js?v=1" defer></script>
```

`data-portal` is inferred from the path (`/admin/*`, `/parent/*`) when absent;
`account.html` is shared by all roles and resolves from `localStorage`
`cremona-role`, written by `index.html` at login. Collapse state persists in
`localStorage` `sidebarCollapsed`. Opt a page out with `data-no-portal-nav`.

Verified: all three rails, expanded/collapsed/mobile-overlay, gold active
border, admin Sign Out.

## Known gaps

- **Comments workflow** still uses the inherited I TALK *report* flow (date
  range, structured evaluation fields, admin approve/decline). The spec wants a
  single lesson date, one free-text area, and a draft→sent lock with no
  approval step. `firestore.rules` already encodes the intended model, so the
  rules are currently stricter than the UI.
- **Not built:** `admin/announcements.html`, `parent/certificates.html`.
- **Pages kept from I TALK** that the spec does not include: `salary`,
  `payslip`, `level-tests`, `homework`, `documents`, `contract`, `certificate`,
  `guide`, `admin/{salary,payments,billing}-admin`, `parent/payments`. They are
  rebranded and still work, but are dropped from the sidebar. Some page content
  still links to them. Delete them if Cremona does not want them.
- **Email templates** (`functions/emailTemplates.js`) still carry Korean
  alongside English — Cremona needs English + Traditional Chinese instead.
- `firestore.rules` was structurally checked only; it has not been deployed or
  run against the emulator.
