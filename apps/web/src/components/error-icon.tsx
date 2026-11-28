/** Beside an error's words, so it is never told by colour alone. */
export function ErrorIcon() {
	return (
		<svg
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			aria-hidden="true"
		>
			<circle cx="8" cy="8" r="6.5" />
			<path d="M8 4.75v3.75M8 11.1h.01" />
		</svg>
	);
}
