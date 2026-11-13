# makemyevent

Event ticketing marketplace. Standards: `CLAUDE.md`. Visual values: `design-spec.md`.

## Layout
```
apps/      web (Next.js) · mobile (Expo) · api (Hono + tRPC) · worker (BullMQ)
packages/  db (schema, migrations) · core (domain logic, zod) · sdk (typed client)
           ui-web · ui-native · config (design tokens, generated from design-spec.md)
```

## Environments
| Env | Database | Config file |
|---|---|---|
| local | Supabase CLI in Docker (`pnpm db:start`) | `.env.local` |
| staging | Supabase project (staging) | `.env.staging` |
| production | Supabase project (production) | `.env.production` |

Only `.env.example` is committed. Service-role keys and `DATABASE_URL` never reach `apps/web` or `apps/mobile`.

## Setup
```
pnpm install
cp .env.example .env.local
pnpm db:start          # prints local URL + keys; paste into .env.local
pnpm dev
```
