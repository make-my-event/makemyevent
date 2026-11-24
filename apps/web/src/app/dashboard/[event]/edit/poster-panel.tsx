"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { TrashIcon, UploadIcon } from "@/components/icons";
import styles from "./event-page.module.css";

type Kind = "poster" | "logo";
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;

export type Media = {
	poster: { large: string; small: string } | null;
	logo: string | null;
};

/**
 * The poster, 4:5 like a social post, with the logo over its corner.
 *
 * Images save the moment they are chosen (they are files, not form fields):
 * a preview shows at once from the file itself while it uploads, and the
 * server's processed copy replaces it when it is stored. Anything but a
 * 4:5 image is cropped to 4:5 around its most eye-catching part.
 */
export function PosterPanel({
	eventId,
	media,
	alt,
}: {
	eventId: string;
	media: Media;
	/** What the poster shows, for screen readers; edited under the poster. */
	alt: string;
}) {
	const router = useRouter();
	const posterInput = useRef<HTMLInputElement>(null);
	const logoInput = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState<Kind | null>(null);
	const [preview, setPreview] = useState<{ kind: Kind; url: string } | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const statusId = useId();

	// A preview made from the file is released once it is no longer shown.
	useEffect(() => {
		return () => {
			if (preview) URL.revokeObjectURL(preview.url);
		};
	}, [preview]);

	async function upload(kind: Kind, file: File | undefined) {
		if (!file) return;
		setError(null);
		if (!ACCEPT.split(",").includes(file.type)) {
			setError("Use a JPG, PNG or WebP image.");
			return;
		}
		if (file.size > MAX_BYTES) {
			setError("Use an image under 10 MB.");
			return;
		}
		setPreview({ kind, url: URL.createObjectURL(file) });
		setBusy(kind);
		try {
			const body = new FormData();
			body.set("kind", kind);
			body.set("file", file);
			const response = await fetch(`/api/events/${eventId}/media`, {
				method: "POST",
				body,
			});
			if (!response.ok) {
				const { error: message } = (await response
					.json()
					.catch(() => ({}))) as {
					error?: string;
				};
				setError(message ?? "That upload did not work. Try again.");
				setPreview(null);
				return;
			}
			router.refresh();
		} catch {
			setError("You seem to be offline. Try again when you are connected.");
			setPreview(null);
		} finally {
			setBusy(null);
		}
	}

	async function remove(kind: Kind) {
		setError(null);
		setBusy(kind);
		try {
			const response = await fetch(
				`/api/events/${eventId}/media?kind=${kind}`,
				{
					method: "DELETE",
				},
			);
			if (!response.ok) {
				const { error: message } = (await response
					.json()
					.catch(() => ({}))) as {
					error?: string;
				};
				setError(message ?? "That did not work. Try again.");
				return;
			}
			setPreview(null);
			router.refresh();
		} finally {
			setBusy(null);
		}
	}

	// Once the server's copy arrives, the local preview steps aside.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only when the stored images change
	useEffect(() => {
		setPreview(null);
	}, [media.poster?.large, media.logo]);

	const posterSrc =
		preview?.kind === "poster" ? preview.url : (media.poster?.large ?? null);
	const logoSrc = preview?.kind === "logo" ? preview.url : media.logo;

	return (
		<div className={styles.posterGroup}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: dropping a file is a pointer shortcut; the keyboard way is the Add poster / Replace poster buttons */}
			<div
				className={styles.poster}
				data-dragging={dragging || undefined}
				aria-busy={busy === "poster" || undefined}
				onDragOver={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(event) => {
					event.preventDefault();
					setDragging(false);
					void upload("poster", event.dataTransfer.files[0]);
				}}
			>
				{posterSrc ? (
					// biome-ignore lint/performance/noImgElement: a stored or just-chosen upload, already sized by the server; next/image would re-process it
					<img
						className={styles.posterImage}
						src={posterSrc}
						srcSet={
							posterSrc === media.poster?.large
								? `${media.poster.small} 540w, ${media.poster.large} 1080w`
								: undefined
						}
						sizes="(min-width: 1024px) 360px, 100vw"
						alt={alt}
						width={1080}
						height={1350}
					/>
				) : (
					<button
						type="button"
						className={styles.posterEmpty}
						onClick={() => posterInput.current?.click()}
						aria-describedby={error ? statusId : undefined}
					>
						<span className={styles.uploadTile} aria-hidden="true">
							<UploadIcon />
						</span>
						<span className={styles.posterTitle}>Upload event poster</span>
						<span className={styles.posterChip}>1080 × 1350 · 4:5</span>
						<span className={styles.srOnly}>
							Or drop an image here. JPG, PNG or WebP, up to 10 MB.
						</span>
					</button>
				)}

				{busy === "poster" ? (
					<span className={styles.uploading}>Uploading…</span>
				) : null}

				<div className={styles.logoWrap}>
					<button
						type="button"
						className={styles.logo}
						onClick={() => logoInput.current?.click()}
						title={logoSrc ? "Change logo" : "Add logo"}
						aria-busy={busy === "logo" || undefined}
					>
						{logoSrc ? (
							// biome-ignore lint/performance/noImgElement: a stored or just-chosen upload, already sized by the server
							<img className={styles.logoImage} src={logoSrc} alt="" />
						) : (
							<span className={styles.logoEmpty} aria-hidden="true">
								<UploadIcon />
								Logo
							</span>
						)}
						<span className={styles.srOnly}>
							{logoSrc ? "Change logo" : "Add logo"}
						</span>
					</button>
					{media.logo && busy !== "logo" ? (
						<button
							type="button"
							className={styles.logoRemove}
							onClick={() => void remove("logo")}
							title="Remove logo"
						>
							<span className={styles.srOnly}>Remove logo</span>
							<TrashIcon />
						</button>
					) : null}
				</div>
				{/* Over the poster's top corner, not under it: the column keeps
				    its height whether or not there is a poster. */}
				{media.poster ? (
					<div className={styles.posterTools}>
						<button
							type="button"
							className={styles.toolButton}
							onClick={() => posterInput.current?.click()}
							disabled={busy !== null}
						>
							Replace
						</button>
						<button
							type="button"
							className={`${styles.toolButton} ${styles.toolDanger}`}
							onClick={() => void remove("poster")}
							disabled={busy !== null}
						>
							Remove
						</button>
					</div>
				) : null}
			</div>

			<p className={styles.uploadStatus} id={statusId} aria-live="polite">
				{error ? <span className={styles.statusError}>{error}</span> : null}
				{!error && busy ? `Uploading the ${busy}…` : null}
			</p>

			<input
				ref={posterInput}
				type="file"
				accept={ACCEPT}
				hidden
				onChange={(event) => {
					void upload("poster", event.target.files?.[0]);
					event.target.value = "";
				}}
			/>
			<input
				ref={logoInput}
				type="file"
				accept={ACCEPT}
				hidden
				onChange={(event) => {
					void upload("logo", event.target.files?.[0]);
					event.target.value = "";
				}}
			/>
		</div>
	);
}
