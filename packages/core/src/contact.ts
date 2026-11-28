import { z } from "zod";

/** RFC 5321 limit. Anything longer is not an address. */
const EMAIL_MAX = 254;
export const CONTACT_NAME_MAX = 120;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 5000;

export const CONTACT_TOPICS = [
	"general",
	"tickets",
	"refund",
	"organiser",
	"privacy",
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
	general: "A general question",
	tickets: "My ticket or registration",
	refund: "A refund or payment",
	organiser: "Organising an event",
	privacy: "My data and privacy",
};

/** The contact form, as the server accepts it. */
export const contactInput = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Enter your name.")
		.max(CONTACT_NAME_MAX, "That name is too long."),
	email: z
		.string()
		.trim()
		.toLowerCase()
		.min(1, "Enter your email address.")
		.max(EMAIL_MAX, "That email is too long.")
		.pipe(z.email({ error: "That doesn't look like an email address." })),
	topic: z.enum(CONTACT_TOPICS, { error: "Choose what it's about." }),
	message: z
		.string()
		.trim()
		.min(
			CONTACT_MESSAGE_MIN,
			`Tell us a little more: at least ${CONTACT_MESSAGE_MIN} characters.`,
		)
		.max(
			CONTACT_MESSAGE_MAX,
			`Keep it under ${CONTACT_MESSAGE_MAX.toLocaleString("en-IN")} characters.`,
		),
});

export type ContactInput = z.infer<typeof contactInput>;
