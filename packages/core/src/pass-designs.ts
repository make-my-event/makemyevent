/**
 * The artwork a ticket's pass can be drawn on: Classic, then twenty drawn
 * designs. Each is a 720 × 280 picture with room left for the guest's
 * details, mostly on the left; the shapes sit to the right.
 *
 * These colours are artwork (design-spec.md, "Pass designs"): they stay on
 * the pass, and nothing in the interface samples them. A pass is the same
 * in both themes, since it is printed, emailed and scanned.
 *
 * `draw` returns the inside of an <svg viewBox="0 0 720 280">: no text, no
 * code. `accent` is a colour this file or PASS_ACCENTS chose, never typed
 * in; `uid` is made safe by the caller and keeps pattern and gradient ids
 * apart when several passes share a page.
 */

export const PASS_WIDTH = 720;
export const PASS_HEIGHT = 280;

const W = PASS_WIDTH;
const H = PASS_HEIGHT;

export type PassTone = "light" | "dark";

export type PassArtwork = {
	id: string;
	name: string;
	tone: PassTone;
	/** The colour most of the text sits on, for the contrast warning. */
	ground: string;
	/** Main text. */
	ink: string;
	/** Secondary text. */
	soft: string;
	/** The design's own accent, used when none is chosen. */
	accent: string;
	draw: (accent: string, uid: string) => string;
};

/** On light designs and dark designs, the two text colours. */
const LIGHT_TEXT = { ink: "#1c1917", soft: "#57534e" } as const;
const DARK_TEXT = { ink: "#ffffff", soft: "#cbd5e1" } as const;

