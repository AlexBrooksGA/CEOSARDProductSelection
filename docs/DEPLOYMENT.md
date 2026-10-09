# Deployment

The explorer is **one Node.js process**. Build once, then run `node build`. Development dependencies are bundled into the build, so the runtime needs no `node_modules`; it needs only Node.js 22.12+ and the `build/` directory (`package.json` is useful for `npm start`).

## Build

```bash
npm ci
npm run check && npm test       # optional but recommended
npm run build                   # writes build/
```

The catalogue, profiles, research log and agency marks are compiled into the build. After editing `data/`, rebuild and restart.

## Run

```bash
PORT=3000 HOST=127.0.0.1 ORIGIN=https://explorer.example.org node --env-file-if-exists=.env build
# or: npm start
```

| Variable | Notes |
|---|---|
| `PORT`, `HOST` | Defaults to `3000` on `0.0.0.0`. Bind to `127.0.0.1` behind a reverse proxy. |
| `ORIGIN` | Public URL of the site, so the app sees its own origin correctly behind a proxy (`adapter-node` v5). Alternatively set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host`, but only behind a trusted proxy. |
| `MIMS_API_USERNAME`, `MIMS_API_PASSWORD`, `MIMS_API_BASE_URL` | Optional. Supply them from a protected secret source; never bake them into an image or commit them. |
| `MIMS_CACHE_TTL_SECONDS`, `MIMS_REFRESH_COOLDOWN_SECONDS`, `MIMS_FAILURE_BACKOFF_SECONDS` | Optional tuning (defaults 21600 / 60 / 30). |
| `BODY_SIZE_LIMIT`, `SHUTDOWN_TIMEOUT` | Standard adapter-node options; the defaults are fine. |

Production does not read `.env` automatically. `npm start` uses Node's `--env-file-if-exists=.env`; a service manager can inject the variables instead.

## Recommended low-traffic setup

This replaces the Streamlit-specific recommendations in [`WEB_HOSTING_AWS_UPLIFT_REVIEW.md`](WEB_HOSTING_AWS_UPLIFT_REVIEW.md), which is now historical. That review's infrastructure advice still applies: a small Linux instance (e.g. Lightsail), Caddy or Nginx for HTTPS, and secrets injected at deploy time. Run `node build` under a service manager in place of Streamlit.

Example systemd unit:

```ini
[Service]
WorkingDirectory=/srv/ceos-ard-explorer
ExecStart=/usr/bin/node build
Environment=PORT=3000 HOST=127.0.0.1 ORIGIN=https://explorer.example.org
EnvironmentFile=/etc/ceos-ard-explorer/mim.env   # chmod 600; MIMS_API_* only
Restart=on-failure
User=explorer
```

Example Caddy configuration:

```
explorer.example.org {
	encode gzip zstd
	reverse_proxy 127.0.0.1:3000
}
```

## Operational notes

- **MIM cache is process-local.** It starts empty after each restart and is not shared if you run several replicas. Each replica would fetch independently, within the same cooldown and back-off limits. If replicas are introduced later, add a shared cache deliberately; it is not needed for this scope.
- **No server-side user state.** Shortlists, profiles and notes live in each visitor's browser session and URL, so restarts never lose user data on the server.
- **Health check.** `GET /api/mim/status` returns JSON without contacting MIM, and `GET /` renders the curated catalogue.
- **Logs** record MIM failure categories (e.g. `MIM load failed (auth): HTTP 401`) and catalogue warnings. Credentials and payloads are never logged.
- **Upgrading SvelteKit.** The build pins SvelteKit 2.70.3. SvelteKit 3 (released 1 October 2026) moves configuration into `vite.config` and removes the `ORIGIN` variable in favour of `paths.origin`. Migrate with `npx sv migrate sveltekit-3`, then retest.

No deployment has been performed as part of the rebuild.
