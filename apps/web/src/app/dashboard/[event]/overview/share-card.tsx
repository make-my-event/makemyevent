import { qrSvg as drawQr } from "@/lib/qr";
import { LinkIcon } from "@/components/icons";
import { CopyLinkButton } from "./copy-link-button";
import { EmbedButton, QrButton } from "./share-actions";
import styles from "./share-card.module.css";

/**
 * The event's public link, with the three ways it leaves the dashboard: copy
 * it, show or download it as a QR code, or paste a button onto another site.
 *
 *   [🔗 https://makemyevent.org/event/slug        Not live yet] [Copy] [QR] [<>]
 *
 * A draft's link is real (it will not change when the event is published),
 * so it can be prepared and shared ahead; the tag in the field says it does
 * not open for anyone else yet.
 *
 * The QR code is drawn here, on the server, as SVG: the QR library never
 * reaches the browser.
 */
export async function ShareCard({
	url,
	title,
	published,
}: {
	url: string;
	title: string;
	published: boolean;
}) {
	const qrSvg = await drawQr(url);

	return (
		<section className={styles.card} aria-label="Share">
			<label className={styles.field}>
				<span className={styles.srOnly}>Event link</span>
				<LinkIcon className={styles.fieldIcon} />
				<input
					className={styles.input}
					type="url"
					value={url}
					readOnly
					spellCheck={false}
				/>
				{published ? null : (
					<span
						className={styles.notLive}
						title="Only you can open it until it is published"
					>
						Not live yet
					</span>
				)}
			</label>
			<div className={styles.buttons}>
				<CopyLinkButton url={url} />
				<QrButton svg={qrSvg} title={title} />
				<EmbedButton url={url} title={title} />
			</div>
		</section>
	);
}

/** The card while it loads: the field and three buttons, at their sizes. */
export function ShareCardSkeleton() {
	return (
		<div className={styles.card} aria-hidden="true">
			<span className={`${styles.bone} ${styles.boneField}`} />
			<div className={styles.buttons}>
				<span className={`${styles.bone} ${styles.boneButton}`} />
				<span className={`${styles.bone} ${styles.boneButton}`} />
				<span className={`${styles.bone} ${styles.boneIcon}`} />
			</div>
		</div>
	);
}
