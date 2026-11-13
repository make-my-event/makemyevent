# makemyevent

Event ticketing marketplace. Standards: `CLAUDE.md`. Visual values: `design-spec.md`.

## Layout
```
apps/      web (Next.js) · mobile (Expo) · api (Hono + tRPC) · worker (BullMQ)
packages/  db (Prisma schema, migrations, client) · core (domain logic, zod) · sdk (typed client)
           ui-web · ui-native · config (design tokens, generated from design-spec.md)
```

## Environments
| Env | Database | Config file |
|---|---|---|
| local | Local Postgres | `.env.local` |
| staging | Supabase project (staging) | `.env.staging` |
| production | Supabase project (production) | `.env.production` |

Only `.env.example` is committed. Service-role keys and `DATABASE_URL` never reach `apps/web` or `apps/mobile`.

`packages/db` owns the schema and all migrations through Prisma, for every environment. RLS policies ship as SQL inside Prisma migrations. There is no `supabase/` folder; add one later only for edge functions or storage rules, and migrations still stay in Prisma.

## Setup
```
pnpm install
cp .env.example .env.local
# fill DATABASE_URL / DIRECT_URL for local Postgres
pnpm db:migrate
pnpm dev
```
