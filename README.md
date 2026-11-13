# makemyevent

A monorepo for event discovery, ticketing, and community event management.

## Apps and packages

- `apps/web`: Next.js web app
- `apps/api`: NestJS API
- `apps/mobile`: Expo app
- `packages/db`: Prisma schema and migrations
- `packages/ui`: shared UI package
- `docs/`: architecture, design, security, and decisions

## Quick start

```bash
pnpm install
pnpm dev
```

Use `pnpm build` and `pnpm test` to validate changes. For contribution rules, see [`CONTRIBUTING.md`](./CONTRIBUTING.md). For the docs index, see [`docs/README.md`](./docs/README.md).