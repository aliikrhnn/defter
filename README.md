# Defter

A personal debt and receivable ledger. Who owes you, what you owe, and what is left after
each partial payment — mobile-first, offline-capable, and written in vanilla HTML, CSS and
JavaScript with no build step and no framework.

*Defter* is Turkish for the paper ledger a shopkeeper keeps under the counter. This is
that, with the arithmetic done for you.

## Features

- People and their running balance, both directions
- Transactions with partial payments, and a full history per person
- Works offline — `localStorage` is the working copy, the cloud is the sync target
- Cross-device sync through Supabase: every change is pushed, and pulled on load and on
  tab focus (last write wins)
- Installable as a PWA, with a service worker and web manifest
- Undo, and a versioned local schema that migrates forward on upgrade

## Architecture

```
index.html              Ledger view, person detail, dialogs
giris.html              Login
css/style.css           Design tokens, components, animations
js/store.js             Data layer — localStorage, versioned schema, undo
js/                     Views, sync, auth
sw.js                   Service worker
manifest.webmanifest    PWA manifest
```

**Local first, cloud second.** Writes land in `localStorage` immediately and the UI never
waits on the network. Sync runs afterwards; when the device is offline, changes queue and
flush on reconnect. Users on a phone with poor signal should not see a spinner to record
that someone paid back 200 lira.

**No passwords in the client.** Authentication is Supabase Auth — passwords are hashed
server-side, and usernames map to internal email addresses. The login screen uses
`crypto.subtle`, which requires `file://`, `localhost` or HTTPS.

**Zero dependencies.** No framework, no bundler, no `node_modules`. The whole application
is files a browser can open, which is also why it still works when a CDN does not.

## Running it

Open `index.html` in a browser. That is genuinely all.

For a local server during development:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Deployment

Static hosting on Vercel — see `vercel.json`. HTTPS is required for `crypto.subtle` and
for the service worker.

## Licence

Not open source. Published for review; all rights reserved.
