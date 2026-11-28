/** Times as door staff read them, in this phone's own clock. */

export function clock(ms: number) {
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(ms);
}

export function ago(iso: string, now: number) {
	const mins = Math.round((now - new Date(iso).getTime()) / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins} min ago`;
	const hours = Math.round(mins / 60);
	return `${hours} h ago`;
}
