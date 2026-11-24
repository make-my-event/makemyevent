/**
 * The cookie that remembers whether the event sidebar is open on wide
 * screens. Its own module, so the server layout can read the name without
 * importing it from a client component, where it would arrive as a reference.
 */
export const SIDEBAR_COOKIE = "event-sidebar";
