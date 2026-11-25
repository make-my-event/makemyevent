"use client";

import { safeLink } from "@makemyevent/core";
import Image from "@tiptap/extension-image";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useId, useRef, useState } from "react";
import {
	BulletListIcon,
	CodeBlockIcon,
	DividerIcon,
	ImageIcon,
	LinkIcon,
	NumberedListIcon,
	QuoteIcon,
	RedoIcon,
	UndoIcon,
} from "@/components/icons";
import dialog from "../../create-event.module.css";
import { Popup } from "../../popup";
import { AboutEditorSkeleton } from "./about-editor-skeleton";
import styles from "./about-editor.module.css";

const ACCEPT = "image/jpeg,image/png,image/webp";
/** The toolbar before anything is selected or typed. */
const NOTHING_ON = {
	h1: false,
	h2: false,
	h3: false,
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	code: false,
	bullet: false,
	ordered: false,
	codeBlock: false,
	quote: false,
	link: false,
	canUndo: false,
	canRedo: false,
};

const isMac =
	typeof navigator !== "undefined" &&
	/Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

/**
 * The About text: a rich-text editor whose toolbar makes exactly the parts
 * the server keeps (packages/core/src/about.ts), so nothing typed here is
 * dropped on save. The document goes up as JSON; the server rebuilds it from
 * an allowlist. Links only to https: or email; images only uploaded here.
 *
 * Loaded on demand (the editor is the heaviest thing on this tab), with a
 * skeleton the same size meanwhile.
 */
