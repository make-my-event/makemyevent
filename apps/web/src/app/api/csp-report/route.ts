import { clientIpFromHeaders } from "@/../../api/src/lib/client-ip";
import { RATE_LIMITS, consumeRateLimit } from "@/../../api/src/lib/rate-limit";
import { createContext } from "@/../../api/src/trpc/trpc";
import { summarizeCspReports } from "@/lib/csp-report";

/** Reports larger than this are dropped unread. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * POST /api/csp-report: receives Content-Security-Policy violation reports
 * (report-only phase) and logs a redacted summary. Always answers 204 so the
 * response reveals nothing; rate limited per IP; body size capped.
 */
export async function POST(req: Request): Promise<Response> {
	try {
		await handleReport(req);
	} catch (err) {
		// A reporting endpoint must never fail loudly: drop the report.
		console.error("[csp] Handling a report failed:", err);
	}
	return new Response(null, { status: 204 });
}

async function handleReport(req: Request): Promise<void> {
	const declared = Number(req.headers.get("content-length") ?? "0");
	if (declared > MAX_BODY_BYTES) return;

	const limit = await consumeRateLimit(
		createContext().prisma,
		RATE_LIMITS.cspReportIp,
		clientIpFromHeaders(req.headers) ?? "unknown",
	);
	if (!limit.allowed) return;

	const text = await req.text();
	if (text.length > MAX_BODY_BYTES) return;

	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch {
		return; // Not JSON: not a report.
	}

	for (const summary of summarizeCspReports(payload)) {
		console.warn("[csp] Report-only violation:", JSON.stringify(summary));
	}
}
