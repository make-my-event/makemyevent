import assert from "node:assert/strict";
import { test } from "node:test";
import {
	checkLinks,
	detectKind,
	editableLink,
	type LinkKind,
	normalizeLink,
	shortLink,
} from "./links.ts";

const url = (kind: LinkKind, input: string) => {
	const result = normalizeLink(kind, input);
	return result.ok ? result.url : `error: ${result.message}`;
};

test("handles become the platform's address", () => {
	assert.equal(
		url("instagram", "@make.my.event"),
		"https://instagram.com/make.my.event",
	);
	assert.equal(
		url("instagram", "makemyevent"),
		"https://instagram.com/makemyevent",
	);
	assert.equal(url("x", "@makemyevent"), "https://x.com/makemyevent");
	assert.equal(
		url("youtube", "@makemyevent"),
		"https://youtube.com/@makemyevent",
	);
	assert.equal(url("telegram", "@makemyevent"), "https://t.me/makemyevent");
	assert.equal(url("github", "makemyevent"), "https://github.com/makemyevent");
	assert.equal(
		url("threads", "@makemyevent"),
		"https://www.threads.com/@makemyevent",
	);
	assert.equal(
		url("tiktok", "@makemyevent"),
		"https://www.tiktok.com/@makemyevent",
	);
	assert.equal(
		url("bluesky", "makemyevent.bsky.social"),
		"https://bsky.app/profile/makemyevent.bsky.social",
	);
	assert.equal(url("discord", "abc123"), "https://discord.gg/abc123");
	assert.equal(
		url("mastodon", "@host@mastodon.social"),
		"https://mastodon.social/@host",
	);
});

test("pasted links are kept, on the platform's own hosts only", () => {
	assert.equal(
		url("instagram", "https://www.instagram.com/makemyevent/"),
		"https://www.instagram.com/makemyevent",
	);
	assert.equal(
		url("instagram", "instagram.com/makemyevent"),
		"https://instagram.com/makemyevent",
	);
	assert.equal(
		url("x", "https://twitter.com/makemyevent"),
		"https://twitter.com/makemyevent",
	);
	assert.equal(
		url("linkedin", "linkedin.com/company/makemyevent"),
		"https://linkedin.com/company/makemyevent",
	);
	assert.equal(
		url("whatsapp", "https://chat.whatsapp.com/AbC"),
		"https://chat.whatsapp.com/AbC",
	);
	assert.match(
		url("instagram", "https://evil.example/instagram.com"),
		/not from Instagram/,
	);
	assert.match(url("x", "https://x.com.evil.example/a"), /not from X/);
	assert.match(url("linkedin", "@someone"), /web address/);
});

test("the web is https only, on a real host", () => {
	assert.equal(url("website", "yourevent.com"), "https://yourevent.com");
	assert.equal(
		url("website", "https://yourevent.com/about#team"),
		"https://yourevent.com/about",
	);
	assert.match(url("website", "http://yourevent.com"), /web address/);
	assert.match(url("website", "javascript:alert(1)"), /web address/);
	assert.match(
		url("website", "https://user:pass@yourevent.com"),
		/web address/,
	);
	assert.match(url("website", "localhost:3000"), /web address/);
	assert.match(url("other", "data:text/html,hi"), /web address/);
});

test("email, phone and WhatsApp numbers", () => {
	assert.equal(
		url("email", "hello@yourevent.com"),
		"mailto:hello@yourevent.com",
	);
	assert.equal(
		url("email", "mailto:hello@yourevent.com"),
		"mailto:hello@yourevent.com",
	);
	assert.match(url("email", "hello@"), /email address/);
	assert.match(url("email", "a@b.com?subject=x"), /email address/);
	assert.equal(url("phone", "+91 98765-43210"), "tel:+919876543210");
	assert.match(url("phone", "98765 43210"), /country code/);
	assert.equal(
		url("whatsapp", "+91 98765 43210"),
		"https://wa.me/919876543210",
	);
	assert.match(url("instagram", ""), /Add your Instagram/);
});

test("pasting finds the platform", () => {
	assert.equal(
		detectKind("https://www.instagram.com/makemyevent"),
		"instagram",
	);
	assert.equal(detectKind("twitter.com/makemyevent"), "x");
	assert.equal(detectKind("https://youtu.be/abc"), "youtube");
	assert.equal(detectKind("https://chat.whatsapp.com/AbC"), "whatsapp");
	assert.equal(detectKind("https://bsky.app/profile/a.bsky.social"), "bluesky");
	assert.equal(detectKind("hello@yourevent.com"), "email");
	assert.equal(detectKind("+44 20 7946 0958"), "phone");
	assert.equal(detectKind("@host@mastodon.social"), "mastodon");
	assert.equal(detectKind("yourevent.com"), "website");
	assert.equal(detectKind("not a link"), null);
});

test("stored addresses come back as the host typed them", () => {
	assert.equal(
		editableLink("instagram", "https://instagram.com/makemyevent"),
		"@makemyevent",
	);
	assert.equal(
		editableLink("youtube", "https://youtube.com/@makemyevent"),
		"@makemyevent",
	);
	assert.equal(
		editableLink("bluesky", "https://bsky.app/profile/a.bsky.social"),
		"a.bsky.social",
	);
	assert.equal(
		editableLink("instagram", "https://www.instagram.com/p/xyz"),
		"www.instagram.com/p/xyz",
	);
	assert.equal(
		editableLink("whatsapp", "https://wa.me/919876543210"),
		"+919876543210",
	);
	assert.equal(editableLink("email", "mailto:a@b.com"), "a@b.com");
	assert.equal(editableLink("phone", "tel:+919876543210"), "+919876543210");
	assert.equal(
		shortLink("https://www.instagram.com/makemyevent"),
		"instagram.com/makemyevent",
	);
	// Round trip: what the editor shows saves to the same address.
	for (const [kind, stored] of [
		["instagram", "https://instagram.com/makemyevent"],
		["github", "https://github.com/makemyevent"],
		["website", "https://yourevent.com/about"],
		["whatsapp", "https://wa.me/919876543210"],
		["mastodon", "https://mastodon.social/@host"],
	] as const)
		assert.equal(url(kind, editableLink(kind, stored)), stored);
});

test("the list: limits, duplicates and one of each profile", () => {
	assert.deepEqual(checkLinks([{ kind: "x", value: "@a" }]), {
		ok: true,
		values: [{ kind: "x", url: "https://x.com/a" }],
	});
	const many = Array.from({ length: 13 }, (_, i) => ({
		kind: "website",
		value: `a${i}.com`,
	}));
	assert.equal(checkLinks(many).ok, false);
	const twice = checkLinks([
		{ kind: "website", value: "a.com" },
		{ kind: "other", value: "https://a.com" },
	]);
	assert.deepEqual(twice, {
		ok: false,
		index: 1,
		message: "This link is already in the list.",
	});
	const two = checkLinks([
		{ kind: "x", value: "@a" },
		{ kind: "x", value: "@b" },
	]);
	assert.equal(two.ok, false);
	assert.equal(checkLinks([{ kind: "fax", value: "1" }]).ok, false);
	assert.equal(checkLinks("nope").ok, false);
});
