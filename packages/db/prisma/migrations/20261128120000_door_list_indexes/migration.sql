-- The door's guest list on the Scan QR page, read by every open phone.

-- By name, a page at a time: each page starts after the last name shown,
-- on this index, so it costs the same however far down the list it is and
-- however many guests the event has.
CREATE INDEX "registrations_event_id_attendee_name_id_idx" ON "registrations"("event_id", "attendee_name", "id");

-- Today's check-ins, latest first, a page at a time; and today's count.
CREATE INDEX "check_ins_event_id_event_day_id_id_idx" ON "check_ins"("event_id", "event_day_id", "id");
