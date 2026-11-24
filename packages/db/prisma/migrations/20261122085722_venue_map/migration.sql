-- The venue on a map (its pin), and where online guests join.

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "online_url" TEXT,
ADD COLUMN     "venue_lat" DOUBLE PRECISION,
ADD COLUMN     "venue_lng" DOUBLE PRECISION;

-- A pin is a real place, and comes whole; a join link is a web address.
ALTER TABLE "events"
  ADD CONSTRAINT "events_venue_coordinates"
    CHECK (
      (venue_lat IS NULL) = (venue_lng IS NULL)
      AND (venue_lat IS NULL OR venue_lat BETWEEN -90 AND 90)
      AND (venue_lng IS NULL OR venue_lng BETWEEN -180 AND 180)
    ),
  ADD CONSTRAINT "events_online_url"
    CHECK (online_url ~ '^https://[^\s]+$' AND length(online_url) <= 2048);

GRANT INSERT (venue_lat, venue_lng, online_url),
  UPDATE (venue_lat, venue_lng, online_url) ON "events" TO app_user;
