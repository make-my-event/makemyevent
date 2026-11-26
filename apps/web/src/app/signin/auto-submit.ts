"use client";

import { type ChangeEvent, useRef } from "react";

/**
 * Checks a 6-digit code as soon as the sixth digit is in, typed or pasted
 * or filled by the phone: nothing more to press. The button stays, for
 * anyone who prefers it, and for keyboards that never send a change.
 *
 * The same digits are not sent twice in a row, so a wrong code is not
 * counted again against the tries allowed; typing a new one sends that.
 */
export function useAutoSubmit(pending: boolean) {
	const sent = useRef<string | null>(null);
	return (event: ChangeEvent<HTMLInputElement>) => {
		const digits = event.currentTarget.value.replace(/[\s-]/g, "");
		if (pending || !/^\d{6}$/.test(digits) || digits === sent.current) return;
		sent.current = digits;
		event.currentTarget.form?.requestSubmit();
	};
}