export default function AboutEditor({
	eventId,
	value,
	onChange,
	error,
}: {
	eventId: string;
	/** The document as JSON text; "" when empty. */
	value: string;
	onChange: (value: string) => void;
	error: string | null;
}) {
	const errorId = useId();
	const [linkOpen, setLinkOpen] = useState(false);
	const [image, setImage] = useState<
		{ stage: "uploading" } | { stage: "describe"; url: string } | null
	>(null);
	const [imageError, setImageError] = useState<string | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			StarterKit.configure({
				heading: { levels: [1, 2, 3] },
				link: {
					openOnClick: false,
					autolink: true,
					defaultProtocol: "https",
					// The server's own rule, so a link it would refuse never appears.
					isAllowedUri: (url) => safeLink(url) !== null,
				},
			}),
			Image.configure({ inline: false, allowBase64: false }),
			Placeholder.configure({
				placeholder:
					"What is the event about? Who is it for, and what will they get from it?",
			}),
			CharacterCount,
		],
		content: value ? (JSON.parse(value) as object) : "",
		editorProps: {
			attributes: {
				class: styles.content ?? "",
				role: "textbox",
				"aria-multiline": "true",
				"aria-label": "About the event",
				...(error
					? { "aria-invalid": "true", "aria-describedby": errorId }
					: {}),
			},
		},
		onUpdate: ({ editor }) =>
			onChange(editor.isEmpty ? "" : JSON.stringify(editor.getJSON())),
	});

	// Only what the toolbar draws, so typing does not re-render the page.
	const selected = useEditorState({
		editor,
		selector: ({ editor }) =>
			editor
				? {
						h1: editor.isActive("heading", { level: 1 }),
						h2: editor.isActive("heading", { level: 2 }),
						h3: editor.isActive("heading", { level: 3 }),
						bold: editor.isActive("bold"),
						italic: editor.isActive("italic"),
						underline: editor.isActive("underline"),
						strike: editor.isActive("strike"),
						code: editor.isActive("code"),
						bullet: editor.isActive("bulletList"),
						ordered: editor.isActive("orderedList"),
						codeBlock: editor.isActive("codeBlock"),
						quote: editor.isActive("blockquote"),
						link: editor.isActive("link"),
						canUndo: editor.can().undo(),
						canRedo: editor.can().redo(),
						words: editor.storage.characterCount.words() as number,
					}
				: null,
	});

	async function upload(file: File | undefined) {
		if (!file || !editor) return;
		setImageError(null);
		if (!ACCEPT.split(",").includes(file.type)) {
			setImageError("Use a JPG, PNG or WebP image.");
			return;
		}
		// As the server, whose host refuses bodies over 4.5 MB.
		if (file.size > 4 * 1024 * 1024) {
			setImageError("Use an image under 4 MB.");
			return;
		}
		setImage({ stage: "uploading" });
		try {
			const body = new FormData();
			body.set("kind", "inline");
			body.set("file", file);
			const response = await fetch(`/api/events/${eventId}/media`, {
				method: "POST",
				body,
			});
			const result = (await response.json().catch(() => ({}))) as {
				url?: string;
				error?: string;
			};
			if (!response.ok || !result.url) {
				setImage(null);
				setImageError(result.error ?? "That upload did not work. Try again.");
				return;
			}
			setImage({ stage: "describe", url: result.url });
		} catch {
			setImage(null);
			setImageError(
				"You seem to be offline. Try again when you are connected.",
			);
		}
	}

	if (!editor) return <AboutEditorSkeleton />;
	// The toolbar's state is first worked out before the editor exists, and
	// again only on the next change; until someone types, nothing is on.
	const state = selected ?? {
		...NOTHING_ON,
		words: editor.storage.characterCount.words() as number,
	};

	const run = () => editor.chain().focus();

	return (
		<section className={styles.section} aria-labelledby="about-title">
			<header className={styles.head}>
				<h3 className={styles.title} id="about-title">
					About
				</h3>
				<p className={styles.count} aria-live="polite">
					{state.words.toLocaleString("en-US")}{" "}
					{state.words === 1 ? "word" : "words"}
				</p>
			</header>

			<div className={styles.frame} data-invalid={error ? true : undefined}>
				<div className={styles.toolbar} role="toolbar" aria-label="Formatting">
					<div className={styles.group}>
						<Tool
							label="Heading 1"
							active={state.h1}
							onClick={() => run().toggleHeading({ level: 1 }).run()}
						>
							H<sub>1</sub>
						</Tool>
						<Tool
							label="Heading 2"
							active={state.h2}
							onClick={() => run().toggleHeading({ level: 2 }).run()}
						>
							H<sub>2</sub>
						</Tool>
						<Tool
							label="Heading 3"
							active={state.h3}
							onClick={() => run().toggleHeading({ level: 3 }).run()}
						>
							H<sub>3</sub>
						</Tool>
					</div>
					<div className={styles.group}>
						<Tool
							label="Bold"
							keys={`${mod}+B`}
							active={state.bold}
							onClick={() => run().toggleBold().run()}
						>
							<b>B</b>
						</Tool>
						<Tool
							label="Italic"
							keys={`${mod}+I`}
							active={state.italic}
							onClick={() => run().toggleItalic().run()}
						>
							<i>I</i>
						</Tool>
						<Tool
							label="Underline"
							keys={`${mod}+U`}
							active={state.underline}
							onClick={() => run().toggleUnderline().run()}
						>
							<u>U</u>
						</Tool>
						<Tool
							label="Strikethrough"
							keys={`${mod}+Shift+S`}
							active={state.strike}
							onClick={() => run().toggleStrike().run()}
						>
							<s>S</s>
						</Tool>
						<Tool
							label="Inline code"
							keys={`${mod}+E`}
							active={state.code}
							onClick={() => run().toggleCode().run()}
						>
							<span className={styles.mono}>&lt;&gt;</span>
						</Tool>
					</div>
					<div className={styles.group}>
						<Tool
							label="Bulleted list"
							keys={`${mod}+Shift+8`}
							active={state.bullet}
							onClick={() => run().toggleBulletList().run()}
						>
							<BulletListIcon />
						</Tool>
						<Tool
							label="Numbered list"
							keys={`${mod}+Shift+7`}
							active={state.ordered}
							onClick={() => run().toggleOrderedList().run()}
						>
							<NumberedListIcon />
						</Tool>
					</div>
					<div className={styles.group}>
						<Tool
							label="Code block"
							keys={`${mod}+Alt+C`}
							active={state.codeBlock}
							onClick={() => run().toggleCodeBlock().run()}
						>
							<CodeBlockIcon />
						</Tool>
						<Tool
							label="Quote"
							keys={`${mod}+Shift+B`}
							active={state.quote}
							onClick={() => run().toggleBlockquote().run()}
						>
							<QuoteIcon />
						</Tool>
						<Tool
							label="Divider"
							onClick={() => run().setHorizontalRule().run()}
						>
							<DividerIcon />
						</Tool>
					</div>
					<div className={styles.group}>
						<Tool
							label={state.link ? "Edit link" : "Link"}
							keys={`${mod}+K`}
							active={state.link}
							onClick={() => setLinkOpen(true)}
							popup
						>
							<LinkIcon />
						</Tool>
						<Tool
							label="Image"
							onClick={() => fileInput.current?.click()}
							disabled={image?.stage === "uploading"}
						>
							<ImageIcon />
						</Tool>
					</div>
					<div className={`${styles.group} ${styles.history}`}>
						<Tool
							label="Undo"
							keys={`${mod}+Z`}
							onClick={() => run().undo().run()}
							disabled={!state.canUndo}
						>
							<UndoIcon />
						</Tool>
						<Tool
							label="Redo"
							keys={isMac ? "⌘+Shift+Z" : "Ctrl+Y"}
							onClick={() => run().redo().run()}
							disabled={!state.canRedo}
						>
							<RedoIcon />
						</Tool>
					</div>
				</div>

				<EditorContent
					editor={editor}
					onKeyDown={(event) => {
						if (
							(event.metaKey || event.ctrlKey) &&
							event.key.toLowerCase() === "k"
						) {
							event.preventDefault();
							setLinkOpen(true);
						}
					}}
				/>
			</div>

			<p className={styles.status} aria-live="polite">
				{error ? (
					<span className={styles.error} id={errorId}>
						{error}
					</span>
				) : imageError ? (
					<span className={styles.error}>{imageError}</span>
				) : image?.stage === "uploading" ? (
					"Uploading the image…"
				) : null}
			</p>

			<input
				ref={fileInput}
				type="file"
				accept={ACCEPT}
				hidden
				onChange={(event) => {
					void upload(event.target.files?.[0]);
					event.target.value = "";
				}}
			/>

			<LinkPopup
				open={linkOpen}
				initial={
					(editor.getAttributes("link").href as string | undefined) ?? ""
				}
				hasLink={state.link}
				onClose={() => {
					setLinkOpen(false);
					editor.commands.focus();
				}}
				onApply={(href) => {
					const chain = editor.chain().focus().extendMarkRange("link");
					if (editor.state.selection.empty && !state.link)
						chain
							.insertContent({
								type: "text",
								text: href,
								marks: [{ type: "link", attrs: { href } }],
							})
							.run();
					else chain.setLink({ href }).run();
					setLinkOpen(false);
				}}
				onRemove={() => {
					editor.chain().focus().extendMarkRange("link").unsetLink().run();
					setLinkOpen(false);
				}}
			/>

			<ImagePopup
				url={image?.stage === "describe" ? image.url : null}
				onClose={() => setImage(null)}
				onInsert={(url, alt) => {
					editor.chain().focus().setImage({ src: url, alt }).run();
					setImage(null);
				}}
			/>
		</section>
	);
}

