# U kids

A browser-based learning-center workspace.

## Run locally

Start a local web server from this folder:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>. The optional `server.js` can also serve the app on localhost.

## Project files

- `index.html` — page structure, styles, and content security policy.
- `app.js` — interface behavior and browser-side data handling.
- `server.js` — small local static-file server.
- `ukids-logo.jpg` — main site logo.
- `ukids-logo.svg` — legacy bundled logo asset.

## Data and security limits

This is a client-only prototype. Users, password hashes, activity logs, tasks, and settings are stored in each browser profile; uploaded files are stored in that browser's IndexedDB. They do not sync through GitHub and are not shared across devices.

The app has no server-side identity checks, shared database, or server authorization. Browser-side roles and login are for workflow demonstration, not a security boundary. Do not use it to protect real student records or as a multi-user production service without a trusted backend and server-side access controls.

The source uses generic demo mentor details. Set the real account details only in an appropriately protected deployment and browser environment.
