import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { sendInviteEmail, sendTicketEmail } from "./email.service";

type SentEmail = { subject: string; html: string };

// vi.mock is hoisted above the imports; vi.hoisted makes `sent` available to it.
const { sent } = vi.hoisted(() => ({ sent: [] as SentEmail[] }));

vi.mock("resend", () => ({
	Resend: class {
		emails = {
			send: async (payload: SentEmail) => {
				sent.push(payload);
				return { data: { id: "test" }, error: null };
			},
		};
	},
}));

const INJECTED =
	'Sam</strong><a href="https://evil.example/login">Verify your account</a><img src=x onerror=alert(1)>';

// Pin every environment value the templates read, so results do not depend on
// the machine (CI sets NEXT_PUBLIC_APP_URL=http://localhost:3000).
const TEST_ENV = {
	RESEND_API_KEY: "test-key",
	NEXT_PUBLIC_APP_URL: "https://app.example.test",
	APP_URL: "https://app.example.test",
} as const;

describe("email templates", () => {
	const originalEnv: Record<string, string | undefined> = {};

	beforeAll(() => {
		for (const [key, value] of Object.entries(TEST_ENV)) {
			originalEnv[key] = process.env[key];
			process.env[key] = value;
		}
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterAll(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			// Assigning undefined would store the string "undefined".
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		vi.restoreAllMocks();
	});

	beforeEach(() => {
		sent.length = 0;
	});

	it("ticket email renders attacker-controlled fields as text, not markup", async () => {
		await sendTicketEmail({
			toEmail: "guest@example.com",
			attendeeName: INJECTED,
			eventTitle: INJECTED,
			eventStart: new Date("2026-12-01T10:00:00Z"),
			location: INJECTED,
			ticketCode: "OPT-ABCD-EFGH",
			qrToken: "qrv1_test",
			tierName: INJECTED,
		});

		expect(sent).toHaveLength(1);
		const { html, subject } = sent[0];
		expect(html).not.toContain('evil.example/login">');
		expect(html).not.toMatch(/<a href="https:\/\/evil/);
		expect(html).not.toMatch(/<img src=x/);
		expect(html).toContain(
			"&lt;a href=&quot;https://evil.example/login&quot;&gt;",
		);
		expect(subject).not.toMatch(/[\r\n]/);
	});

	it("invite email renders attacker-controlled fields as text, not markup", async () => {
		await sendInviteEmail({
			toEmail: "invitee@example.com",
			recipientName: INJECTED,
			role: `${INJECTED}\r\nBcc: victim@example.com`,
			targetName: INJECTED,
			type: "event",
			actionUrl: "https://makemyevent.org/events/x/manage/volunteers",
		});

		expect(sent).toHaveLength(1);
		const { html, subject } = sent[0];
		expect(html).not.toMatch(/<a href="https:\/\/evil/);
		expect(html).not.toMatch(/<img src=x/);
		expect(subject).not.toMatch(/[\r\n]/);
	});

	it("keeps ordinary values readable", async () => {
		await sendTicketEmail({
			toEmail: "guest@example.com",
			attendeeName: "Priya Nair",
			eventTitle: "Tech Meetup 2026",
			eventStart: new Date("2026-12-01T10:00:00Z"),
			location: null,
			ticketCode: "OPT-ABCD-EFGH",
			qrToken: "qrv1_test",
			tierName: "General Pass",
		});

		const { html } = sent[0];
		expect(html).toContain("Hi <strong>Priya Nair</strong>");
		expect(html).toContain("Venue: Venue TBA");
		expect(html).toContain(
			'<a href="https://app.example.test/tickets/OPT-ABCD-EFGH"',
		);
	});
});
