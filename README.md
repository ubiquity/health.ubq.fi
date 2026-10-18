# UBQ.FI Health Monitor

A health dashboard and JSON API with an independent Cloudflare Workers candidate, a Bun local adapter, and the retained Deno VPS deployment.

## Discovery and refresh

The historical public GitHub catalogs are `https://api.github.com/orgs/ubiquity/repos?per_page=100` and `https://api.github.com/orgs/ubiquity-os-marketplace/repos?per_page=100`. App repositories named `ubq.fi` or ending in `.ubq.fi` become app hosts; marketplace repositories become `os-<repository>.ubq.fi` plugin hosts. Pagination is restricted to the same organization API path and a total of 12 external requests. Invalid DNS names, including metadata repositories, are omitted. Archived repositories remain included, matching historical discovery; membership does not imply a service is deployed or healthy. This is a public repository catalog and does not enumerate private services.

Discovery is cached for five minutes. The Worker also stores its last valid catalog in its isolated D1 database so isolate restarts and upstream failures do not erase it. A failed refresh returns the last valid catalog with `stale: true` and an error; the dashboard displays that warning. A cold failure returns an error instead of an empty successful catalog. No GitHub token is used.

An atomic D1 lease admits one catalog refresh across Worker isolates, and local adapters use single-process admission. Concurrent callers reuse the last valid catalog; cold callers receive HTTP 503 with `Retry-After: 1`. Refreshes have a 30-second deadline and a 45-second lease that recovers after failure or expiry. Requests never share in-flight I/O promises.

Browsers check individual app/plugin health on load and every five minutes. Each domain has its own API request, with the existing probe paths, retries and error reporting. There is no hosted scheduler or Cron Trigger.

## API

- `GET /api/apps`: discovered apps and plugins.
- `GET /api/health/{domain}`: app/plugin health; empty and `root` identifiers probe the apex root.
- `GET /health/cache`: externally submitted observations, with a 60-second HTTP cache lifetime.
- `POST /health/update`: replace one app/plugin observation and update its global timestamp.
- `GET /health/proxy/status?domain=X`: app status and deployment diagnostics.
- `GET /health/proxy/manifest?domain=X`: plugin manifest validation.
- `GET /json`: legacy health JSON and aggregate counts.
- `GET /`: dashboard and static assets.

The dashboard does not call `/health/update`; external clients alone populate `/health/cache` and `/json`. A new deployment can therefore have an empty observation cache while discovery and live probes work. The public update API retains its existing unauthenticated authority. The response field `storage: "deno-kv"` is retained for legacy consumers, although the current backends are file/memory on the VPS and D1 on the Worker.

## Local development and checks

Use Bun 1.4.0. Wrangler 4.151.1, Miniflare and TypeScript are pinned in `bun.lock`. Supported Node 24 runs only the official Cloudflare tooling/control plane; application code and test runners use Bun, while Worker execution uses actual workerd.

```bash
bun install --frozen-lockfile
bun run dev
```

Bun listens on `127.0.0.1:8000` and persists observations to the git-ignored `health-cache.json`. The retained VPS adapter still uses `deno task start` and its existing file cache.

```bash
deno task build
deno test src/server/utils/discovery-hosts_test.ts
bun run deploy:types --check
bun run check
bun run deploy:dry-run
```

The tests exercise the real Bun listener, exact discovery/probe hosts, bounded pagination, last-known-good fallback, the production bundle in actual workerd, real local D1 updates, concurrent writes, persistence across runtime restart, assets, CORS and storage errors. Workerd upstream fixtures are isolated; public candidate checks separately prove real GitHub discovery and external probes.

## Cloudflare candidate

`wrangler.jsonc` targets only `uos-health-candidate` on workers.dev in account `5c0228bee348f4cf48829ffe21b61fe9`, with no canonical routes or Cron Triggers. `UOS_HEALTH_CACHE` binds the separate rebuildable `uos-health-candidate` D1 database; `ASSETS` serves the dashboard and `UOS_VERSION` reports the deployed version. There are no product secrets. CI uses the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` deployment secrets.

The Workers workflow checks pull requests, then applies migrations only to this candidate database and deploys the candidate from `main`. The retained Deno deployment workflow runs only on manual dispatch, preserving recovery without redeploying the legacy runtime on task-branch pushes. The VPS deployment remains unchanged.

```bash
bun x wrangler d1 migrations apply uos-health-candidate --remote
bun run deploy
```

The candidate starts with a separate empty observation cache; no VPS data is copied or shared. D1 updates commit the observation and timestamp together, and reads use the primary database. Workers Free and D1 account quotas are shared with other applications; this public API does not establish unlimited capacity or abuse resistance.

## VPS and recovery

The VPS remains `ubiquity-health.service` (`deno serve --port 8022`), reached through the existing router. The Worker does not proxy to that service, change its files, change routing, or schedule work against its cache. A candidate code rollback does not roll back D1 data and has no effect on the independent VPS cache. Canonical route changes require separate authorization.

See [decisions](docs/DECISIONS.md) for the state, source and scheduling boundaries.
