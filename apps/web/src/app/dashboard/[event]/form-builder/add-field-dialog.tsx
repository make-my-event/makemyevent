"use client";

import { CloseIcon } from "@/components/icons";
import {
	FIELD_KIND_INFO,
	FIELD_PRESETS,
	type FieldKind,
	type FormField,
	newField,
} from "@makemyevent/core";
import { useEffect, useId, useState } from "react";
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import { fold } from "@/lib/text";
import { KindIcon } from "./kind-icon";
import styles from "./form-builder.module.css";

/** Add Field's kinds, most asked-for first. */
const KINDS: readonly FieldKind[] = [
	"short_text",
	"long_text",
	"email",
	"phone",
	"select",
	"radio",
	"checkboxes",
	"yes_no",
	"number",
	"date",
	"url",
	"file",
	"consent",
	"heading",
];

/**
 * Add Field: a ready-made question or a blank one of any kind. One search
 * box filters both. Questions already on the form are marked, since a
 * second "T-shirt size" is almost always a mistake, but can still be added.
 */
export function AddFieldDialog({
	open,
	onClose,
	onAdd,
	existingLabels,
}: {
	open: boolean;
	onClose: () => void;
	onAdd: (field: FormField) => void;
	existingLabels: ReadonlySet<string>;
}) {
	const id = useId();
	const ref = useModalDialog(open);
	const [query, setQuery] = useState("");

	// Each opening starts from an empty search.
	useEffect(() => {
		if (open) setQuery("");
	}, [open]);

	const q = fold(query).trim();
	const presets = FIELD_PRESETS.filter(
		(p) => !q || fold(`${p.label} ${p.keywords}`).includes(q),
	);
	const kinds = KINDS.filter(
		(kind) =>
			!q ||
			fold(
				`${FIELD_KIND_INFO[kind].label} ${FIELD_KIND_INFO[kind].description}`,
			).includes(q),
	);
	const add = (field: FormField) => {
		onAdd(field);
		onClose();
	};

	return (
		<dialog
			ref={ref}
			className={styles.dialog}
			aria-labelledby={`${id}title`}
			onClose={ownClose(onClose)}
		>
			<div className={styles.dialogPanel}>
				<div className={styles.dialogHead}>
					<h3 className={styles.dialogTitle} id={`${id}title`}>
						Add a field
					</h3>
					<button type="button" className={styles.iconButton} onClick={onClose}>
						<CloseIcon />
						<span className={styles.srOnly}>Close</span>
					</button>
				</div>

				<div className={styles.dialogSearch}>
					<label className={styles.srOnly} htmlFor={`${id}q`}>
						Search fields
					</label>
					<input
						id={`${id}q`}
						className={styles.input}
						type="search"
						placeholder="Search: college, phone, t-shirt…"
						autoComplete="off"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key !== "Enter") return;
							event.preventDefault();
							const preset = presets[0];
							const kind = kinds[0];
							if (preset) add(preset.build());
							else if (kind) add(newField(kind));
						}}
					/>
				</div>

				<div className={styles.dialogBody}>
					{presets.length > 0 ? (
						<section aria-labelledby={`${id}quick`}>
							<h4 className={styles.dialogSection} id={`${id}quick`}>
								Ready-made questions
							</h4>
							<ul className={styles.presets}>
								{presets.map((preset) => {
									const there = existingLabels.has(
										fold(preset.build().label).trim(),
									);
									return (
										<li key={preset.id}>
											<button
												type="button"
												className={styles.preset}
												data-there={there || undefined}
												onClick={() => add(preset.build())}
											>
												<span aria-hidden="true">+</span>
												{preset.label}
												{there ? (
													<span className={styles.presetThere}>
														on the form
													</span>
												) : null}
											</button>
										</li>
									);
								})}
							</ul>
						</section>
					) : null}

					{kinds.length > 0 ? (
						<section aria-labelledby={`${id}kinds`}>
							<h4 className={styles.dialogSection} id={`${id}kinds`}>
								Start from a type
							</h4>
							<ul className={styles.kindGrid}>
								{kinds.map((kind) => (
									<li key={kind}>
										<button
											type="button"
											className={styles.kindCard}
											onClick={() => add(newField(kind))}
										>
											<span className={styles.kindTile}>
												<KindIcon kind={kind} />
											</span>
											<span className={styles.kindText}>
												<span className={styles.kindName}>
													{FIELD_KIND_INFO[kind].label}
												</span>
												<span className={styles.kindDescription}>
													{FIELD_KIND_INFO[kind].description}
												</span>
											</span>
										</button>
									</li>
								))}
							</ul>
						</section>
					) : null}

					{presets.length === 0 && kinds.length === 0 ? (
						<p className={styles.dialogEmpty} role="status">
							Nothing matches “{query}”. Start from Short text and word it your
							way.
						</p>
					) : null}
				</div>
			</div>
		</dialog>
	);
}
