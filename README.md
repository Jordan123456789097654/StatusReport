# StatusReport

Free, open-source, self-hostable uptime monitoring, incident management, on-call and status pages.
No paywalls, no monitor or user limits. Intended address: `https://statusreport.roleflow.site`.

## Run it on your own machine (laptop or server)

Everything runs from one machine: the web app, the check worker and the database.

```bash
npm install
cp .env.example .env     # set AUTH_SECRET and NEXT_PUBLIC_APP_URL
npm run setup            # creates the database tables (and the optional seed account)
npm run build
npm run serve            # web app on :3000 + the check worker, restarted automatically if either crashes
```

Open <http://localhost:3000>, create an account, and add monitors.
For development with hot reload, run `npm run dev` and `npm run worker` in two terminals instead.

The dashboard shows a warning banner whenever no worker has checked in for two minutes.

### Making it reachable at statusreport.roleflow.site

A laptop is normally behind a home router, so you need a way to publish it. The simplest free option is a
**Cloudflare Tunnel** (no open ports, HTTPS included):

1. Put `roleflow.site` on Cloudflare (DNS), then install `cloudflared`.
2. `cloudflared tunnel login`, `cloudflared tunnel create statusreport`
3. Route the hostname: `cloudflared tunnel route dns statusreport statusreport.roleflow.site`
4. Run it: `cloudflared tunnel run --url http://localhost:3000 statusreport`
5. In `.env` set `NEXT_PUBLIC_APP_URL=https://statusreport.roleflow.site` and `TRUST_PROXY=true`, then `npm run build` again.

Customer custom domains (CNAME to `statuspage.statusreport.roleflow.site`) need that hostname to terminate TLS for
*any* customer domain. A plain tunnel can't do that. Use Caddy with on-demand TLS (it asks
`/api/internal/tls-ask` before issuing a certificate) on a machine with a public IP and ports 80/443 forwarded, or
Cloudflare for SaaS custom hostnames.

### Keeping a laptop reliable

Monitoring only works while the machine is on and online, so:

- Disable sleep while plugged in (Windows: Settings → System → Power → "Screen and sleep" → Never).
- Start `npm run serve` automatically at login (Windows Task Scheduler → "Create Task" → trigger "At log on" →
  action `node scripts/serve.mjs` with "Start in" set to this folder).
- If the laptop loses internet, checks fail for *your* network and every monitor will look down. Treat a burst of
  simultaneous failures after a connectivity drop with suspicion.
- Keep `BLOCK_PRIVATE_TARGETS=true` so other users can't make the worker probe devices on your home network.

## Architecture

| Piece | Where | Notes |
| --- | --- | --- |
| Web app & dashboard | `src/app` (Next.js App Router) | Server actions for every mutation |
| Host router | `src/middleware.ts` | `statusreport.roleflow.site` → platform; any other Host → that customer's status page |
| Check worker | `worker/index.ts` | Scheduler, sub-minute checks, confirmation logic, retention, snapshots, escalations, domain verification |
| Check engine | `src/lib/monitoring` | HTTP(S) with DNS/TCP/TLS/TTFB breakdown, TCP, UDP, ping, DNS drift, SSL, RDAP domain expiry, keyword & JSONPath assertions |
| Incident engine | `src/lib/monitoring/engine.ts` | N consecutive failures across M regions → incident; cascading failures grouped; auto-resolve |
| Notifications | `src/lib/notify` | Public & private Discord, Slack, Teams, Telegram, email, generic signed webhooks, subscribers |
| Database | `prisma/schema.prisma` | One schema for SQLite and PostgreSQL. `scripts/prepare-db.mjs` picks the provider from `DATABASE_URL` |

### Database

- **SQLite** (default): `DATABASE_URL=file:../data/statusreport.db?connection_limit=1&socket_timeout=30`. Zero-config, one file on this machine.
- **PostgreSQL / Neon**: set `DATABASE_URL` to Neon's *pooled* string and `DIRECT_URL` to the *direct* string (see
  `.env.example`), then `npm run db:push`. The same `.env` works on any machine that runs the worker.

`npm run build`, `npm run db:push` and `npm run setup` rewrite the Prisma provider in `prisma/schema.prisma` to
match `DATABASE_URL`, so just change the URL and re-run one of them.

### Custom domains

1. In a status page, open **Custom domain** and enter e.g. `status.example.com`.
2. Add a CNAME record: host `status.example.com` → target `statuspage.statusreport.roleflow.site`.
3. The worker re-checks DNS until it resolves. Caddy's on-demand TLS can call `GET /api/internal/tls-ask?domain=…` to issue certificates only for verified domains.

Custom HTML and JavaScript on status pages run only on verified custom domains, never on the shared app origin.

## Feature status

Status of the 50-feature specification. "Implemented" means code exists in the repository. Nothing has been
exercised end to end yet. See **Known gaps** below.

