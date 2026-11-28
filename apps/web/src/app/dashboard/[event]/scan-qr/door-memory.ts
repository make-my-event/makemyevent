/**
 * The door this device's scanner is at, remembered on it per event, so the
 * Guests page's Check in can record it too without asking. Kept in the
 * browser only: losing it just means a Guests check-in records no door.
 */

const key = (eventId: string) => `scanner-door:${eventId}`;

export function knownDoor(eventId: string): string | null {
	try {
		return localStorage.getItem(key(eventId));
	} catch {
		return null;
	}
}

export function rememberDoor(eventId: string, doorId: string | null) {
	try {
		if (doorId) localStorage.setItem(key(eventId), doorId);
		else localStorage.removeItem(key(eventId));
	} catch {
		// Not remembered on this device; still applies now.
	}
}
