/**
 * One-time cleanup: re-sanitize rich text that was stored before
 * sanitizeRichText was applied on write.
 *
 * Usage (from the repo root, with DATABASE_URL pointing at the target DB):
 *   pnpm --filter api exec tsx src/scripts/sanitize-rich-text.ts
 *       Dry run. Lists the ids of rows that would change. Writes nothing.
 *   pnpm --filter api exec tsx src/scripts/sanitize-rich-text.ts --apply
 *       Writes the sanitized values.
 *   ... --all-rich-text
 *       Also processes RsvpForm.description, CfpForm.guidelines and
 *       ScheduleItem.description (see below before using it).
 *
 * Default scope is Organizer.description: the one field the web app renders
 * as HTML, and always written by the rich-text editor, so cleaning it is
 * lossless for legitimate content. The other three fields are currently shown
 * as plain text; if an old row holds plain text (not editor HTML), sanitizing
 * it encodes characters such as "&" and "<", which would then appear
 * literally. Review a dry run before applying --all-rich-text.
 *
 * Idempotent: running it again changes nothing. Prints ids only, never content.
 */
import { prisma } from "db";
import { sanitizeOptionalRichText } from "../lib/sanitize";

const APPLY = process.argv.includes("--apply");
const ALL = process.argv.includes("--all-rich-text");
const BATCH = 200;

/**
 * sanitize-html re-serialises equivalent HTML slightly differently ("a: b" ->
 * "a:b" in style values, "<hr>" -> "<hr />"). Rows whose only difference is
 * that formatting are left untouched, so the report lists only rows where
 * markup was actually removed.
 */
function sameAfterFormatting(a: string | null, b: string | null): boolean {
	if (a === null || b === null) return a === b;
	const norm = (html: string) =>
		html
			.replace(
				/style="([^"]*)"/g,
				(_m, s: string) => `style="${s.replace(/:\s+/g, ":")}"`,
			)
			.replace(/\s*\/>/g, ">")
			.trim();
	return norm(a) === norm(b);
}

type Row = { id: string; value: string | null };

interface Target {
	label: string;
	read: (cursor: string | undefined) => Promise<Row[]>;
	write: (id: string, value: string | null) => Promise<unknown>;
}

const targets: Target[] = [
	{
		label: "Organizer.description",
		read: async (cursor) =>
			(
				await prisma.organizer.findMany({
					where: { description: { not: null }, id: { gt: cursor ?? "" } },
					select: { id: true, description: true },
					orderBy: { id: "asc" },
					take: BATCH,
				})
			).map((r) => ({ id: r.id, value: r.description })),
		write: (id, value) =>
			prisma.organizer.update({
				where: { id },
				data: { description: value },
				select: { id: true },
			}),
	},
	...(ALL
		? [
				{
					label: "RsvpForm.description",
					read: async (cursor: string | undefined) =>
						(
							await prisma.rsvpForm.findMany({
								where: { description: { not: null }, id: { gt: cursor ?? "" } },
								select: { id: true, description: true },
								orderBy: { id: "asc" },
								take: BATCH,
							})
						).map((r) => ({ id: r.id, value: r.description })),
					write: (id: string, value: string | null) =>
						prisma.rsvpForm.update({
							where: { id },
							data: { description: value },
							select: { id: true },
						}),
				},
				{
					label: "CfpForm.guidelines",
					read: async (cursor: string | undefined) =>
						(
							await prisma.cfpForm.findMany({
								where: { guidelines: { not: null }, id: { gt: cursor ?? "" } },
								select: { id: true, guidelines: true },
								orderBy: { id: "asc" },
								take: BATCH,
							})
						).map((r) => ({ id: r.id, value: r.guidelines })),
					write: (id: string, value: string | null) =>
						prisma.cfpForm.update({
							where: { id },
							data: { guidelines: value },
							select: { id: true },
						}),
				},
				{
					label: "ScheduleItem.description",
					read: async (cursor: string | undefined) =>
						(
							await prisma.scheduleItem.findMany({
								where: { description: { not: null }, id: { gt: cursor ?? "" } },
								select: { id: true, description: true },
								orderBy: { id: "asc" },
								take: BATCH,
							})
						).map((r) => ({ id: r.id, value: r.description })),
					write: (id: string, value: string | null) =>
						prisma.scheduleItem.update({
							where: { id },
							data: { description: value },
							select: { id: true },
						}),
				},
			]
		: []),
];

async function main(): Promise<void> {
	console.log(
		`[sanitize-rich-text] mode: ${APPLY ? "APPLY (writing changes)" : "dry run (no writes)"}`,
	);
	let totalChanged = 0;

	for (const target of targets) {
		let cursor: string | undefined;
		let scanned = 0;
		const changedIds: string[] = [];

		for (;;) {
			const rows = await target.read(cursor);
			if (rows.length === 0) break;
			for (const row of rows) {
				scanned++;
				const clean = sanitizeOptionalRichText(row.value) ?? null;
				if (!sameAfterFormatting(clean, row.value)) {
					changedIds.push(row.id);
					if (APPLY) await target.write(row.id, clean);
				}
			}
			cursor = rows[rows.length - 1].id;
		}

		totalChanged += changedIds.length;
		console.log(
			`[sanitize-rich-text] ${target.label}: scanned ${scanned}, ${APPLY ? "updated" : "would update"} ${changedIds.length}`,
		);
		for (const id of changedIds) console.log(`  - ${id}`);
	}

	console.log(
		`[sanitize-rich-text] done: ${totalChanged} row(s) ${APPLY ? "updated" : "would be updated"}`,
	);
}

main()
	.catch((error: unknown) => {
		console.error("[sanitize-rich-text] failed:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
