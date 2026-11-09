# Auth & Security

This is the one doc in the repo where the rules aren't suggestions.
Everything else here (design system, code style) has room for taste.
This doesn't. If a PR touches auth, permissions, secrets, or user
data and doesn't follow this, it doesn't merge — flag it in review
rather than assuming it's fine because it works.

## Passwords

- Hash with bcrypt, cost factor 12 minimum (already the case in
  `registerUser`). Never lower this for "performance."
- Never log a password, hash included, at any log level, in any
  environment. Not even in a catch block "for debugging."
- Never send `passwordHash` back to the client, in any response,
  ever — not even on the user's own profile endpoint. Select only
  the fields the client actually needs, every time.
- Normalize email (lowercase, trim) before every lookup and every
  write. `Ganesh@x.com` and `ganesh@x.com` must resolve to the same
  account, not two.

## Sessions & JWT

- Session cookies: `httpOnly`, `secure` in production, `sameSite:
  lax` minimum. Never store a session token somewhere JS can read it
  (no `localStorage`).
- JWT payload (mobile) carries only `id` and `role` — never email,
  never password hash, never anything else from `User`. A JWT is
  decodable by anyone who has it; treat the payload as public.
- `NEXTAUTH_SECRET` (or equivalent signing secret) is different per
  environment (local/staging/prod) and never committed — it lives in
  `.env`, which is already gitignored. If it leaks, every session
  everywhere is compromised until it's rotated.
- Session/JWT expiry is finite. No infinite sessions "for
  convenience." The JWT rolls for 30 days, and its `Session` row
  expires 30 days after sign-in, so sign-in is required again at
  least every 30 days.
- The session object returned to the browser (`useSession()`,
  `/api/auth/session`) carries display fields only
  (`lib/client-session.ts`). The revocation key (`sessionToken`)
  and sign-in time (`authTime`) stay in the signed JWT and are read
  on the server (`lib/session-claims.ts`).
- Fail closed: a signed-in request without a session key is treated
  as signed out, so every authenticated call is checked against
  revocation.
- Actions with no current secret to prove (setting a first password)
  require a sign-in within the last 10 minutes (`authTime`).

## Session revocation & self-healing

The `Session` table in PostgreSQL is used for device tracking and
remote session revocation (see `logoutDevice` / `logoutAllDevices`
in `apps/api/src/trpc/users.router.ts`). The JWT is the actual
auth mechanism; the `Session` row is a supplementary record.

- **Revocation works by deleting the `Session` row.** On the next
  request, the `jwt` callback sees the record is missing and
  invalidates the JWT by returning `null`.
- **Never recreate a deleted session unconditionally.** If a session
  record is missing, it could be because: (a) the initial write
  failed (transient DB error during OAuth callback), or (b) the
  user explicitly revoked it. Unconditional recreation defeats
  revocation -- this was a real vulnerability caught in review.
- **The `sessionRecordedAt` JWT flag** distinguishes the two cases.
  It is set only after a successful DB write. If the flag exists
  and the session is missing, the session was revoked -- honour it.
  If the flag is absent, the session was never created -- safe to
  heal. Read the inline comments in `apps/web/src/lib/auth.ts`
  before modifying this logic.
- **`return null` in NextAuth's `jwt` callback** destroys the
  user's session cookie. Never use it as a fallback for "I don't
  know what happened" -- it causes login loops if the trigger
  condition recurs on every request.

## OAuth provider safety

- `allowDangerousEmailAccountLinking` is enabled for Google and
  GitHub so users who first registered with a password can link
  them. It is only safe because the `signIn` callback
  (`prepareOAuthSignIn` in `apps/api/src/services/accounts.ts`)
  confirms the email is verified **for this sign-in**:
  - Google: the `email_verified` claim must be `true`.
  - GitHub: Auth.js does **not** check verification (it falls back
    to the primary or first email). `isVerifiedGitHubEmail` asks
    GitHub's API and requires `verified: true` for that exact
    address. Any failure refuses the sign-in (fail closed).
- When such a sign-in lands on a password account whose email was
  never verified, the password is untrusted (it may have been
  planted before the owner signed up): it is removed, the email is
  marked verified and every session is signed out.
- Before adding a new OAuth provider with this flag, add an explicit
  verification check for it in the `signIn` callback, and document
  the justification next to the flag in `auth.ts`.
- If a provider cannot prove the email is verified, do NOT enable
  `allowDangerousEmailAccountLinking`.

## Email verification & password reset

- New password accounts must verify their email before signing in.
  Verifying asks for the account's password, so a verification link
  for an account someone else created with your address can't
  activate their password.
- Accounts created before verification existed are grandfathered
  (`emailVerificationExempt`) but their password counts as
  unverified for the OAuth rule above.
- Sign-up never reveals whether an email is registered: same
  response, same hashing work; existing owners get a notice email.
- Verification and reset links: 256-bit, single-use, only the
  SHA-256 hash stored (`VerificationToken`, identifier
  `<kind>:<email>`), 24 h / 1 h expiry. A reset verifies the email
  and signs out every session.
- Passwords: at least 8 characters, at most 72 bytes (bcrypt), and
  not in known data breaches (`assertAcceptableNewPassword`). The
  breach check uses Have I Been Pwned's k-anonymity range API: only
  the first 5 hex characters of the SHA-1 are sent, with padding. If
  the service is unreachable the check is skipped and logged, so
  sign-up and reset do not depend on a third party being up.
