# Contributing to makemyevent

Thanks for taking a look at makemyevent. Nothing here is set in stone yet — the project is early, so if something in this doc is wrong or missing, that's worth a PR too.

## Before you write code

- Know which app or package owns the change before editing anything.
- Keep API work in `apps/api`, app UI work in `apps/web`, and schema work in `packages/db`.
- If a change touches the database, treat the schema change as a reviewable step.
- Check whether an existing package or workspace utility already solves the problem before adding a dependency.

## Code style

- TypeScript strict mode everywhere.
- Use explicit types for exported functions and component props.
- Prefer named exports and small, reviewable components.
- Run `pnpm biome check --write .` before opening a PR.
- Do not add default exports for components.

## Testing

- Keep tests colocated with the code when they are created.
- Prefer behavior-based tests over implementation-detail tests.
- Add coverage for logic changes, not just styling or copy.
- For user-facing flows, test the behavior that matters to the user.

## Branches, commits and attribution

- `main` is production; `development` is the staging branch.
- Branch off `development` and open PRs against `development`.
- Do not commit directly to `main` or `development`.
- Do not add AI attribution to commits or PR descriptions.
- Write commit messages that describe the actual change.

## File and naming conventions

- Use `kebab-case.ts` for files and `PascalCase` for exported React components.
- Keep one component per file.
- Keep types near the code that uses them unless they are shared across apps.
- Use the monorepo structure instead of inventing duplicate patterns.

## What not to do

- Do not refactor unrelated code as part of a small fix.
- Do not silently change the API contract, design system, or schema as a side effect of another task.
- Do not add one-off REST endpoints when the app can use the existing backend path.
- Do not use color alone to convey state.
- Do not bypass security checks or silently swallow auth errors.
- Do not reuse deleted or stale file names or doc references.

## Getting set up

```bash
docker compose up -d
pnpm install
pnpm dev
```

## Questions

Open an issue or start a discussion in the repo. Keep the question concrete and include the relevant files, commands, or error output.
