-- Social links: more platforms, email and phone, at most twelve per event.

-- An event's links in order, one per place: the order on the page is
-- unambiguous, and with positions 0 to 11 an event has twelve at most.
DROP INDEX "event_links_event_id_position_idx";
CREATE UNIQUE INDEX "event_links_event_id_position_key"
  ON "event_links"("event_id", "position");

ALTER TABLE "event_links"
  DROP CONSTRAINT "event_links_kind",
  DROP CONSTRAINT "event_links_url",
  DROP CONSTRAINT "event_links_position";

ALTER TABLE "event_links"
  ADD CONSTRAINT "event_links_kind"
    CHECK (kind IN ('website', 'instagram', 'x', 'linkedin', 'facebook',
                    'youtube', 'whatsapp', 'telegram', 'discord', 'github',
                    'mastodon', 'bluesky', 'threads', 'tiktok', 'email',
                    'phone', 'other')),
  -- The web over https; an email address; a phone number with its country
  -- code (E.164). Email and phone rows hold only their own kind of address.
  ADD CONSTRAINT "event_links_url"
    CHECK (
      length(url) <= 2048
      AND CASE kind
        WHEN 'email' THEN url ~ '^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$'
        WHEN 'phone' THEN url ~ '^tel:\+[1-9][0-9]{6,14}$'
        ELSE url ~ '^https://[^\s]+$'
      END
    ),
  ADD CONSTRAINT "event_links_position"
    CHECK (position BETWEEN 0 AND 11);