function Tool({
	label,
	keys,
	active,
	disabled,
	popup,
	onClick,
	children,
}: {
	label: string;
	keys?: string;
	active?: boolean;
	disabled?: boolean;
	popup?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			className={styles.tool}
			aria-label={label}
			aria-pressed={popup || active === undefined ? undefined : active}
			aria-haspopup={popup ? "dialog" : undefined}
			title={keys ? `${label} (${keys})` : label}
			disabled={disabled}
			// Keeps the text selected while the button is pressed.
			onMouseDown={(event) => event.preventDefault()}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function LinkPopup({
	open,
	initial,
	hasLink,
	onClose,
	onApply,
	onRemove,
}: {
	open: boolean;
	initial: string;
	hasLink: boolean;
	onClose: () => void;
	onApply: (href: string) => void;
	onRemove: () => void;
}) {
	const id = useId();
	const [value, setValue] = useState("");
	const [message, setMessage] = useState<string | null>(null);
	const [seen, setSeen] = useState(false);
	if (open && !seen) {
		setSeen(true);
		setValue(initial);
		setMessage(null);
	}
	if (!open && seen) setSeen(false);

	return (
		<Popup
			open={open}
			onClose={onClose}
			title={hasLink ? "Edit link" : "Add a link"}
		>
			<form
				className={styles.popupForm}
				noValidate
				onSubmit={(event) => {
					event.preventDefault();
					const typed = value.trim();
					const candidate = /^[^:/]+@[^/]+$/.test(typed)
						? `mailto:${typed}`
						: /^[a-z][a-z0-9+.-]*:/i.test(typed)
							? typed
							: `https://${typed}`;
					const href = safeLink(candidate);
					if (!href) {
						setMessage("Use a web address (https://…) or an email address.");
						return;
					}
					onApply(href);
				}}
			>
				<div className={dialog.field}>
					<label className={dialog.label} htmlFor={id}>
						Web address or email
					</label>
					<input
						id={id}
						className={dialog.input}
						value={value}
						onChange={(event) => setValue(event.target.value)}
						placeholder="https://example.com"
						inputMode="url"
						autoComplete="off"
						spellCheck={false}
						aria-invalid={message ? true : undefined}
					/>
					{message ? (
						<p className={styles.error} role="alert">
							{message}
						</p>
					) : null}
				</div>
				<div className={dialog.actions}>
					{hasLink ? (
						<button
							type="button"
							className={`${dialog.secondary} ${dialog.discard}`}
							onClick={onRemove}
						>
							Remove link
						</button>
					) : null}
					<button type="submit" className={dialog.primary}>
						{hasLink ? "Save link" : "Add link"}
					</button>
				</div>
			</form>
		</Popup>
	);
}

function ImagePopup({
	url,
	onClose,
	onInsert,
}: {
	url: string | null;
	onClose: () => void;
	onInsert: (url: string, alt: string) => void;
}) {
	const id = useId();
	const [alt, setAlt] = useState("");
	return (
		<Popup open={url !== null} onClose={onClose} title="Describe the image">
			<form
				className={styles.popupForm}
				onSubmit={(event) => {
					event.preventDefault();
					if (url) onInsert(url, alt.trim());
					setAlt("");
				}}
			>
				{url ? (
					// biome-ignore lint/performance/noImgElement: our own processed upload, shown as a preview
					<img className={styles.preview} src={url} alt="" />
				) : null}
				<div className={dialog.field}>
					<label className={dialog.label} htmlFor={id}>
						What does it show?
					</label>
					<input
						id={id}
						className={dialog.input}
						value={alt}
						maxLength={250}
						onChange={(event) => setAlt(event.target.value)}
						placeholder="For example: the main hall set up for talks"
						autoComplete="off"
					/>
					<p className={styles.hint}>
						Read aloud to people using a screen reader. Leave empty if it is
						only decoration.
					</p>
				</div>
				<div className={dialog.actions}>
					<button type="submit" className={dialog.primary}>
						Insert image
					</button>
				</div>
			</form>
		</Popup>
	);
}
