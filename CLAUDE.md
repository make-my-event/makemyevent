# makemyevent — Engineering Standards

Global event ticketing marketplace (Stripe Connect, multi-organizer). Web: Next.js. Mobile: Expo. API: Hono + tRPC. DB: Postgres (Supabase-hosted) via Prisma in packages/db, which owns schema and migrations for every environment; RLS policies as SQL in Prisma migrations. No supabase/ folder unless edge functions or storage rules are adopted. Cache/queues: Redis + BullMQ.

## Non-negotiable principle

Phases narrow **scope**, never **quality**. Nothing ships as a temporary shortcut in security, performance, or UI/UX. If a feature cannot be built to these standards within the stage, the feature waits — the standard does not bend.

## Security gates (enforced in CI and review)

- Card data never touches our servers. Stripe Elements / PaymentIntents only (PCI SAQ-A).
- Every money-affecting write: idempotency key + single DB transaction + confirmed only by Stripe webhook. Never by client callback or redirect.
- Webhook events deduplicated via `stripe_events(id UNIQUE)`.
- Postgres RLS on every tenant-scoped table. User traffic runs under a per-request role, never a superuser/service connection.
- Money stored as `bigint` minor units + currency. Never floats.
- Secrets only via environment / secret manager. `gitleaks` in CI. Dependencies pinned, audited (`pnpm audit`), Renovate enabled.
- Auth: Supabase Auth with Google as the sign-in provider (web via PKCE redirect, mobile via native Google Sign-In → ID-token exchange). Mandatory TOTP MFA for organizer/admin roles (Supabase MFA). Short-lived access tokens + rotating refresh tokens, session revocation. Google client secrets live only in the Supabase dashboard, never in the repo.
- Sign-in methods: Google and email magic link (no passwords). Guest checkout is supported: orders carry `purchaser_email` with nullable `user_id`; tickets are claimed into an account on first sign-in with that email.
- Rate limiting + bot protection on every public write endpoint. Stripe Radar rules live before first sale.
- QR tickets are signed tokens (per-event key, rotatable), never raw IDs.
- Append-only audit log for privileged actions: refunds, payouts, role changes, data exports.
- Append-only `ledger_entries` for all money movement; reconciled against Stripe.
- Checklist: OWASP ASVS Level 2. Security review pass required before each stage ships.

## Performance budgets (build fails on regression)

- Public event pages: LCP < 1.5s on simulated 4G, CLS < 0.1. Served via ISR/CDN.
- API: reads p95 < 150ms; `reserve` p95 < 300ms; webhook handling p95 < 500ms.
- Scanner offline validation < 50ms.
- Availability counts from Redis (2–5s TTL), never live `COUNT(*)`.
- Every new query reviewed with `EXPLAIN ANALYZE`. No N+1. No unindexed filter in a hot path.
- Lighthouse CI + k6 load tests in pipeline. Budgets live in `perf-budgets.json`.
- Mobile: FlashList for lists, 60fps, cold start < 2s, bundle size tracked per release.

## UI/UX gates

- `design-spec.md` is the single authority for every visual value. `packages/config` tokens are generated from it and are the only source of color, typography, spacing, radius, elevation and control sizes in code. Raw hex, palette names, or off-scale sizes fail review.
- If a screen and `design-spec.md` disagree, the spec wins and the screen is fixed. New values are added to the spec first, in their own change.
- Vercel Web Interface Guidelines (https://vercel.com/design/guidelines) govern interaction, forms, motion and layout behaviour where the spec is silent.
- WCAG 2.2 AA minimum: contrast, visible focus, labels, reduced-motion, keyboard navigation. `axe` in CI; manual screen-reader pass per stage.
- Every screen designs all states: loading, empty, error, offline, sold-out, reservation-expired, payment-declined, partial-refund.
- Checkout completable by a first-time visitor in < 60s. Scanner usable one-handed, in the dark, by untrained staff.
- Real-device testing (low-end Android + older iPhone) before each stage ships.
- No layout shift on data load; skeletons sized to final content.

## Engineering hygiene

- TypeScript strict everywhere. Zod schemas shared via `packages/core`; validate at every boundary.
- Tests required for: inventory (concurrency tests proving no oversell), payments (webhook idempotency, refund paths), auth, RLS policies.
- Conventional commits. Every PR: lint, typecheck, tests, security scan, perf budgets, a11y scan — all green.
- Observability from day one: Sentry (errors), structured logs with request IDs, Stripe webhook failure alerts.

## Reference guidance (`.agents/skills/`)

Committed on purpose, so the standards this project is built to cannot drift
between machines or contributors. Consult the relevant one before writing code
in that area; they are the detail behind the gates above.

| Skill | Use it for |
|---|---|
| `web-design-guidelines` | Vercel Web Interface Guidelines — the authority named in design-spec.md section 1 for interaction, forms, motion and layout behaviour |
| `accessibility-compliance` | WCAG 2.2 AA patterns, ARIA, mobile accessibility |
| `vercel-react-best-practices` | React/Next.js performance: waterfalls, bundle size, server actions, re-renders, hydration |
| `nextjs-app-router-patterns` | App Router, Server Components, streaming, caching |
| `auth-implementation-patterns` | Sessions, tokens, OAuth, authorization checks |
| `postgresql-table-design` | Schema design, constraints, indexes — read before adding Prisma models |
| `database-migration` | Zero-downtime migration practice |
| `security-audit` | Vulnerability review of code, APIs and infrastructure |
| `debugging-strategies` | Systematic debugging and profiling |

**Precedence.** Where any of these disagree with `design-spec.md` or the gates
in this file, this project's own documents win; the skills are general advice,
these are decisions. Note the exceptions already recorded: Google's sign-in
button uses Google's own colours, outside the five-colour palette.

**Not committed:** skills a package installs into its own folder, such as
`packages/db/.agents`, which Prisma rewrites on every install.

## Monorepo layout

```
apps/      web · mobile · api · worker
packages/  db · core · sdk · ui-web · ui-native · config
```
