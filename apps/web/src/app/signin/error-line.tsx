import styles from "./signin.module.css";
import twoStep from "./two-step.module.css";

/**
 * What went wrong, beside the field it is about. The box is always there, so
 * a screen reader hears what is put in it; `attempt` re-announces the same
 * words when the same thing goes wrong again.
 */
export function ErrorLine({
	id,
	message,
	attempt = 0,
}: {
	id: string;
	message: string | null | undefined;
	attempt?: number;
}) {
	return (
		<div id={id} role="alert" className={twoStep.alert}>
			{message ? (
				<p className={styles.error} key={attempt}>
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
					<span>{message}</span>
				</p>
			) : null}
		</div>
	);
}
