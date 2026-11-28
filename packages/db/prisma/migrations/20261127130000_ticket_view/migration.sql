-- A guest's ticket page, opened from the link in their pass email, with or
-- without an account.
--
-- The visitor has no account the policies know, so row-level security shows
-- them nothing of registrations. This one function returns one ticket's
-- view, and only what the page shows: the name on it, its code, its state,
-- the ticket and its design, the event's when and where, and the answers the
-- design prints. Nothing else of the guest (no email, no phone unless the
-- design prints it).
--
-- It is reached only after the server has checked a signed view link
-- (apps/web lib/pass-token.ts, readView): the link names the registration
-- and its event under a MAC only the server can make. Both ids must match
-- one row, so one known id alone finds nothing. Registration ids are random
-- (uuid v4), never listed to the public.

CREATE FUNCTION app.ticket_view(target_registration uuid, target_event uuid)
  RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    WITH printed AS (
      -- The form fields this ticket's design prints.
      SELECT DISTINCT (l -> 'source' ->> 'fieldId') AS field_id
      FROM public.registrations r
      JOIN public.ticket_designs d ON d.ticket_type_id = r.ticket_type_id
      CROSS JOIN LATERAL jsonb_array_elements(d.layers) l
      WHERE r.id = target_registration
        AND l -> 'source' ->> 'type' = 'question'
    )
    SELECT jsonb_build_object(
      'attendeeName', r.attendee_name,
      'ticketCode', r.ticket_code,
      'status', r.status,
      'ticketName', t.name,
      'design', (
        SELECT jsonb_build_object('base', d.base, 'accent', d.accent, 'layers', d.layers)
        FROM public.ticket_designs d WHERE d.ticket_type_id = t.id
      ),
      'event', jsonb_build_object(
        'title', e.title,
        'startsAt', e.starts_at,
        'endsAt', e.ends_at,
        'timeZone', e.time_zone,
        'format', e.format,
        'venueName', e.venue_name,
        'venueAddress', e.venue_address,
        'keyVersion', e.ticket_key_version
      ),
      'questions', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', f.id, 'kind', f.kind, 'core', f.core, 'label', f.label,
          'placeholder', f.placeholder, 'help', f.help,
          'required', f.required, 'settings', f.settings, 'showIf', f.show_if
        )), '[]'::jsonb)
        FROM public.form_fields f
        WHERE f.event_id = e.id AND f.id::text IN (SELECT field_id FROM printed)
      ),
      'answers', (
        SELECT coalesce(jsonb_object_agg(a.field_id, jsonb_build_object(
          'value', a.value, 'otherText', a.other_text
        )), '{}'::jsonb)
        FROM public.registration_answers a
        WHERE a.registration_id = r.id
          AND a.field_id::text IN (SELECT field_id FROM printed)
      )
    )
    FROM public.registrations r
    JOIN public.ticket_types t ON t.id = r.ticket_type_id AND t.event_id = r.event_id
    JOIN public.events e ON e.id = r.event_id
    WHERE r.id = target_registration AND r.event_id = target_event
  $$;

REVOKE ALL ON FUNCTION app.ticket_view(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ticket_view(uuid, uuid) TO app_user;