export const PASS_ARTWORK = [
	{
		id: "classic",
		name: "Classic",
		tone: "dark",
		ground: "#364fc7",
		ink: "#ffffff",
		soft: "#dbe4ff",
		accent: "#748ffc",
		draw: (accent) => `
			<rect width="${W}" height="${H}" fill="#364fc7"/>
			<line x1="${W - 160}" y1="0" x2="${W - 160}" y2="${H}" stroke="${accent}" stroke-width="2" stroke-dasharray="6 6"/>`,
	},
	{
		id: "bauhaus-sun",
		name: "Bauhaus Sun",
		tone: "light",
		ground: "#f7f4ed",
		...LIGHT_TEXT,
		accent: "#c2410c",
		draw: (accent, uid) => `
			<defs><pattern id="hatch-${uid}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10" stroke="#18181b" stroke-opacity="0.1" stroke-width="2"/></pattern></defs>
			<rect width="${W}" height="${H}" fill="#f7f4ed"/>
			<rect width="14" height="${H}" fill="${accent}"/>
			<circle cx="${W * 0.84}" cy="${H * 0.36}" r="88" fill="${accent}" fill-opacity="0.14"/>
			<circle cx="${W * 0.84}" cy="${H * 0.36}" r="52" fill="${accent}" fill-opacity="0.88"/>
			<rect x="${W * 0.68}" y="${H * 0.56}" width="${W * 0.32}" height="${H * 0.44}" fill="url(#hatch-${uid})"/>
			<path d="M ${W * 0.68} ${H} A 110 110 0 0 1 ${W * 0.94} ${H * 0.58}" fill="none" stroke="#18181b" stroke-opacity="0.22" stroke-width="2"/>
			<circle cx="${W * 0.68}" cy="${H * 0.56}" r="6" fill="#18181b"/>`,
	},
	{
		id: "midnight-orbital",
		name: "Midnight Orbital",
		tone: "dark",
		ground: "#0f1115",
		...DARK_TEXT,
		accent: "#38bdf8",
		draw: (accent, uid) => {
			const cx = W * 0.82;
			const cy = H * 0.5;
			return `
			<defs><radialGradient id="glow-${uid}" cx="82%" cy="50%" r="55%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.34"/><stop offset="60%" stop-color="${accent}" stop-opacity="0.08"/><stop offset="100%" stop-color="#0f1115" stop-opacity="0"/></radialGradient></defs>
			<rect width="${W}" height="${H}" fill="#0f1115"/>
			<rect width="${W}" height="${H}" fill="url(#glow-${uid})"/>
			<g fill="none" stroke="${accent}">
				<circle cx="${cx}" cy="${cy}" r="42" stroke-opacity="0.55" stroke-width="1.5"/>
				<circle cx="${cx}" cy="${cy}" r="82" stroke-opacity="0.3" stroke-width="1.2" stroke-dasharray="6 6"/>
				<circle cx="${cx}" cy="${cy}" r="126" stroke-opacity="0.18" stroke-width="1"/>
				<circle cx="${cx}" cy="${cy}" r="172" stroke-opacity="0.1" stroke-width="1"/>
			</g>
			<circle cx="${cx - 82}" cy="${cy}" r="4.5" fill="${accent}"/>
			<circle cx="${cx + 58}" cy="${cy - 58}" r="3" fill="#ffffff" fill-opacity="0.7"/>
			<rect width="6" height="${H}" fill="${accent}"/>`;
		},
	},
	{
		id: "editorial-waves",
		name: "Silk Waves",
		tone: "light",
		ground: "#f6f1ea",
		...LIGHT_TEXT,
		accent: "#9f1239",
		draw: (accent, uid) => `
			<defs><linearGradient id="wave-${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${accent}" stop-opacity="0.16"/><stop offset="100%" stop-color="${accent}" stop-opacity="0.03"/></linearGradient></defs>
			<rect width="${W}" height="${H}" fill="#f6f1ea"/>
			<path d="M ${W * 0.48} 0 C ${W * 0.62} ${H * 0.32}, ${W * 0.56} ${H * 0.72}, ${W * 0.78} ${H} L ${W} ${H} L ${W} 0 Z" fill="url(#wave-${uid})"/>
			<path d="M ${W * 0.56} 0 C ${W * 0.68} ${H * 0.36}, ${W * 0.62} ${H * 0.7}, ${W * 0.84} ${H}" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1.5"/>
			<path d="M ${W * 0.64} 0 C ${W * 0.76} ${H * 0.4}, ${W * 0.7} ${H * 0.68}, ${W * 0.92} ${H}" fill="none" stroke="${accent}" stroke-opacity="0.18" stroke-width="1"/>
			<rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="4" fill="none" stroke="#292524" stroke-opacity="0.16" stroke-width="1"/>`,
	},
	{
		id: "prism-facets",
		name: "Prism Facets",
		tone: "light",
		ground: "#ffffff",
		...LIGHT_TEXT,
		accent: "#7c3aed",
		draw: (accent) => `
			<rect width="${W}" height="${H}" fill="#ffffff"/>
			<polygon points="${W * 0.62},0 ${W},0 ${W},${H * 0.65} ${W * 0.76},${H * 0.42}" fill="${accent}" fill-opacity="0.1"/>
			<polygon points="${W * 0.76},${H * 0.42} ${W},${H * 0.22} ${W},${H} ${W * 0.66},${H}" fill="${accent}" fill-opacity="0.18"/>
			<polygon points="${W * 0.84},0 ${W},0 ${W * 0.92},${H * 0.55}" fill="${accent}" fill-opacity="0.26"/>
			<polygon points="${W * 0.58},${H} ${W * 0.76},${H * 0.42} ${W * 0.84},${H}" fill="#0f172a" fill-opacity="0.05"/>
			<polyline points="${W * 0.62},0 ${W * 0.76},${H * 0.42} ${W * 0.66},${H}" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="1.2"/>
			<rect width="${W}" height="5" fill="${accent}"/>`,
	},
	{
		id: "cobalt-blueprint",
		name: "Cobalt Blueprint",
		tone: "dark",
		ground: "#0f2557",
		...DARK_TEXT,
		accent: "#60a5fa",
		draw: (accent, uid) => {
			const cx = W * 0.82;
			const cy = H * 0.5;
			return `
			<defs><pattern id="grid-${uid}" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#93c5fd" stroke-opacity="0.14" stroke-width="0.8"/></pattern></defs>
			<rect width="${W}" height="${H}" fill="#0f2557"/>
			<rect width="${W}" height="${H}" fill="url(#grid-${uid})"/>
			<g fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="1.2">
				<circle cx="${cx}" cy="${cy}" r="66"/>
				<circle cx="${cx}" cy="${cy}" r="42" stroke-dasharray="4 4"/>
				<line x1="${cx - 86}" y1="${cy}" x2="${cx + 86}" y2="${cy}"/>
				<line x1="${cx}" y1="${cy - 86}" x2="${cx}" y2="${cy + 86}"/>
			</g>
			<g fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.5">
				<path d="M 16 32 L 16 16 L 32 16"/>
				<path d="M ${W - 32} 16 L ${W - 16} 16 L ${W - 16} 32"/>
				<path d="M 16 ${H - 32} L 16 ${H - 16} L 32 ${H - 16}"/>
				<path d="M ${W - 32} ${H - 16} L ${W - 16} ${H - 16} L ${W - 16} ${H - 32}"/>
			</g>`;
		},
	},
	{
		id: "botanical-sage",
		name: "Botanical Sage",
		tone: "light",
		ground: "#f1f5ef",
		...LIGHT_TEXT,
		accent: "#15803d",
		draw: (accent) => `
			<rect width="${W}" height="${H}" fill="#f1f5ef"/>
			<path d="M ${W * 0.72} ${H} C ${W * 0.74} ${H * 0.56}, ${W * 0.84} ${H * 0.24}, ${W * 0.96} ${H * 0.08} C ${W * 0.98} ${H * 0.38}, ${W * 0.9} ${H * 0.76}, ${W * 0.72} ${H} Z" fill="${accent}" fill-opacity="0.16"/>
			<path d="M ${W * 0.82} ${H} C ${W * 0.78} ${H * 0.66}, ${W * 0.86} ${H * 0.42}, ${W} ${H * 0.28} L ${W} ${H} Z" fill="${accent}" fill-opacity="0.24"/>
			<path d="M ${W * 0.64} ${H} C ${W * 0.7} ${H * 0.74}, ${W * 0.78} ${H * 0.46}, ${W * 0.95} ${H * 0.12}" fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="1.5"/>
			<circle cx="${W * 0.74}" cy="${H * 0.24}" r="28" fill="#d97706" fill-opacity="0.14"/>
			<circle cx="${W * 0.74}" cy="${H * 0.24}" r="14" fill="#d97706" fill-opacity="0.22"/>`,
	},
	{
		id: "retro-sunburst",
		name: "Retro Sunburst",
		tone: "light",
		ground: "#faf3e3",
		...LIGHT_TEXT,
		accent: "#b45309",
		draw: (accent) => {
			const cx = W * 0.86;
			const cy = H * 0.5;
			const r = W * 0.65;
			const rays = Array.from({ length: 16 }, (_, i) => {
				const a1 = (i * 22.5 * Math.PI) / 180;
				const a2 = ((i * 22.5 + 10) * Math.PI) / 180;
				const p = (a: number) =>
					`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
				return `<polygon points="${cx},${cy} ${p(a1)} ${p(a2)}" fill="${accent}" fill-opacity="0.08"/>`;
			}).join("");
			return `
			<rect width="${W}" height="${H}" fill="#faf3e3"/>
			${rays}
			<circle cx="${cx}" cy="${cy}" r="38" fill="${accent}" fill-opacity="0.18"/>
			<circle cx="${cx}" cy="${cy}" r="22" fill="${accent}" fill-opacity="0.82"/>
			<rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="2"/>
			<rect x="16" y="16" width="${W - 32}" height="${H - 32}" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="1"/>`;
		},
	},
	{
		id: "synthwave-horizon",
		name: "Synthwave Horizon",
		tone: "dark",
		ground: "#1a0d30",
		...DARK_TEXT,
		accent: "#ec4899",
		draw: (accent, uid) => {
			const hy = H * 0.62;
			const cx = W * 0.8;
			return `
			<defs>
				<linearGradient id="sky-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#110924"/><stop offset="65%" stop-color="#22103d"/><stop offset="100%" stop-color="#0f071f"/></linearGradient>
				<linearGradient id="sun-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fde047"/><stop offset="55%" stop-color="${accent}"/><stop offset="100%" stop-color="#7e22ce"/></linearGradient>
			</defs>
			<rect width="${W}" height="${H}" fill="url(#sky-${uid})"/>
			<circle cx="${cx}" cy="${hy - 18}" r="54" fill="url(#sun-${uid})" fill-opacity="0.88"/>
			<rect x="${cx - 60}" y="${hy - 8}" width="120" height="5" fill="#1e0e36"/>
			<rect x="${cx - 60}" y="${hy + 4}" width="120" height="7" fill="#1e0e36"/>
			<rect x="${cx - 60}" y="${hy + 18}" width="120" height="9" fill="#1e0e36"/>
			<line x1="0" y1="${hy}" x2="${W}" y2="${hy}" stroke="${accent}" stroke-opacity="0.6" stroke-width="1.5"/>
			<g stroke="#38bdf8" stroke-opacity="0.28" stroke-width="1">
				<line x1="0" y1="${hy + 18}" x2="${W}" y2="${hy + 18}"/>
				<line x1="0" y1="${hy + 42}" x2="${W}" y2="${hy + 42}"/>
				<line x1="0" y1="${hy + 74}" x2="${W}" y2="${hy + 74}"/>
				<line x1="${cx}" y1="${hy}" x2="${W * 0.25}" y2="${H}"/>
				<line x1="${cx}" y1="${hy}" x2="${W * 0.55}" y2="${H}"/>
				<line x1="${cx}" y1="${hy}" x2="${W * 0.8}" y2="${H}"/>
				<line x1="${cx}" y1="${hy}" x2="${W * 1.05}" y2="${H}"/>
			</g>`;
		},
	},
	{
		id: "mediterranean-arch",
		name: "Mediterranean Arch",
		tone: "light",
		ground: "#f5ede1",
		...LIGHT_TEXT,
		accent: "#c2410c",
		draw: (accent) => {
			const ax = W * 0.72;
			const aw = W * 0.22;
			return `
			<rect width="${W}" height="${H}" fill="#f5ede1"/>
			<path d="M ${ax} ${H} L ${ax} ${H * 0.4} A ${aw / 2} ${aw / 2} 0 0 1 ${ax + aw} ${H * 0.4} L ${ax + aw} ${H} Z" fill="${accent}" fill-opacity="0.16"/>
			<path d="M ${ax + 12} ${H} L ${ax + 12} ${H * 0.44} A ${(aw - 24) / 2} ${(aw - 24) / 2} 0 0 1 ${ax + aw - 12} ${H * 0.44} L ${ax + aw - 12} ${H} Z" fill="none" stroke="${accent}" stroke-opacity="0.48" stroke-width="1.5"/>
			<polygon points="${ax + aw / 2},${H * 0.22} ${ax + aw / 2 + 9},${H * 0.22 + 9} ${ax + aw / 2},${H * 0.22 + 18} ${ax + aw / 2 - 9},${H * 0.22 + 9}" fill="${accent}" fill-opacity="0.7"/>
			<rect y="${H - 10}" width="${W}" height="10" fill="${accent}" fill-opacity="0.22"/>`;
		},
	},
	{
		id: "aurora-ribbon",
		name: "Aurora Ribbon",
		tone: "dark",
		ground: "#0b1120",
		...DARK_TEXT,
		accent: "#14b8a6",
		draw: (accent, uid) => `
			<defs>
				<linearGradient id="a1-${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${accent}" stop-opacity="0.05"/><stop offset="50%" stop-color="${accent}" stop-opacity="0.42"/><stop offset="100%" stop-color="#818cf8" stop-opacity="0.35"/></linearGradient>
				<linearGradient id="a2-${uid}" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.08"/><stop offset="60%" stop-color="${accent}" stop-opacity="0.28"/><stop offset="100%" stop-color="#f472b6" stop-opacity="0.2"/></linearGradient>
			</defs>
			<rect width="${W}" height="${H}" fill="#0b1120"/>
			<path d="M ${W * 0.35} ${H} C ${W * 0.52} ${H * 0.55}, ${W * 0.65} ${H * 0.65}, ${W} ${H * 0.14} L ${W} ${H * 0.58} C ${W * 0.72} ${H * 0.82}, ${W * 0.58} ${H * 0.85}, ${W * 0.48} ${H} Z" fill="url(#a1-${uid})"/>
			<path d="M ${W * 0.45} 0 C ${W * 0.62} ${H * 0.38}, ${W * 0.76} ${H * 0.25}, ${W} ${H * 0.72} L ${W} ${H} L ${W * 0.62} ${H} C ${W * 0.68} ${H * 0.52}, ${W * 0.55} ${H * 0.32}, ${W * 0.38} 0 Z" fill="url(#a2-${uid})"/>
			<circle cx="${W * 0.72}" cy="${H * 0.2}" r="2" fill="#ffffff" fill-opacity="0.5"/>
			<circle cx="${W * 0.88}" cy="${H * 0.32}" r="1.5" fill="#ffffff" fill-opacity="0.4"/>
			<circle cx="${W * 0.58}" cy="${H * 0.14}" r="1.8" fill="${accent}" fill-opacity="0.8"/>`,
	},
	{
		id: "art-deco-gala",
		name: "Art Deco Gala",
		tone: "dark",
		ground: "#141416",
		...DARK_TEXT,
		accent: "#d97706",
		draw: (accent, uid) => {
			const cx = W * 0.84;
			const cy = H * 0.5;
			return `
			<defs><radialGradient id="deco-${uid}" cx="84%" cy="50%" r="55%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.22"/><stop offset="100%" stop-color="#141416" stop-opacity="0"/></radialGradient></defs>
			<rect width="${W}" height="${H}" fill="#141416"/>
			<rect width="${W}" height="${H}" fill="url(#deco-${uid})"/>
			<g stroke="${accent}" stroke-opacity="0.38" fill="none" stroke-width="1.2">
				<circle cx="${cx}" cy="${cy}" r="36"/>
				<circle cx="${cx}" cy="${cy}" r="68"/>
				<circle cx="${cx}" cy="${cy}" r="102"/>
				<circle cx="${cx}" cy="${cy}" r="138" stroke-dasharray="6 4"/>
				<line x1="${cx - 138}" y1="${cy}" x2="${cx + 138}" y2="${cy}"/>
				<line x1="${cx}" y1="${cy - 138}" x2="${cx}" y2="${cy + 138}"/>
				<line x1="${cx - 98}" y1="${cy - 98}" x2="${cx + 98}" y2="${cy + 98}"/>
				<line x1="${cx - 98}" y1="${cy + 98}" x2="${cx + 98}" y2="${cy - 98}"/>
			</g>
			<polygon points="${cx},${cy - 22} ${cx + 22},${cy} ${cx},${cy + 22} ${cx - 22},${cy}" fill="${accent}" fill-opacity="0.28" stroke="${accent}" stroke-width="1.2"/>
			<rect x="12" y="12" width="${W - 24}" height="${H - 24}" fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="1.5"/>
			<rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="1"/>
			<path d="M 12 36 L 36 36 L 36 12 M ${W - 12} 36 L ${W - 36} 36 L ${W - 36} 12 M 12 ${H - 36} L 36 ${H - 36} L 36 ${H - 12} M ${W - 12} ${H - 36} L ${W - 36} ${H - 36} L ${W - 36} ${H - 12}" fill="none" stroke="${accent}" stroke-opacity="0.6" stroke-width="1.5"/>`;
		},
	},
	{
		id: "swiss-grid",
		name: "Swiss Grid",
		tone: "light",
		ground: "#f5f5f4",
		...LIGHT_TEXT,
		accent: "#dc2626",
		draw: (accent) => `
			<rect width="${W}" height="${H}" fill="#f5f5f4"/>
			<g stroke="#1c1917" stroke-opacity="0.08" stroke-width="1">
				<line x1="${W * 0.25}" y1="0" x2="${W * 0.25}" y2="${H}"/>
				<line x1="${W * 0.5}" y1="0" x2="${W * 0.5}" y2="${H}"/>
				<line x1="${W * 0.75}" y1="0" x2="${W * 0.75}" y2="${H}"/>
				<line x1="0" y1="${H * 0.33}" x2="${W}" y2="${H * 0.33}"/>
				<line x1="0" y1="${H * 0.66}" x2="${W}" y2="${H * 0.66}"/>
			</g>
			<rect x="${W * 0.75}" width="${W * 0.25}" height="${H * 0.33}" fill="${accent}"/>
			<circle cx="${W * 0.75}" cy="${H * 0.66}" r="74" fill="#18181b" fill-opacity="0.09"/>
			<circle cx="${W * 0.88}" cy="${H * 0.66}" r="44" fill="${accent}" fill-opacity="0.2"/>
			<rect x="${W * 0.75}" y="${H * 0.66}" width="${W * 0.25}" height="${H * 0.34}" fill="#18181b" fill-opacity="0.04"/>
			<g fill="#ffffff" fill-opacity="0.9">
				<rect x="${W * 0.875 - 12}" y="${H * 0.165 - 3.5}" width="24" height="7"/>
				<rect x="${W * 0.875 - 3.5}" y="${H * 0.165 - 12}" width="7" height="24"/>
			</g>
			<rect y="${H - 8}" width="${W * 0.5}" height="8" fill="#18181b"/>`,
	},
	{
		id: "seigaiha-wave",
		name: "Seigaiha Wave",
		tone: "light",
		ground: "#faf6ee",
		...LIGHT_TEXT,
		accent: "#1e40af",
		draw: (accent, uid) => `
			<defs>
				<pattern id="sei-${uid}" width="48" height="24" patternUnits="userSpaceOnUse"><g fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="1.2"><circle cx="24" cy="24" r="22"/><circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="8"/><circle cx="0" cy="12" r="22"/><circle cx="0" cy="12" r="15"/><circle cx="0" cy="12" r="8"/><circle cx="48" cy="12" r="22"/><circle cx="48" cy="12" r="15"/><circle cx="48" cy="12" r="8"/></g></pattern>
				<linearGradient id="fade-${uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#faf6ee" stop-opacity="1"/><stop offset="45%" stop-color="#faf6ee" stop-opacity="0.92"/><stop offset="100%" stop-color="#faf6ee" stop-opacity="0"/></linearGradient>
			</defs>
			<rect width="${W}" height="${H}" fill="#faf6ee"/>
			<rect x="${W * 0.42}" width="${W * 0.58}" height="${H}" fill="url(#sei-${uid})"/>
			<rect x="${W * 0.42}" width="${W * 0.58}" height="${H}" fill="url(#fade-${uid})"/>
			<circle cx="${W * 0.84}" cy="${H * 0.28}" r="36" fill="#dc2626" fill-opacity="0.16"/>
			<circle cx="${W * 0.84}" cy="${H * 0.28}" r="22" fill="#dc2626" fill-opacity="0.26"/>
			<line x1="20" y1="${H - 18}" x2="${W - 20}" y2="${H - 18}" stroke="${accent}" stroke-opacity="0.2" stroke-width="1"/>`,
	},
	{
		id: "liquid-pastel",
		name: "Liquid Pastel",
		tone: "light",
		ground: "#f8fafc",
		...LIGHT_TEXT,
		accent: "#6366f1",
		draw: (accent, uid) => `
			<defs>
				<linearGradient id="l1-${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${accent}" stop-opacity="0.28"/><stop offset="100%" stop-color="#ec4899" stop-opacity="0.18"/></linearGradient>
				<linearGradient id="l2-${uid}" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25"/><stop offset="100%" stop-color="${accent}" stop-opacity="0.12"/></linearGradient>
			</defs>
			<rect width="${W}" height="${H}" fill="#f8fafc"/>
			<path d="M ${W * 0.58} 0 C ${W * 0.64} ${H * 0.35}, ${W * 0.52} ${H * 0.68}, ${W * 0.72} ${H} L ${W} ${H} L ${W} 0 Z" fill="url(#l1-${uid})"/>
			<path d="M ${W * 0.74} 0 C ${W * 0.66} ${H * 0.42}, ${W * 0.88} ${H * 0.58}, ${W * 0.78} ${H} L ${W} ${H} L ${W} 0 Z" fill="url(#l2-${uid})"/>
			<circle cx="${W * 0.85}" cy="${H * 0.32}" r="42" fill="#ffffff" fill-opacity="0.45"/>
			<circle cx="${W * 0.85}" cy="${H * 0.32}" r="56" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="1.2"/>
			<circle cx="${W * 0.72}" cy="${H * 0.78}" r="18" fill="${accent}" fill-opacity="0.18"/>`,
	},
	{
		id: "isometric-cubes",
		name: "Isometric Cubes",
		tone: "dark",
		ground: "#0c1222",
		...DARK_TEXT,
		accent: "#06b6d4",
		draw: (accent, uid) => `
			<defs>
				<pattern id="iso-${uid}" width="56" height="64" patternUnits="userSpaceOnUse"><polygon points="28,0 56,16 56,48 28,64 0,48 0,16" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="1"/><polyline points="0,16 28,32 56,16" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="1"/><line x1="28" y1="32" x2="28" y2="64" stroke="${accent}" stroke-opacity="0.22" stroke-width="1"/><polygon points="28,0 56,16 28,32 0,16" fill="${accent}" fill-opacity="0.06"/></pattern>
				<linearGradient id="isomask-${uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#0c1222" stop-opacity="1"/><stop offset="48%" stop-color="#0c1222" stop-opacity="0.88"/><stop offset="100%" stop-color="#0c1222" stop-opacity="0"/></linearGradient>
			</defs>
			<rect width="${W}" height="${H}" fill="#0c1222"/>
			<rect width="${W}" height="${H}" fill="url(#iso-${uid})"/>
			<rect width="${W}" height="${H}" fill="url(#isomask-${uid})"/>
			<g transform="translate(${W * 0.78}, ${H * 0.22})">
				<polygon points="28,0 56,16 28,32 0,16" fill="${accent}" fill-opacity="0.45"/>
				<polygon points="0,16 28,32 28,64 0,48" fill="${accent}" fill-opacity="0.22"/>
				<polygon points="56,16 28,32 28,64 56,48" fill="${accent}" fill-opacity="0.12"/>
			</g>
			<rect width="8" height="${H}" fill="${accent}"/>`,
	},
	{
		id: "halftone-pop",
		name: "Halftone Pop",
		tone: "light",
		ground: "#fffdf9",
		...LIGHT_TEXT,
		accent: "#e11d48",
		draw: (accent, uid) => `
			<defs>
				<pattern id="dots-${uid}" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="3" fill="${accent}" fill-opacity="0.22"/></pattern>
				<clipPath id="clip-${uid}"><circle cx="${W * 0.92}" cy="${H * 0.5}" r="${H * 0.78}"/></clipPath>
			</defs>
			<rect width="${W}" height="${H}" fill="#fffdf9"/>
			<rect width="${W}" height="${H}" fill="url(#dots-${uid})" clip-path="url(#clip-${uid})"/>
			<polygon points="${W * 0.78},0 ${W * 0.84},0 ${W * 0.68},${H} ${W * 0.62},${H}" fill="${accent}" fill-opacity="0.14"/>
			<polygon points="${W * 0.86},0 ${W * 0.89},0 ${W * 0.73},${H} ${W * 0.7},${H}" fill="#18181b" fill-opacity="0.1"/>
			<circle cx="${W * 0.88}" cy="${H * 0.24}" r="20" fill="${accent}"/>
			<rect width="${W}" height="6" fill="#18181b"/>`,
	},
	{
		id: "celestial-map",
		name: "Celestial Map",
		tone: "dark",
		ground: "#0b1026",
		...DARK_TEXT,
		accent: "#eab308",
		draw: (accent, uid) => {
			const cx = W * 0.82;
			const cy = H * 0.36;
			return `
			<defs><radialGradient id="cel-${uid}" cx="82%" cy="36%" r="55%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.24"/><stop offset="100%" stop-color="#0b1026" stop-opacity="0"/></radialGradient></defs>
			<rect width="${W}" height="${H}" fill="#0b1026"/>
			<rect width="${W}" height="${H}" fill="url(#cel-${uid})"/>
			<path d="M ${cx + 12} ${cy - 34} A 36 36 0 1 0 ${cx + 12} ${cy + 34} A 28 28 0 1 1 ${cx + 12} ${cy - 34} Z" fill="${accent}" fill-opacity="0.78"/>
			<g stroke="#ffffff" stroke-opacity="0.22" stroke-width="1" fill="none">
				<polyline points="${W * 0.56},${H * 0.22} ${W * 0.66},${H * 0.42} ${W * 0.76},${H * 0.74} ${W * 0.9},${H * 0.68}"/>
				<line x1="${W * 0.66}" y1="${H * 0.42}" x2="${W * 0.74}" y2="${H * 0.24}"/>
			</g>
			<g fill="#ffffff">
				<circle cx="${W * 0.56}" cy="${H * 0.22}" r="2.5" fill-opacity="0.8"/>
				<circle cx="${W * 0.66}" cy="${H * 0.42}" r="3.5" fill="${accent}"/>
				<circle cx="${W * 0.76}" cy="${H * 0.74}" r="2.5" fill-opacity="0.75"/>
				<circle cx="${W * 0.9}" cy="${H * 0.68}" r="3" fill="${accent}"/>
				<circle cx="${W * 0.74}" cy="${H * 0.24}" r="2" fill-opacity="0.65"/>
				<circle cx="${W * 0.62}" cy="${H * 0.82}" r="1.5" fill-opacity="0.4"/>
				<circle cx="${W * 0.92}" cy="${H * 0.18}" r="1.8" fill-opacity="0.5"/>
			</g>
			<circle cx="${cx}" cy="${cy}" r="76" fill="none" stroke="${accent}" stroke-opacity="0.16" stroke-dasharray="2 6"/>`;
		},
	},
	{
		id: "soundwave-pulse",
		name: "Soundwave Pulse",
		tone: "dark",
		ground: "#121417",
		...DARK_TEXT,
		accent: "#10b981",
		draw: (accent, uid) => {
			const m = H * 0.5;
			return `
			<defs><linearGradient id="sw-${uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${accent}" stop-opacity="0.05"/><stop offset="55%" stop-color="${accent}" stop-opacity="0.55"/><stop offset="100%" stop-color="${accent}" stop-opacity="0.95"/></linearGradient></defs>
			<rect width="${W}" height="${H}" fill="#121417"/>
			<g fill="none" stroke="url(#sw-${uid})">
				<path d="M 0 ${m} Q ${W * 0.18} ${m - 52}, ${W * 0.36} ${m} T ${W * 0.72} ${m} T ${W} ${m}" stroke-width="2.2"/>
				<path d="M 0 ${m} Q ${W * 0.18} ${m + 38}, ${W * 0.36} ${m} T ${W * 0.72} ${m} T ${W} ${m}" stroke-width="1.4" stroke-opacity="0.65"/>
				<path d="M 0 ${m} Q ${W * 0.22} ${m - 76}, ${W * 0.44} ${m} T ${W * 0.88} ${m} T ${W} ${m - 18}" stroke-width="1" stroke-opacity="0.35"/>
			</g>
			<g fill="${accent}" fill-opacity="0.28">
				<rect x="${W - 86}" y="${m - 22}" width="6" height="44" rx="3"/>
				<rect x="${W - 74}" y="${m - 46}" width="6" height="92" rx="3"/>
				<rect x="${W - 62}" y="${m - 64}" width="6" height="128" rx="3"/>
				<rect x="${W - 50}" y="${m - 36}" width="6" height="72" rx="3"/>
				<rect x="${W - 38}" y="${m - 54}" width="6" height="108" rx="3"/>
				<rect x="${W - 26}" y="${m - 26}" width="6" height="52" rx="3"/>
			</g>`;
		},
	},
	{
		id: "terrazzo-stone",
		name: "Terrazzo Stone",
		tone: "light",
		ground: "#f9f6f0",
		...LIGHT_TEXT,
		accent: "#ea580c",
		draw: (accent) => {
			const chip = (pts: [number, number][], fill: string, op: number) =>
				`<polygon points="${pts.map(([x, y]) => `${W * x},${H * y}`).join(" ")}" fill="${fill}" fill-opacity="${op}"/>`;
			return `
			<rect width="${W}" height="${H}" fill="#f9f6f0"/>
			${chip(
				[
					[0.76, 0.12],
					[0.81, 0.08],
					[0.84, 0.18],
					[0.78, 0.22],
				],
				accent,
				0.82,
			)}
			${chip(
				[
					[0.88, 0.16],
					[0.94, 0.12],
					[0.96, 0.26],
					[0.89, 0.24],
				],
				"#1c1917",
				0.72,
			)}
			${chip(
				[
					[0.8, 0.34],
					[0.87, 0.3],
					[0.9, 0.42],
					[0.82, 0.46],
				],
				"#d97706",
				0.45,
			)}
			${chip(
				[
					[0.91, 0.44],
					[0.97, 0.38],
					[0.98, 0.56],
					[0.92, 0.54],
				],
				accent,
				0.35,
			)}
			${chip(
				[
					[0.72, 0.58],
					[0.77, 0.54],
					[0.79, 0.66],
					[0.73, 0.68],
				],
				"#0f766e",
				0.48,
			)}
			${chip(
				[
					[0.83, 0.64],
					[0.9, 0.6],
					[0.92, 0.76],
					[0.84, 0.74],
				],
				"#1c1917",
				0.18,
			)}
			${chip(
				[
					[0.76, 0.8],
					[0.83, 0.78],
					[0.84, 0.92],
					[0.75, 0.9],
				],
				accent,
				0.65,
			)}
			${chip(
				[
					[0.9, 0.82],
					[0.96, 0.78],
					[0.98, 0.9],
					[0.91, 0.94],
				],
				"#d97706",
				0.55,
			)}
			${chip(
				[
					[0.64, 0.84],
					[0.69, 0.8],
					[0.7, 0.92],
					[0.63, 0.91],
				],
				"#1c1917",
				0.3,
			)}
			<circle cx="${W * 0.86}" cy="${H * 0.5}" r="5" fill="${accent}"/>
			<circle cx="${W * 0.72}" cy="${H * 0.28}" r="4" fill="#1c1917" fill-opacity="0.4"/>
			<rect width="10" height="${H}" fill="${accent}"/>`;
		},
	},
	{
		id: "monolith-steps",
		name: "Monolith Steps",
		tone: "light",
		ground: "#f1f5f4",
		...LIGHT_TEXT,
		accent: "#0f766e",
		draw: (accent) => `
			<rect width="${W}" height="${H}" fill="#f1f5f4"/>
			<rect x="${W * 0.68}" y="${H * 0.14}" width="${W * 0.32}" height="${H * 0.86}" fill="${accent}" fill-opacity="0.08"/>
			<rect x="${W * 0.76}" y="${H * 0.28}" width="${W * 0.24}" height="${H * 0.72}" fill="${accent}" fill-opacity="0.14"/>
			<rect x="${W * 0.84}" y="${H * 0.44}" width="${W * 0.16}" height="${H * 0.56}" fill="${accent}" fill-opacity="0.24"/>
			<rect x="${W * 0.92}" y="${H * 0.62}" width="${W * 0.08}" height="${H * 0.38}" fill="${accent}" fill-opacity="0.45"/>
			<g stroke="#0f172a" stroke-opacity="0.14" stroke-width="1">
				<line x1="${W * 0.68}" y1="0" x2="${W * 0.68}" y2="${H}"/>
				<line x1="0" y1="${H * 0.14}" x2="${W}" y2="${H * 0.14}"/>
			</g>
			<rect x="${W * 0.68}" y="${H * 0.14}" width="12" height="12" fill="${accent}"/>`,
	},
] as const satisfies readonly PassArtwork[];

export type PassDesignId = (typeof PASS_ARTWORK)[number]["id"];

export const PASS_DESIGN_IDS = PASS_ARTWORK.map((a) => a.id) as [
	PassDesignId,
	...PassDesignId[],
];

const BY_ID = new Map<string, PassArtwork>(PASS_ARTWORK.map((a) => [a.id, a]));

export function passArtwork(id: string): PassArtwork {
	return BY_ID.get(id) ?? PASS_ARTWORK[0];
}

/**
 * The accents an organizer can choose: the data colours of design-spec.md.
 * A pass is the same in both themes, so the design's tone picks the value:
 * the light values on a light design, the dark values on a dark one, where
 * the light ones are too dim. Null keeps the design's own.
 */
export const PASS_ACCENTS = {
	green: "#1f7a4d",
	blue: "#1971c2",
	pink: "#c2255c",
	violet: "#7048e8",
	cyan: "#0b7285",
} as const;

/** The same accents on a dark design: the spec's dark values. */
export const PASS_ACCENTS_ON_DARK: Record<keyof typeof PASS_ACCENTS, string> = {
	green: "#2d9b5e",
	blue: "#4dabf7",
	pink: "#f783ac",
	violet: "#b197fc",
	cyan: "#3bc9db",
};

export type PassAccent = keyof typeof PASS_ACCENTS;

export const PASS_ACCENT_KEYS = Object.keys(PASS_ACCENTS) as [
	PassAccent,
	...PassAccent[],
];

export const PASS_ACCENT_NAMES: Record<PassAccent, string> = {
	green: "Green",
	blue: "Blue",
	pink: "Pink",
	violet: "Violet",
	cyan: "Cyan",
};

export function accentColour(id: string, accent: PassAccent | null): string {
	const art = passArtwork(id);
	if (!accent) return art.accent;
	return art.tone === "dark"
		? PASS_ACCENTS_ON_DARK[accent]
		: PASS_ACCENTS[accent];
}
