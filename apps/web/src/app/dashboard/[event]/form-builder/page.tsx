import { type FormField, readForm } from "@makemyevent/core";
import type { Metadata } from "next";
import { asUser } from "@/lib/db";
import styles from "../event-shell.module.css";
import { loadManagedEvent } from "../load-event";
import { FormBuilder } from "./form-builder";

export const metadata: Metadata = {
	title: "Form Builder",
	robots: { index: false, follow: false },
};

type Props = { params: Promise<{ event: string }> };

/**
 * Form Builder: the questions guests answer when they register, the rules
 * that show a question only when it applies, and a preview to try them in.
 */
export default async function FormBuilderPage({ params }: Props) {
	const { event: slug } = await params;
	const event = await loadManagedEvent(slug, "form-builder");
	// The form in order, on the (event_id, position) key; at most 60 rows.
	const { formVersion, formFields } = await asUser(event.viewer, (tx) =>
		tx.event.findUniqueOrThrow({
			where: { id: event.id },
			select: {
				formVersion: true,
				formFields: {
					where: { archivedAt: null },
					orderBy: { position: "asc" },
					select: {
						id: true,
						kind: true,
						core: true,
						label: true,
						placeholder: true,
						help: true,
						required: true,
						settings: true,
						showIf: true,
					},
				},
			},
		}),
	);
	// Which questions guests have answered: those change only to a similar
	// type. One row per field, on the field_id index.
	const answered = await asUser(event.viewer, (tx) =>
		tx.registrationAnswer.findMany({
			where: { fieldId: { in: formFields.map((field) => field.id) } },
			distinct: ["fieldId"],
			select: { fieldId: true },
		}),
	);
	// Read back through the same rules that wrote it.
	const read = readForm(formFields);
	const fields: FormField[] = read.ok ? read.fields : [];
	const registered = event.ticketTypes.reduce(
		(sum, ticket) => sum + Number(ticket.registeredCount),
		0,
	);

	return (
		<main>
			<h2 className={styles.srOnly}>Form Builder</h2>
			<FormBuilder
				eventId={event.id}
				version={formVersion.toString()}
				saved={fields}
				tickets={event.ticketTypes.map((ticket) => ({
					id: ticket.id,
					name: ticket.name,
				}))}
				registered={registered}
				answered={answered.map((row) => row.fieldId)}
				eventTitle={event.title}
			/>
		</main>
	);
}
