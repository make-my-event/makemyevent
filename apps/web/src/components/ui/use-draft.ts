"use client";

import { useEffect, useState } from "react";

/**
 * A section's edits, kept apart from what is saved until Save changes.
 *
 * `server` is what the page was rendered with. When it changes (a save, or
 * another tab's) and nothing here is being edited, both the saved copy and
 * the draft take it, along with anything `onServer` keeps beside them (a
 * version, say). While there are edits, the draft is left alone: the
 * person's work is never replaced under them.
 */
export function useDraft<T>(
	server: T,
	same: (a: T, b: T) => boolean,
	onServer?: () => void,
) {
	const [saved, setSaved] = useState(server);
	const [draft, setDraft] = useState(server);
	const dirty = !same(draft, saved);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only on new server values
	useEffect(() => {
		if (dirty) return;
		setSaved(server);
		setDraft(server);
		onServer?.();
	}, [server]);

	return { saved, setSaved, draft, setDraft, dirty };
}
