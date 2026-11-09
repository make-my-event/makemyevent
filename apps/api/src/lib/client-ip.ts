/**
 * The client's IP address for rate limiting.
 *
 * On Vercel, `x-real-ip` and `x-forwarded-for` are set by the platform and
 * client-supplied values are overwritten, so they cannot be spoofed. Behind a
 * different proxy, make sure it overwrites these headers the same way.
 * Returns null when no address is available; rate limits then share one
 * "unknown" bucket, which errs on the side of limiting.
 */
export function clientIpFromHeaders(headers: {
	get(name: string): string | null;
}): string | null {
	const realIp = headers.get("x-real-ip")?.trim();
	if (realIp) return realIp;
	const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return forwarded || null;
}