- Changing a password signs out every other session; a reset signs
  out all of them.
- The owner is emailed about security changes: password changed,
  password reset, password removed by the OAuth rule, and a
  Google/GitHub sign-in added to an account that already had
  another way in. These emails contain no access links.

## Authorization — check on every request, not just at the UI layer

- The UI hiding a button is not access control. Every mutation
  (edit event, add volunteer, view guest list) re-checks on the
  server: is this user allowed to do this, specifically to this
  resource.
- Ownership checks are explicit and resource-scoped: "is this
  event's `organizerId` one this user owns" — not "is this user
  logged in." Being authenticated is not being authorized.
- `UserRole.ADMIN` is a platform-level role (moderation, support
  access) — it is not the same thing as owning an `Organizer`.
  Don't conflate the two when writing permission checks.

## Input validation

- Every tRPC procedure and every REST endpoint validates its input
  with a schema (Zod) before touching the database. No "the
  frontend already validates this" — the frontend is not a trust
  boundary, anyone can call the API directly.
- Never trust an ID from the client without checking it belongs to
  the resource being acted on (see Authorization above).

## Rich text, URLs and HTML

- Any field rendered as HTML (`dangerouslySetInnerHTML`) must be
  sanitized on save with `sanitizeRichText`
  (`apps/api/src/lib/sanitize.ts`). Today that is the organizer
  description, RSVP description, CFP guidelines and schedule item
  descriptions.
- Event descriptions are **not** sanitized because they are also written
  as plain text and only ever rendered as escaped text. Before rendering
  them (or any other field) as HTML, add sanitization on save and clean
  existing rows (`apps/api/src/scripts/sanitize-rich-text.ts`).
- User-supplied links and images use `linkUrl` / `imageUrl`
  (`apps/api/src/lib/url-validation.ts`), never bare `z.string().url()`,
  which accepts `javascript:` URLs.
- Values inserted into HTML emails go through `escapeHtml`.

## Team invitations

Rules for organizer, sub-community and volunteer invitations
(`apps/api/src/services/invites.ts`):

- Inviting an email never looks up or links an account, and nothing in
  the response or in team lists reveals whether the address has one.
- The emailed link holds a random 256-bit token. Store only its SHA-256
  hash. Links are single-use, expire after 7 days, and re-inviting
  replaces the previous link.
- Nothing is joined automatically. The invitee accepts explicitly, from
  the link (any signed-in account: the link proves inbox access) or from
  the in-app notice, which only matches a **verified** email.
- Never reintroduce auto-linking by email at sign-in: an unverified
  account could inherit someone else's invitations.

## Data exposure

- Public queries (`events.list`, anything unauthenticated) select
  only public-safe fields. Never `include` a full `User` or
  `Organizer` relation without checking what it drags in — an
  unguarded `include: { owner: true }` can leak email addresses to
  anyone browsing the public event list.
- Don't log full request/response bodies in production — they can
  contain tokens, emails, or form data that shouldn't sit in logs.

## Cross-origin & transport

- `apps/api` (standalone NestJS server) allows only the origins in
  `ALLOWED_ORIGINS` (comma-separated) and refuses to start in
  production without it. It allows no cross-origin credentials.
- Everything runs over HTTPS outside local dev. No exceptions.
- Security headers on every response (`apps/web/next.config.ts`):
  HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
  (URLs can carry ticket/reset tokens), `X-Frame-Options: DENY`, and a
  `Permissions-Policy` that allows only the camera (check-in scanner).
  A future public embed route must allow framing for that path only
  and must be read-only.
- Content-Security-Policy (`src/proxy.ts`,
  `lib/content-security-policy.ts`): per-request nonce with
  `'strict-dynamic'`, no `'unsafe-inline'` scripts. It is sent as
  **report-only**; violations go to `/api/csp-report`, which logs a
  redacted summary (no query strings, token-like path segments
  replaced). Before switching to enforcing: pages that Next.js renders
  statically get no nonce, so they must render dynamically (for
  example, read the nonce with `headers()` in the root layout), or
  their scripts will be blocked.

## Database

- Prisma parameterizes queries by default — that's most of SQL
  injection protection for free. The one way to lose it: raw SQL
  (`$queryRawUnsafe` or string-interpolated `$queryRaw`). Don't use
  either with any client-influenced value. If raw SQL is ever
  genuinely needed, use tagged-template `$queryRaw` with
  parameters, never string concatenation.

## Dependencies

- Don't add a package without a real reason — every dependency is
  attack surface. Check it's maintained, not abandoned, before
  adding it.
- Security patches to existing dependencies aren't optional
  "whenever" updates — treat a known CVE in something we depend on
  as a priority fix, not backlog.

## File uploads (once these exist — banners, logos)

- Validate actual file content/MIME type server-side, never trust
  the client-reported extension or content-type header.
- Enforce a size limit before the file touches storage, not after.
- Never construct a storage path from unsanitized user input.
- Event banners: a banner URL is accepted, and its file deleted, only
  if it points inside that event's own folder of the banner bucket
  (`eventBannerKey` in `apps/api/src/lib/banner-storage.ts`). The
  service-role storage client must never act on a client-supplied
  path. Set the bucket's allowed MIME types (png, jpeg, webp) and
  5 MB size limit in Supabase so direct uploads are bound too.

## If something looks like a real vulnerability

Don't open a public PR describing it in detail. Flag it privately
first (see `CONTRIBUTING.md` for contact) so it can be fixed before
it's public knowledge of how to exploit it.
