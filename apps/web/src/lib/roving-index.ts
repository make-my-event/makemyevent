/**
 * Index to move to for a roving-tabindex list (tabs, menus) after a key
 * press, or null if the key is not a navigation key. Arrow keys wrap.
 */
export function rovingIndex(
	key: string,
	current: number,
	count: number,
): number | null {
	if (count <= 0) return null;
	switch (key) {
		case "ArrowRight":
		case "ArrowDown":
			return (current + 1) % count;
		case "ArrowLeft":
		case "ArrowUp":
			return (current - 1 + count) % count;
		case "Home":
			return 0;
		case "End":
			return count - 1;
		default:
			return null;
	}
}
