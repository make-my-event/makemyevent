"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copies text and remembers, for two seconds, that it did. Refused
 * clipboard access changes nothing on screen: the text is still there to
 * select by hand.
 */
export function useCopy() {
	const [copied, setCopied] = useState(false);
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	const copy = useCallback(async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			return;
		}
		setCopied(true);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setCopied(false), 2000);
	}, []);

	return { copied, copy };
}
