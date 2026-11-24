"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { LinkIcon } from "@/components/icons";
import { ownClose, useModalDialog } from "@/components/ui/use-modal-dialog";
import { setListing } from "./actions";
import styles from "./visibility-dialog.module.css";

/** A compass: found by browsing. */
function ExploreIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			width="22"
			height="22"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
		>
			<circle cx="12" cy="12" r="9" />
			<path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
		</svg>
	);
}

/**
 * Asked once, straight after Create Event: who should be able to find this
 * event once it is published. Two choices, the current one (only people
 * with the link) picked, each showing the address where it would be found.
 *
 * Closing it any way keeps the current choice. Either way the flag leaves
 * the address, so a reload or a shared link never asks again. The answer is
 * the Public listing switch under Registration behaviour, where it can be
 * changed later.
 */
export function VisibilityDialog({
	eventId,
	listed: initial,
	origin,
	address,
}: {
	eventId: string;
	listed: boolean;
	/** The site's host, e.g. makemyevent.org. */
	origin: string;
	address: string;
}) {
	const id = useId();
	// Open from the first render: it is shown only when asked for.
	const ref = useModalDialog(true);
	const router = useRouter();
	const pathname = usePathname();
	const [listed, setListed] = useState(initial);
	const [error, setError] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	// Off the address, so it is asked once.
	const leave = () => router.replace(pathname, { scroll: false });

	function confirm() {
		if (listed === initial) {
			ref.current?.close();
			return;
		}
		startTransition(async () => {
			const result = await setListing(eventId, listed);
			if (!result.ok) {
				setError(result.message);
				return;
			}
			ref.current?.close();
			router.refresh();
		});
	}

	const choices = [
		{
			value: false,
			title: "Only people with the link",
			body: "For a private group or an invite-only crowd. You share the link; it never shows on Explore.",
			where: `${origin}/event/${address}`,
			Icon: LinkIcon,
		},
		{
			value: true,
			title: "Anyone browsing Explore",
			body: "For an open event that wants new faces. It joins the list of upcoming events.",
			where: `${origin}/explore`,
			Icon: ExploreIcon,
		},
	] as const;

	return (
		<dialog
			ref={ref}
			className={styles.dialog}
			aria-labelledby={`${id}title`}
			aria-describedby={`${id}lead`}
			onClose={ownClose(leave)}
		>
			<form
				className={styles.panel}
				onSubmit={(event) => {
					event.preventDefault();
					confirm();
				}}
			>
				<header className={styles.head}>
					<p className={styles.step}>Event created</p>
					<h2 className={styles.title} id={`${id}title`}>
						Who should find it?
					</h2>
					<p className={styles.lead} id={`${id}lead`}>
						Nothing is visible until you publish. This decides what happens
						then.
					</p>
				</header>

				<fieldset className={styles.choices}>
					<legend className={styles.srOnly}>Who can find the event</legend>
					{choices.map(({ value, title, body, where, Icon }) => (
						<label key={title} className={styles.choice}>
							<input
								className={styles.radio}
								type="radio"
								name={`${id}listed`}
								checked={listed === value}
								onChange={() => {
									setListed(value);
									setError(null);
								}}
							/>
							<span className={styles.tile}>
								<Icon />
							</span>
							<span className={styles.text}>
								<span className={styles.choiceTitle}>{title}</span>
								<span className={styles.choiceBody}>{body}</span>
								<span className={styles.where}>{where}</span>
							</span>
						</label>
					))}
				</fieldset>

				{error ? (
					<p className={styles.error} role="alert">
						{error}
					</p>
				) : null}

				<footer className={styles.foot}>
					<p className={styles.note}>
						Change it any time with Public listing, under Registration
						behaviour.
					</p>
					<button
						type="submit"
						className={styles.primary}
						disabled={pending}
						aria-busy={pending || undefined}
					>
						{pending ? "Saving…" : "Continue"}
					</button>
				</footer>
			</form>
		</dialog>
	);
}
