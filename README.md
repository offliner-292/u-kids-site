# U kids

A browser-based learning-center workspace and shared public demo.

## Demo sync

The Pages build connects to Supabase using a publishable key and a single shared demo-state row. Changes are visible to all visitors after the next poll (about 5 seconds). Attachments use a private Storage bucket. This is for synthetic demo data only.

The anonymous RLS policies intentionally allow public visitors to read and change the demo state. That state includes user profile fields and password hashes. Use only fake names and phone numbers, unique demo passwords that are not reused anywhere else, and non-sensitive sample files. Do not enter children's or other real personal data. This is not production-grade authentication or authorization.

Run `supabase-setup.sql` in the Supabase SQL Editor when configuring a fresh demo project. The project URL and publishable key are configured in `app.js`; the key is public and intentionally limited by the demo's RLS policies.

## Run locally

Start a local web server from this folder:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>. Localhost provides the secure context needed by Web Crypto and IndexedDB.

## Project files

- `index.html` — page structure, styles, and content security policy.
- `app.js` — interface, local cache, and Supabase sync.
- `supabase-setup.sql` — creates the shared demo table, RLS policies, and attachment bucket.
- `server.js` — small local static-file server.
- `ukids-logo.jpg` — main site logo.
