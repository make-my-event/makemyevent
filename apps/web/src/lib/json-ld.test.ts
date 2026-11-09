import { describe, expect, it } from "vitest";
import { toJsonLd } from "./json-ld";

describe("toJsonLd", () => {
	it("cannot close the surrounding script tag", () => {
		const out = toJsonLd({
			name: "</script><script>alert(1)</script>",
		});
		expect(out).not.toMatch(/<\/script/i);
		expect(out).not.toContain("<");
	});

	it("round-trips to the original data", () => {
		const data = {
			"@context": "https://schema.org",
			name: "Tech & Design </script> Meetup",
			description: "a < b > c \u2028 line",
		};
		expect(JSON.parse(toJsonLd(data))).toEqual(data);
	});
});
