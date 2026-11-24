-- QR passes are signed tokens, never raw ids (CLAUDE.md). Each event signs
-- with its own key, made from the server's TICKET_SIGNING_KEY and this
-- version; raising the version (from Scan QR, later) makes every pass the
-- event issued before stop scanning, without touching any other event.
-- No key is stored here.
ALTER TABLE "events"
  ADD COLUMN "ticket_key_version" integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT "events_ticket_key_version" CHECK (ticket_key_version >= 1);

-- When a pass was last emailed: written by those who manage the event as
-- they send it, and read to limit Resend.
GRANT UPDATE (ticket_sent_at) ON "registrations" TO app_user;
