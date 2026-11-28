/**
 * Who runs the site, as the Udyam Registration Certificate records it. Cashfree
 * checks the name on the site against the registration documents, so every
 * page that names the business reads it from here, spelled exactly so.
 */
export const BUSINESS = {
	name: "MakeMyEvent",
	owner: "Adimalupu Ganesh",
	structure: "Sole Proprietorship",
	udyam: "UDYAM-AP-26-0076565",
	address: {
		lines: ["7/123, SC Colony", "Gajulapalle, Mahanandi", "Nandyal"],
		region: "Andhra Pradesh",
		postcode: "518593",
		country: "India",
	},
	email: "admin@makemyevent.org",
	/** Written for reading; `phoneHref` is the same number for tel: links. */
	phone: "+91-6303205936",
	phoneHref: "tel:+916303205936",
	hours: "Monday to Saturday, 10:00 AM – 6:00 PM IST",
	/** Courts with jurisdiction over disputes. */
	courts: "Nandyal, Andhra Pradesh",
	/** How long a reply to a support request takes at most. */
	responseHours: 48,
} as const;

/**
 * The platform fee on each paid ticket, payment gateway charges included.
 * Free tickets carry none. Shown on /pricing, the homepage and in the terms.
 */
export const PAID_TICKET_FEE = { percent: 3, fixedRupees: 5 } as const;

export const PAID_TICKET_FEE_TEXT = `${PAID_TICKET_FEE.percent}% + ₹${PAID_TICKET_FEE.fixedRupees}`;

/** "7/123, SC Colony, Gajulapalle, Mahanandi, Nandyal, Andhra Pradesh - 518593" */
export const ADDRESS_LINE = `${BUSINESS.address.lines.join(", ")}, ${BUSINESS.address.region} - ${BUSINESS.address.postcode}`;

export const OWNERSHIP = `${BUSINESS.name} (${BUSINESS.structure} owned by ${BUSINESS.owner})`;
