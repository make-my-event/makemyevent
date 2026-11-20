/**
 * A decorative QR-style pattern. Not a scannable code — it stands in for one
 * in illustrations of passes and tickets.
 *
 * Deterministic from its seed, so it renders on the server and ships as plain
 * markup: no JavaScript, and nothing to differ between server and browser.
 */
/**
 * Each pattern is drawn once and kept. The page renders six of them, and a
 * public page can be rendered thousands of times a minute, so the ~600 steps
 * per pattern are worth paying only once per process.
 *
 * Bounded, because a seed may come from a counter rather than a constant.
 */
const PATHS = new Map<string, string>();
const PATH_LIMIT = 64;

function buildPath(seed: number, size: number): string {
	let state = (seed * 2654435761) >>> 0;
	const random = () => {
		state ^= state << 13;
		state >>>= 0;
		state ^= state >>> 17;
		state ^= state << 5;
		state >>>= 0;
		return state / 4294967296;
	};

	// The three squares a real code carries in its corners.
	const inCorner = (x: number, y: number) =>
		(x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9);

	let path = "";
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (!inCorner(x, y) && random() > 0.52) path += `M${x} ${y}h1v1h-1z`;
		}
	}
	for (const [x, y] of [
		[0, 0],
		[size - 7, 0],
		[0, size - 7],
	] as const) {
		path += `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
	}
	return path;
}

function pathFor(seed: number, size: number): string {
	const key = `${seed}:${size}`;
	const known = PATHS.get(key);
	if (known !== undefined) return known;
	const path = buildPath(seed, size);
	if (PATHS.size >= PATH_LIMIT) PATHS.clear();
	PATHS.set(key, path);
	return path;
}

export function QrPattern({
	seed,
	className,
	size = 25,
}: {
	seed: number;
	className?: string | undefined;
	size?: number;
}) {
	const path = pathFor(seed, size);

	return (
		<svg
			className={className}
			viewBox={`0 0 ${size} ${size}`}
			shapeRendering="crispEdges"
			aria-hidden="true"
			focusable="false"
		>
			<path fill="currentColor" fillRule="evenodd" d={path} />
		</svg>
	);
}
