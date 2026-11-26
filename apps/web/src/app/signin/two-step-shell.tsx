import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import signin from "./signin.module.css";
import styles from "./two-step.module.css";

/**
 * The frame of the second step's screens: sign-in's form side on its own,
 * without the pitch. Whoever is here has signed in already.
 */
export function TwoStepShell({ children }: { children: React.ReactNode }) {
	return (
		<div className={signin.shell}>
			<main className={styles.main}>
				<div className={styles.bar}>
					<Brand />
					<ThemeToggle />
				</div>
				<div className={styles.card}>{children}</div>
			</main>
		</div>
	);
}

/** For someone who signed in with the wrong account. */
export function SignOutInstead() {
	return (
		<form action="/auth/signout" method="post">
			<button type="submit" className={`${signin.btn} ${signin.btnQuiet}`}>
				Sign out
			</button>
		</form>
	);
}
