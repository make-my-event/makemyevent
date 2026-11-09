/**
 * Turns a browser CSP violation report into a short, safe log entry.
 *
 * Reports are attacker-controllable and their URLs can contain secrets
 * (/tickets/<token>, /invite/<token>, /reset-password?token=...). URLs are
 * reduced to origin + path, with query strings and fragments dropped and
 * token-like path segments replaced; every field is length-capped.
 */

export interface CspViolationSummary {
	directive: string;
	blocked: string;
	page: string;
	source: string;
	line: number | null;
}

const MAX_FIELD = 200;
/** Path segments that look like secrets (long random strings). */
const TOKEN_SEGMENT = /^[A-Za-z0-9_-]{20,}$/;

const cap = (value: string) =>
	value.length > MAX_FIELD ? `${value.slice(0, MAX_FIELD)}…` : value;

/** Origin + path with token-like segments redacted; keywords kept as-is. */
export function redactUrl(raw: unknown): string {
	if (typeof raw !== "string" || raw === "") return "";
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		// Keywords such as "inline", "eval", "self" or a bare scheme.
		return cap(raw.replace(/[?#].*$/, ""));
	}
	const path = url.pathname
		.split("/")
		.map((segment) => (TOKEN_SEGMENT.test(segment) ? ":token" : segment))
		.join("/");
	return cap(`${url.origin}${path}`);
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Accepts both report formats: legacy `report-uri` ({"csp-report": {...}})
 * and the Reporting API ([{ type: "csp-violation", body: {...} }]).
 * Returns at most 20 summaries; anything unrecognised is ignored.
 */
export function summarizeCspReports(payload: unknown): CspViolationSummary[] {
	const bodies: Record<string, unknown>[] = [];
	if (Array.isArray(payload)) {
		for (const entry of payload.slice(0, 20)) {
			const body = (entry as { body?: unknown })?.body;
			if (body && typeof body === "object") {
				bodies.push(body as Record<string, unknown>);
			}
		}
	} else if (payload && typeof payload === "object") {
		const legacy = (payload as Record<string, unknown>)["csp-report"];
		if (legacy && typeof legacy === "object") {
			bodies.push(legacy as Record<string, unknown>);
		}
	}

	return bodies.map((b) => {
		const line = b.lineNumber ?? b["line-number"];
		return {
			directive: cap(
				str(b.effectiveDirective) ||
					str(b["effective-directive"]) ||
					str(b["violated-directive"]),
			),
			blocked: redactUrl(b.blockedURL ?? b["blocked-uri"]),
			page: redactUrl(b.documentURL ?? b["document-uri"]),
			source: redactUrl(b.sourceFile ?? b["source-file"]),
			line: typeof line === "number" && Number.isFinite(line) ? line : null,
		};
	});
}
