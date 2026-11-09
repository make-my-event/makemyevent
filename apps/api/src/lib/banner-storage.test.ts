import { describe, expect, it } from "vitest";
import { eventBannerKey } from "./banner-storage";

const SUPABASE = "https://abc.supabase.co";
const base = `${SUPABASE}/storage/v1/object/public/event-banners`;

describe("eventBannerKey", () => {
	it("accepts a file in this event's folder", () => {
		expect(
			eventBannerKey(`${base}/evt1/1700000000000.jpg`, "evt1", SUPABASE),
		).toBe("evt1/1700000000000.jpg");
	});

	it.each([
		["another event's folder", `${base}/evt2/1.jpg`],
		[
			"another host",
			"https://evil.example/storage/v1/object/public/event-banners/evt1/1.jpg",
		],
		[
			"another Supabase project",
			"https://other.supabase.co/storage/v1/object/public/event-banners/evt1/1.jpg",
		],
		[
			"another bucket",
			`${SUPABASE}/storage/v1/object/public/avatars/evt1/1.jpg`,
		],
		["a nested path", `${base}/evt1/sub/1.jpg`],
		["path traversal", `${base}/evt1/..%2Fevt2%2F1.jpg`],
		["encoded slash into another folder", `${base}/evt1%2F..%2Fevt2/1.jpg`],
		["a query string", `${base}/evt1/1.jpg?x=1`],
		["a fragment", `${base}/evt1/1.jpg#x`],
		["the folder itself", `${base}/evt1/`],
		["not a URL", "javascript:alert(1)"],
		["empty", ""],
	])("rejects %s", (_label, url) => {
		expect(eventBannerKey(url, "evt1", SUPABASE)).toBeNull();
	});

	it("rejects everything when storage is not configured", () => {
		expect(eventBannerKey(`${base}/evt1/1.jpg`, "evt1", undefined)).toBeNull();
	});
});
