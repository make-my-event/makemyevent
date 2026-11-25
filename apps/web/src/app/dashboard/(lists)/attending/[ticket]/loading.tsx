import dashboard from "../../../dashboard.module.css";
import styles from "./ticket.module.css";

/** The pass's shape while it loads: the details, the tear, the QR's square. */
export default function TicketLoading() {
	return (
		<main className={dashboard.main} aria-busy="true">
			<span className={dashboard.srOnly}>Loading your pass</span>
			<div className={styles.page} aria-hidden="true">
				<span className={`${dashboard.bone} ${styles.boneBack}`} />
				<div className={styles.ticket}>
					<div className={styles.details}>
						<span className={`${dashboard.bone} ${styles.boneTitle}`} />
						<span className={`${dashboard.bone} ${styles.boneFacts}`} />
					</div>
					<div className={styles.stub}>
						<span className={`${dashboard.bone} ${styles.qr}`} />
						<span className={`${dashboard.bone} ${styles.boneCode}`} />
					</div>
				</div>
			</div>
		</main>
	);
}
