"use client";

import {
	COUNTRIES,
	countryOf,
	DEFAULT_COUNTRY,
	joinPhone,
	splitPhone,
} from "@makemyevent/core";
import { useState } from "react";
import { ChevronDownIcon } from "@/components/icons";
import styles from "./phone-input.module.css";

/**
 * A phone number: its country, then the number as people say it.
 *
 *   [ +91 ⌄ | 98765 43210            ]
 *
 * India to start, so most people never touch the picker. A whole number
 * pasted in, with its own code, moves the picker to that country. The value
 * is one text, "+91 98765 43210", and empty while no number is typed.
 *
 * The picker is a real <select> laid over the short code, so it opens the
 * device's own list and can be typed into by country name.
 */
export function PhoneInput({
	id,
	label,
	value,
	onChange,
	placeholder,
	invalid,
	describedBy,
}: {
	id: string;
	/** The question, to name the picker by. */
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	invalid: boolean;
	describedBy: string | undefined;
}) {
	// Chosen while the box is empty, or among countries that share a code.
	const [chosen, setChosen] = useState(DEFAULT_COUNTRY);
	const { iso, typed } = splitPhone(value, chosen);
	const country = countryOf(iso);
	// "+91 98765 43210" was the placeholder before there was a picker.
	const hint = splitPhone(placeholder);

	return (
		<div className={styles.phone} data-invalid={invalid || undefined}>
			<div className={styles.country}>
				<span className={styles.dial} aria-hidden="true">
					+{country.dial}
				</span>
				<ChevronDownIcon className={styles.chevron} />
				<select
					className={styles.select}
					aria-label={`${label}: country code`}
					value={iso}
					onChange={(event) => {
						const next = event.target.value;
						setChosen(next);
						onChange(joinPhone(next, typed.replace(/^\+\d*\s*/, "")));
					}}
				>
					{COUNTRIES.map((option) => (
						<option key={option.iso} value={option.iso}>
							{option.name} (+{option.dial})
						</option>
					))}
				</select>
			</div>
			<input
				id={id}
				className={styles.number}
				type="tel"
				inputMode="tel"
				autoComplete="tel"
				placeholder={hint.iso === iso ? hint.typed : ""}
				value={typed}
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				onChange={(event) => {
					const next = joinPhone(iso, event.target.value);
					setChosen(splitPhone(next, iso).iso);
					onChange(next);
				}}
			/>
		</div>
	);
}
