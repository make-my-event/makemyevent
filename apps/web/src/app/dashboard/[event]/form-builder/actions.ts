"use server";

import {
	canChangeKind,
	checkForm,
	type FormProblem,
	isFieldKind,
	recordId,
} from "@makemyevent/core";
import { Prisma } from "@makemyevent/db";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { limited } from "@/lib/rate-limit";
import { actingUser } from "@/lib/require-user";

export type SaveFormResult =
	| { ok: true; version: string }
	| {
			ok: false;
			reason: "invalid" | "conflict" | "denied" | "slow";
			message: string;
			problem?: FormProblem;
	  };

const DENIED: SaveFormResult = {
	ok: false,
	reason: "denied",
	message:
		"You can't change this form. Ask the event's owner or an admin for the Organizer role.",
};

const CONFLICT: SaveFormResult = {
	ok: false,
	reason: "conflict",
	message:
		"Someone else saved this form since you opened it. Reload to see their changes; yours are not saved.",
};

/** Ends the transaction without writing anything, carrying why. */
class Refused extends Error {
	constructor(readonly result: SaveFormResult) {
		super(result.ok ? "" : result.message);
	}
}

/**
 * Saves the registration form, whole, in one transaction, as the person
 * signed in (row-level security lets the owner, admins and organizers
 * write; anyone else changes nothing).
 *
 * `version` is the form's version the draft was made from. It is raised by
 * one here, only if it is still that version, before anything else is
 * written: a draft made from an older form is refused, never merged over
 * someone else's save.
 *
 * Then the whole form is checked as one (checkForm), with this event's
 * tickets for "Show if ticket is…". Name and email keep their own rows,
 * never deleted, never swapped. Fields missing from the draft leave the
 * form: archived with their answers if guests answered them, deleted if
 * not. The rest are written in the draft's order.
 */
export async function saveForm(
	eventId: string,
	version: string,
	input: unknown,
): Promise<SaveFormResult> {
	const user = await actingUser();
	if (!recordId.safeParse(eventId).success || !/^\d{1,18}$/.test(version))
		return DENIED;

	const slow = await limited("event.write", { user: user.id });
	if (slow) return { ok: false, reason: "slow", message: slow.message };
	const from = BigInt(version);

	try {
		const next = await asUser(user, async (tx) => {
			const { count } = await tx.event.updateMany({
				where: { id: eventId, formVersion: from },
				data: { formVersion: { increment: 1 } },
			});
			if (count === 0) {
				// Not theirs to change, or changed since: whoever can read it
				// sees which.
				const event = await tx.event.findUnique({
					where: { id: eventId },
					select: { formVersion: true },
				});
				throw new Refused(
					event && event.formVersion !== from ? CONFLICT : DENIED,
				);
			}

			const tickets = await tx.ticketType.findMany({
				where: { eventId },
				select: { id: true, name: true },
			});
			const check = checkForm(input, { tickets });
			if (!check.ok)
				throw new Refused({
					ok: false,
					reason: "invalid",
					message: check.problem.message,
					problem: check.problem,
				});

			const existing = await tx.formField.findMany({
				where: { eventId, archivedAt: null },
				select: { id: true, core: true, kind: true },
			});
			// Fields guests have answered: archived rather than deleted, and
			// changed only to a kind their answers still make sense in.
			const answered = new Set(
				(
					await tx.registrationAnswer.findMany({
						where: { fieldId: { in: existing.map((row) => row.id) } },
						distinct: ["fieldId"],
						select: { fieldId: true },
					})
				).map((row) => row.fieldId),
			);
			const kinds = new Map(existing.map((row) => [row.id, row.kind]));
			const kept = new Map(existing.map((row) => [row.id, row.core]));
			// Name and email: the same rows, still name and email. Nothing
			// else may claim to be either, or take their rows.
			for (const field of check.fields) {
				const core = kept.get(field.id);
				if (core !== undefined && (core ?? null) !== field.core)
					throw new Refused(CONFLICT);
				if (core === undefined && field.core !== null)
					throw new Refused(CONFLICT);
			}

			const ids = new Set(check.fields.map((field) => field.id));
			const gone = existing
				.filter((row) => !ids.has(row.id))
				.map((row) => row.id);
			if (existing.some((row) => row.core && !ids.has(row.id)))
				throw new Refused(CONFLICT);
			for (const field of check.fields) {
				const before = kinds.get(field.id);
				if (
					before !== undefined &&
					isFieldKind(before) &&
					!canChangeKind(
						{ kind: before, core: field.core },
						field.kind,
						answered.has(field.id),
					)
				)
					throw new Refused({
						ok: false,
						reason: "invalid",
						message: `Guests have answered ${field.label}, so it can only change to a similar type.`,
						problem: {
							fieldId: field.id,
							area: "kind",
							message:
								"Guests have answered this, so it can only change to a similar type.",
						},
					});
			}
			// Off the form either way. Answered ones keep their answers,
			// archived; the rest go.
			const archive = gone.filter((id) => answered.has(id));
			const remove = gone.filter((id) => !answered.has(id));
			if (archive.length > 0)
				await tx.formField.updateMany({
					where: { id: { in: archive }, eventId },
					data: { archivedAt: new Date(), position: null },
				});
			if (remove.length > 0)
				await tx.formField.deleteMany({
					where: { id: { in: remove }, eventId },
				});

			for (const [position, field] of check.fields.entries()) {
				const data = {
					kind: field.kind,
					label: field.label,
					placeholder: field.placeholder,
					help: field.help,
					required: field.required,
					position,
					settings: field.settings as Prisma.InputJsonValue,
					showIf:
						field.showIf === null
							? Prisma.DbNull
							: (field.showIf as unknown as Prisma.InputJsonValue),
				};
				if (kept.has(field.id))
					await tx.formField.update({ where: { id: field.id }, data });
				else
					await tx.formField.create({
						data: { id: field.id, eventId, ...data },
					});
			}
			return (from + 1n).toString();
		});

		revalidatePath("/dashboard/[event]/form-builder", "page");
		return { ok: true, version: next };
	} catch (error) {
		if (error instanceof Refused) return error.result;
		// A new field's id already taken (by another event's field): only a
		// forged draft does that.
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === "P2002"
		)
			return CONFLICT;
		throw error;
	}
}
