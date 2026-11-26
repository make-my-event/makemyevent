/**
 * Every limit on what can be written, sent or fetched, in one table. The
 * counting is in rate-limiter.ts; the server asks through rate-limit.ts.
 *
 * A rule allows `count` at once, then refills evenly over `per`: 60 a minute
 * is up to 60 together and one more each second after. Every rule of a limit
 * must allow a call, and a refused call counts against none of them.
 *
 * `by` says whose allowance it is:
 *   user   the signed-in person
 *   ip     the network the request came from. Several times a person's, since
 *          a campus or a venue's Wi-Fi is one address for everyone on it.
 *   email  the address a message goes to
 *   site   everyone together: a ceiling on cost
 *
 * `withoutRedis` says what happens while the shared counts can't be reached:
 *   local   this server instance counts on its own, so work goes on under a
 *           looser limit (the door must never stop for an outage)
 *   refuse  nothing happens until they can be: for what costs money and can't
 *           be taken back
 */

export type Subject = "user" | "ip" | "email" | "site";

export type Rule = {
	readonly by: Subject;
	readonly count: number;
	/** Seconds. */
	readonly per: number;
};

export type Limit = {
	readonly rules: readonly Rule[];
	readonly withoutRedis: "local" | "refuse";
	/** What happened, said to the person; how long to wait is added. */
	readonly says: string;
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const LIMITS = {
	/** Each sends an email, to an address anyone can type. */
	"signin.email": {
		rules: [
			{ by: "email", count: 5, per: HOUR },
			{ by: "ip", count: 60, per: 10 * MINUTE },
			{ by: "ip", count: 300, per: DAY },
		],
		withoutRedis: "local",
		says: "Too many sign-in links asked for.",
	},
	"signin.google": {
		rules: [{ by: "ip", count: 120, per: 10 * MINUTE }],
		withoutRedis: "local",
		says: "Too many sign-in attempts.",
	},
	/** Coming back with a code or a link's token, each checked by Supabase. */
	"signin.finish": {
		rules: [{ by: "ip", count: 120, per: 10 * MINUTE }],
		withoutRedis: "local",
		says: "Too many sign-in attempts.",
	},
	"event.create": {
		rules: [
			{ by: "user", count: 20, per: HOUR },
			{ by: "ip", count: 100, per: HOUR },
		],
		withoutRedis: "local",
		says: "You've created a lot of events just now.",
	},
	/** Saving, editing, removing: one person working quickly. */
	"event.write": {
		rules: [
			{ by: "user", count: 120, per: MINUTE },
			{ by: "ip", count: 1200, per: MINUTE },
		],
		withoutRedis: "local",
		says: "You're making changes too fast.",
	},
	/** Asked as the host types. */
	"event.address": {
		rules: [
			{ by: "user", count: 60, per: MINUTE },
			{ by: "ip", count: 600, per: MINUTE },
		],
		withoutRedis: "local",
		says: "You're checking addresses too fast.",
	},
	"event.media": {
		rules: [
			{ by: "user", count: 30, per: 10 * MINUTE },
			{ by: "ip", count: 300, per: 10 * MINUTE },
		],
		withoutRedis: "local",
		says: "You've uploaded a lot of images just now.",
	},
	/** An invitation is a row and a name shown to the invited person. */
	"team.add": {
		rules: [
			{ by: "user", count: 60, per: HOUR },
			{ by: "ip", count: 300, per: HOUR },
		],
		withoutRedis: "local",
		says: "You've added a lot of people just now.",
	},
	/**
	 * The email telling someone they were added to a team. It goes to an
	 * address the adder typed, so it is counted per inbox, and nothing is
	 * sent while the counts can't be reached.
	 */
	"team.invite_email": {
		rules: [
			{ by: "email", count: 5, per: DAY },
			{ by: "user", count: 60, per: HOUR },
			{ by: "site", count: 1000, per: HOUR },
		],
		withoutRedis: "refuse",
		says: "Too many invitation emails just now.",
	},
	/** A call may carry up to 200 guests, and a whole door team shares one Wi-Fi. */
	"guest.check_in": {
		rules: [
			{ by: "user", count: 300, per: MINUTE },
			{ by: "ip", count: 6000, per: MINUTE },
		],
		withoutRedis: "local",
		says: "You're checking in too fast.",
	},
	/** Reads a whole file, or fetches it from Google. */
	"guest.import_preview": {
		rules: [
			{ by: "user", count: 30, per: 10 * MINUTE },
			{ by: "ip", count: 300, per: 10 * MINUTE },
		],
		withoutRedis: "local",
		says: "You've previewed a lot of imports just now.",
	},
	"guest.import": {
		rules: [
			{ by: "user", count: 20, per: HOUR },
			{ by: "ip", count: 200, per: HOUR },
		],
		withoutRedis: "local",
		says: "You've imported a lot of files just now.",
	},
	"guest.export": {
		rules: [
			{ by: "user", count: 20, per: HOUR },
			{ by: "ip", count: 200, per: HOUR },
		],
		withoutRedis: "local",
		says: "You've downloaded a lot of guest lists just now.",
	},
	"guest.block": {
		rules: [
			{ by: "user", count: 60, per: 10 * MINUTE },
			{ by: "ip", count: 600, per: 10 * MINUTE },
		],
		withoutRedis: "local",
		says: "You're changing the blocklist too fast.",
	},
	/** Counted in emails. One import of 2,000 fits; the site's is the bill's ceiling. */
	"passes.send": {
		rules: [
			{ by: "user", count: 3000, per: HOUR },
			{ by: "ip", count: 6000, per: HOUR },
			{ by: "site", count: 10_000, per: DAY },
		],
		withoutRedis: "refuse",
		says: "Too many passes are being emailed right now.",
	},
	/** However many events, hosts or resends: what one inbox can be sent. */
	"passes.recipient": {
		rules: [{ by: "email", count: 10, per: DAY }],
		withoutRedis: "refuse",
		says: "This address has been emailed too often.",
	},
	/** Photon is a free, shared service, and sees only our servers. */
	geocode: {
		rules: [
			{ by: "user", count: 20, per: 10 },
			{ by: "ip", count: 100, per: 10 },
			{ by: "site", count: 200, per: 10 },
		],
		withoutRedis: "local",
		says: "Searching too fast.",
	},
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

/** "40 seconds", "3 minutes", "2 hours": never less than the real wait. */
export function waitText(seconds: number): string {
	const unit = (n: number, name: string) => `${n} ${name}${n === 1 ? "" : "s"}`;
	if (seconds < MINUTE) return unit(Math.max(1, Math.ceil(seconds)), "second");
	if (seconds < HOUR) return unit(Math.ceil(seconds / MINUTE), "minute");
	return unit(Math.ceil(seconds / HOUR), "hour");
}
