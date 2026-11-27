-- How a ticket's pass looks: one of the designs in packages/core, its accent,
-- and the layers on it (the entry code and the text). One row per ticket at
-- most, keyed by the ticket; no row is the default design. Saved whole by
-- the Tickets section's design editor.
--
-- The layers are one JSON array, not a table of their own: a design is
-- always read and written whole, and nothing ever looks a single layer up.
-- packages/core's passDesign checks every field before a write; the check
-- here holds the outline (one code, a bounded list, inside the pass), so a
-- write that gets past the app still can't break a pass.

-- CreateTable
CREATE TABLE "ticket_designs" (
    "ticket_type_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "base" TEXT NOT NULL,
    "accent" TEXT,
    "layers" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" UUID,

    CONSTRAINT "ticket_designs_pkey" PRIMARY KEY ("ticket_type_id")
);

-- CreateIndex
CREATE INDEX "ticket_designs_event_id_idx" ON "ticket_designs"("event_id");

-- CreateIndex
CREATE INDEX "ticket_designs_updated_by_id_idx" ON "ticket_designs"("updated_by_id");

-- AddForeignKey
ALTER TABLE "ticket_designs" ADD CONSTRAINT "ticket_designs_ticket_type_id_event_id_fkey" FOREIGN KEY ("ticket_type_id", "event_id") REFERENCES "ticket_types"("id", "event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_designs" ADD CONSTRAINT "ticket_designs_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- What a design may hold
-- ---------------------------------------------------------------------------

-- The outline of a pass's layers, 720 × 280 with a 24 unit safe area: an
-- array of 1 to 12 objects, exactly one of them the entry code, each a code
-- or text, inside the safe area, at most 16 kB in all. A value of the wrong
-- type fails the check rather than slipping through as NULL.
CREATE FUNCTION app.pass_layers_ok(layers jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog
  AS $$
    SELECT jsonb_typeof(layers) = 'array'
      AND jsonb_array_length(layers) BETWEEN 1 AND 12
      AND pg_column_size(layers) <= 16384
      AND (SELECT count(*) FROM jsonb_array_elements(layers) l
           WHERE l ->> 'kind' = 'qr') = 1
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(layers) l
        WHERE jsonb_typeof(l) IS DISTINCT FROM 'object'
          OR (l ->> 'kind') IS NULL
          OR (l ->> 'kind') NOT IN ('qr', 'text')
          OR jsonb_typeof(l -> 'x') IS DISTINCT FROM 'number'
          OR jsonb_typeof(l -> 'y') IS DISTINCT FROM 'number'
          OR (l ->> 'x')::numeric < 24
          OR (l ->> 'y')::numeric < 24
          OR (l ->> 'kind' = 'qr' AND (
                jsonb_typeof(l -> 'size') IS DISTINCT FROM 'number'
                OR (l ->> 'size')::numeric NOT BETWEEN 88 AND 184
                OR (l ->> 'x')::numeric + (l ->> 'size')::numeric > 696
                OR (l ->> 'y')::numeric + (l ->> 'size')::numeric > 256))
          OR (l ->> 'kind' = 'text' AND (
                jsonb_typeof(l -> 'width') IS DISTINCT FROM 'number'
                OR (l ->> 'x')::numeric + (l ->> 'width')::numeric > 696
                OR (l ->> 'y')::numeric > 256
                OR length(coalesce(l -> 'source' ->> 'text', '')) > 60))
      )
  $$;

REVOKE ALL ON FUNCTION app.pass_layers_ok(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pass_layers_ok(jsonb) TO app_user;

ALTER TABLE "ticket_designs"
  ADD CONSTRAINT "ticket_designs_base_known" CHECK (base IN (
    'classic', 'bauhaus-sun', 'midnight-orbital', 'editorial-waves',
    'prism-facets', 'cobalt-blueprint', 'botanical-sage', 'retro-sunburst',
    'synthwave-horizon', 'mediterranean-arch', 'aurora-ribbon',
    'art-deco-gala', 'swiss-grid', 'seigaiha-wave', 'liquid-pastel',
    'isometric-cubes', 'halftone-pop', 'celestial-map', 'soundwave-pulse',
    'terrazzo-stone', 'monolith-steps')),
  ADD CONSTRAINT "ticket_designs_accent_known" CHECK (
    accent IS NULL OR accent IN ('green', 'blue', 'pink', 'violet', 'cyan')),
  ADD CONSTRAINT "ticket_designs_layers_ok" CHECK (app.pass_layers_ok(layers));

-- Who changed it last, and when, from the database: never from what was
-- sent.
CREATE FUNCTION app.stamp_ticket_design() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by_id := app.current_user_id();
  RETURN NEW;
END
$$;

CREATE TRIGGER ticket_designs_stamp
  BEFORE INSERT OR UPDATE ON "ticket_designs"
  FOR EACH ROW EXECUTE FUNCTION app.stamp_ticket_design();

REVOKE ALL ON FUNCTION app.stamp_ticket_design() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Who may do what
--
-- The team reads its events' designs; those who manage the event (owner,
-- admin, organizer, at the second step) change them. Guests never read the
-- table: their pass is drawn on the server.
-- ---------------------------------------------------------------------------

ALTER TABLE "ticket_designs" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, DELETE ON "ticket_designs" TO app_user;
-- Prisma names every column with a default on insert.
GRANT INSERT (ticket_type_id, event_id, base, accent, layers, updated_at)
  ON "ticket_designs" TO app_user;
GRANT UPDATE (base, accent, layers, updated_at) ON "ticket_designs" TO app_user;

CREATE POLICY ticket_designs_select ON "ticket_designs"
  FOR SELECT TO app_user
  USING (app.on_team(event_id));

CREATE POLICY ticket_designs_insert ON "ticket_designs"
  FOR INSERT TO app_user
  WITH CHECK (app.manages_event(event_id));

CREATE POLICY ticket_designs_update ON "ticket_designs"
  FOR UPDATE TO app_user
  USING (app.manages_event(event_id))
  WITH CHECK (app.manages_event(event_id));

CREATE POLICY ticket_designs_delete ON "ticket_designs"
  FOR DELETE TO app_user
  USING (app.manages_event(event_id));

-- Supabase's API roles get nothing, as with every other table.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.ticket_designs FROM %I', r);
    END IF;
  END LOOP;
END
$$;