| # | Feature | Status |
| --- | --- | --- |
| 1 | HTTP(S) checks: methods, headers, bodies, auth, status ranges | Implemented |
| 2 | Multi-region checks | Implemented via multiple workers with `WORKER_REGION` (run one per region) |
| 3 | Keyword and JSONPath assertions | Implemented (JSONPath is a subset: dotted keys, `[n]`, `['key']`) |
| 4 | SSL expiry alerts (30/14/7/1 days) | Implemented |
| 5 | Domain expiry and DNS drift | Implemented (RDAP for expiry, record-set comparison for drift) |
| 6 | TCP/UDP and ICMP ping | Implemented (ping needs the `ping` binary; UDP is a best-effort check) |
| 7 | Heartbeat / cron monitoring | Implemented |
| 8 | Check intervals 10s–60m | Implemented |
| 9 | DNS / TCP / TLS / TTFB timings | Implemented for HTTP(S) |
| 10 | N-of-M confirmation | Implemented |
| 11 | Discord, Slack, Telegram, Teams, email, webhooks | Implemented |
| 12 | Automatic incident create / resolve, numbered | Implemented |
| 13 | On-call rotations and escalation policies | Implemented (escalation runs in the worker) |
| 14 | Acknowledge from Discord button or signed email link | Implemented (signed link page; Discord button when enabled) |
| 15 | Severity levels | Implemented |
| 16 | Timeline updates with Markdown | Implemented |
| 17 | Post-mortem templates | Implemented |
| 18 | Maintenance windows | Implemented |
| 19 | Smart grouping of cascading failures | Implemented (time window, see workspace settings) |
| 20 | MTTA / MTTR | Implemented |
| C | Public and private Discord engine with template editor | Implemented |
| 21 | Drag-and-drop page builder | Implemented (HTML5 drag and drop; no touch drag yet) |
| 22 | CSS and HTML injection | Implemented |
| 23 | Custom domains and CNAME verification | Implemented |
| 24 | Theme presets | Implemented (5 presets) |
| 25 | Design tokens | Implemented |
| 26 | Component groups | Implemented |
| 27 | Uptime bar styling | Implemented |
| 28 | Latency charts | Implemented |
| 29 | Logos, favicons, OG cards | Implemented |
| 30 | Localisation | Implemented (5 locales; partial translations fall back to English) |
| 31 | Subscribers: email (confirmed), webhook, Discord, RSS, Atom | Implemented |
| 32 | Component-specific subscriptions | Implemented |
| 33 | SVG badges and floating widget | Implemented |
| 34 | Password, IP allowlist, team-only pages | Implemented |
| 35 | Report-an-issue widget with rate limits | Implemented |
| 36 | REST API and OpenAPI | Implemented (`/api/v1/openapi.json`) |
| 37 | Config sync (YAML/JSON) | Implemented (`POST /api/v1/config/sync`) |
| 38 | Deployment markers | Implemented |
| 39 | `status.json` | Implemented (Atlassian-style shape, not a full clone) |
| 40 | RBAC with four roles | Implemented |
| 41 | Dockerfile and Compose | Implemented (alternative to `npm run serve`). No Vercel / Cloudflare adapters: the worker needs a long-running process |
| 42 | SQLite / PostgreSQL switching | Implemented |
| 43 | Single-tenant vs SaaS mode | Implemented (`SAAS_MODE`) |
| 44 | Retention and rollups | Implemented (raw results pruned, daily stats kept) |
| 45 | Static fallback | Partial: the worker writes JSON snapshots that are served if the database is unreachable |
| 46 | JSON backup and restore | Implemented |
| 47 | Audit logs | Implemented (login, changes, domain changes, invites) |
| 48 | TOTP 2FA and OAuth (GitHub, Discord, Google) | Implemented |
| 49 | Rate limiting | Implemented in-process only |
| 50 | Live sandbox | Implemented on the landing page (simulated outage, no sign-up) |

## Known gaps

- **Not run yet.** The code has been typechecked but has not been exercised against live monitors. Expect bugs; the first real run is the test.
- **No automated tests.** There is no test suite yet.
- **Rate limits and some caches are per process.** Several web or worker replicas need a shared store (e.g. Redis) for accurate limits.
- **No real-time push.** Status pages and dashboards refresh on navigation; they do not stream updates.
- **TLS automation:** the `tls-ask` endpoint is included, but no Caddy config is shipped.
- **Email** (subscriber confirmation, email alerts) needs `SMTP_URL` or `RESEND_API_KEY`. Without them, emails are written to the server log only.
- **No password reset** yet. Accounts can only be recovered by an admin or by database access.
- **Not serverless.** Hosting on Vercel isn't supported: the worker needs a long-running process, so run `npm run serve` on a machine that stays on.
- **A laptop is a single point of failure.** If it sleeps or loses internet, nothing is checked and nothing alerts you. The dashboard banner only helps once you're back online.
- **Translations** beyond English are partial.

## Environment variables

See [`.env.example`](.env.example) for every variable with comments. The required ones are `AUTH_SECRET`, `DATABASE_URL`
and `NEXT_PUBLIC_APP_URL`.

## License

MIT
