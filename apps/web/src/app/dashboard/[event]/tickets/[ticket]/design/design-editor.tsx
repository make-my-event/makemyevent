"use client";

import {
	artworkMarkup,
	clampLayer,
	codeMarkup,
	defaultPassDesign,
	layerBox,
	layerText,
	lowContrast,
	newLayerId,
	PASS_ACCENT_KEYS,
	PASS_ACCENT_NAMES,
	PASS_ACCENTS,
	PASS_ARTWORK,
	PASS_COLOUR_KEYS,
	PASS_COLOUR_NAMES,
	PASS_FIELD_LABELS,
	PASS_FIELDS,
	PASS_HEIGHT,
	PASS_LAYERS_MAX,
	PASS_OWN_TEXT_MAX,
	PASS_QR_MAX,
	PASS_QR_MIN,
	PASS_SAFE,
	PASS_SIZE_NAMES,
	PASS_WIDTH,
	type PassAccent,
	type PassDesign,
	type PassField,
	type PassLayer,
	type PassTextLayer,
	type PassTextSource,
	type PassTextSize,
	type PassValues,
	passArtwork,
	SAMPLE_CODE,
	textMarkup,
	accentColour,
} from "@makemyevent/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { TrashIcon } from "@/components/icons";
import { SaveBar, type SaveMessage } from "@/components/ui/save-bar";
import { useDraft } from "@/components/ui/use-draft";
import { PAGE_PASS_FONTS } from "@/lib/pass-fonts";
import dialog from "../../../../create-event.module.css";
import { Popup } from "../../../../popup";
import { useUnsavedChanges } from "../../../unsaved-changes";
import { saveDesign, applyDesignToAll } from "./actions";
import styles from "./design-editor.module.css";

type Question = { id: string; label: string };

const same = (a: PassDesign, b: PassDesign) =>
	JSON.stringify(a) === JSON.stringify(b);

/** A source as one select value: "field:guest_name", "question:<id>", "own". */
function sourceKey(source: PassTextSource): string {
	return source.type === "field"
		? `field:${source.field}`
		: source.type === "question"
			? `question:${source.fieldId}`
			: "own";
}

function sourceFrom(key: string, previous?: PassTextSource): PassTextSource {
	if (key.startsWith("field:"))
		return { type: "field", field: key.slice(6) as PassField };
	if (key.startsWith("question:"))
		return { type: "question", fieldId: key.slice(9) };
	return {
		type: "own",
		text: previous?.type === "own" ? previous.text : "Your words",
	};
}

function layerName(layer: PassLayer, questions: Question[]): string {
	if (layer.kind === "qr") return "Entry code";
	const s = layer.source;
	if (s.type === "field") return PASS_FIELD_LABELS[s.field];
	if (s.type === "question")
		return (
			questions.find((q) => q.id === s.fieldId)?.label ?? "A removed question"
		);
	return `“${s.text}”`;
}

/**
 * The design editor: the pass on a cutting mat, the designs and accents
 * under it, the layers and the chosen one's settings beside it.
 *
 *   [ Back to Tickets ]   Ticket design: General     [Edit | Preview]
 *   ┌ the pass, 720 × 280, safe area dashed ┐ ┌ Layers  [Add text ▾] ┐
 *   │                                         │ │ Entry code           │
 *   └─────────────────────────────────────────┘ │ Ticket name      🗑  │
 *   ┌ Designs  ○○○○○○○○○○  Accent ●●●●●● ┐   ├ Settings ────────────┤
 *   └──────────────────────────────────────┘   └──────────────────────┘
 *   [Use for all tickets]                 [Discard] [Save design]
 *
 * Layers move by dragging, by the arrow keys (Shift for 10), or by typing
 * their position: dragging is never the only way.
 */
export function DesignEditor({
	eventId,
	ticketId,
	ticketName,
	ticketCount,
	backHref,
	saved: server,
	values,
	questions,
}: {
	eventId: string;
	ticketId: string;
	ticketName: string;
	ticketCount: number;
	backHref: string;
	saved: PassDesign;
	values: PassValues;
	questions: Question[];
}) {
	const router = useRouter();
	const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
	const { saved, setSaved, draft, setDraft, dirty } = useDraft(server, same);
	const [selectedId, setSelectedId] = useState<string>("qr");
	const [preview, setPreview] = useState(false);
	const [message, setMessage] = useState<SaveMessage>({
		tone: "plain",
		text: "",
	});
	const [pending, startTransition] = useTransition();
	const [confirmAll, setConfirmAll] = useState(false);
	const [allError, setAllError] = useState<string | null>(null);
	const [copying, startCopy] = useTransition();
	const svgRef = useRef<SVGSVGElement>(null);
	const drag = useRef<{
		id: string;
		dx: number;
		dy: number;
		pointer: number;
	} | null>(null);

	const selected = draft.layers.find((l) => l.id === selectedId) ?? null;
	const art = passArtwork(draft.base);
	const accent = accentColour(draft.base, draft.accent);

	function change(next: (d: PassDesign) => PassDesign) {
		setDraft((d) => next(d));
		setMessage({ tone: "plain", text: "" });
	}

	function updateLayer(id: string, patch: (l: PassLayer) => PassLayer) {
		change((d) => ({
			...d,
			layers: d.layers.map((l) => (l.id === id ? clampLayer(patch(l)) : l)),
		}));
	}

	function removeLayer(id: string) {
		if (id === "qr") return;
		change((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }));
		setSelectedId("qr");
	}

	function addText(key: string) {
		if (draft.layers.length >= PASS_LAYERS_MAX) return;
		const id = newLayerId(draft);
		const layer: PassTextLayer = clampLayer({
			id,
			kind: "text",
			source: sourceFrom(key),
			x: PASS_SAFE + 16,
			y: 120,
			width: 300,
			size: "s",
			weight: "regular",
			colour: "ink",
		});
		change((d) => ({ ...d, layers: [...d.layers, layer] }));
		setSelectedId(id);
	}

	/** A point on screen, in pass units. */
	function toPass(clientX: number, clientY: number) {
		const svg = svgRef.current;
		const ctm = svg?.getScreenCTM();
		if (!svg || !ctm) return { x: 0, y: 0 };
		const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
		return { x: p.x, y: p.y };
	}

	function onPointerDown(e: React.PointerEvent, layer: PassLayer) {
		if (preview || e.button !== 0) return;
		e.preventDefault();
		setSelectedId(layer.id);
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		const at = toPass(e.clientX, e.clientY);
		drag.current = {
			id: layer.id,
			dx: at.x - layer.x,
			dy: at.y - layer.y,
			pointer: e.pointerId,
		};
	}

	function onPointerMove(e: React.PointerEvent) {
		const d = drag.current;
		if (!d || d.pointer !== e.pointerId) return;
		const at = toPass(e.clientX, e.clientY);
		updateLayer(d.id, (l) => ({
			...l,
			x: Math.round(at.x - d.dx),
			y: Math.round(at.y - d.dy),
		}));
	}

	function onPointerUp(e: React.PointerEvent) {
		if (drag.current?.pointer === e.pointerId) drag.current = null;
	}

	function onLayerKey(e: React.KeyboardEvent, layer: PassLayer) {
		const step = e.shiftKey ? 10 : 1;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step],
		};
		const move = moves[e.key];
		if (move) {
			e.preventDefault();
			updateLayer(layer.id, (l) => ({
				...l,
				x: l.x + move[0],
				y: l.y + move[1],
			}));
		} else if (
			(e.key === "Delete" || e.key === "Backspace") &&
			layer.kind === "text"
		) {
			e.preventDefault();
			removeLayer(layer.id);
		}
	}

	async function save(): Promise<boolean> {
		const result = await saveDesign(eventId, ticketId, draft);
		if (!result.ok) {
			setMessage({ tone: "error", text: result.message });
			return false;
		}
		setSaved(draft);
		setMessage({ tone: "saved" });
		router.refresh();
		return true;
	}
	useUnsavedChanges(dirty, save);

	const layerMarkup = useMemo(
		() =>
			draft.layers.map((layer) =>
				layer.kind === "qr"
					? codeMarkup(layer, SAMPLE_CODE)
					: textMarkup(
							layer,
							layerText(layer, values),
							art,
							accent,
							PAGE_PASS_FONTS,
						),
			),
		[draft.layers, values, art, accent],
	);

	const addOptions = (
		<>
			<optgroup label="Event and guest">
				{PASS_FIELDS.map((f) => (
					<option key={f} value={`field:${f}`}>
						{PASS_FIELD_LABELS[f]}
					</option>
				))}
			</optgroup>
			{questions.length > 0 ? (
				<optgroup label="Form answers">
					{questions.map((q) => (
						<option key={q.id} value={`question:${q.id}`}>
							{q.label}
						</option>
					))}
				</optgroup>
			) : null}
			<optgroup label="Your own words">
				<option value="own">Your words</option>
			</optgroup>
		</>
	);

	return (
		<div className={styles.page}>
			<header className={styles.head}>
				<div className={styles.titleBlock}>
					<Link className={styles.back} href={backHref}>
						Back to Tickets
					</Link>
					<h3 className={styles.title}>Ticket design: {ticketName}</h3>
				</div>
				<Segmented
					label="View"
					value={preview ? "preview" : "edit"}
					options={[
						{ value: "edit", label: "Edit" },
						{ value: "preview", label: "Preview as a guest" },
					]}
					onChange={(v) => setPreview(v === "preview")}
				/>
			</header>

			<div className={styles.columns}>
				<section className={styles.stage} aria-label="Pass">
					<p className={styles.hint} id={`${uid}hint`}>
						{preview
							? "As a guest sees it, with a sample name and code."
							: "Drag a layer, or select it and use the arrow keys (Shift moves 10)."}
					</p>
					<div className={styles.mat}>
						{/* biome-ignore lint/a11y/useSemanticElements: an SVG can't be a fieldset; the group names the pass's layers */}
						<svg
							ref={svgRef}
							className={styles.pass}
							viewBox={`0 0 ${PASS_WIDTH} ${PASS_HEIGHT}`}
							role="group"
							aria-label={`${ticketName} pass`}
							aria-describedby={`${uid}hint`}
							onPointerMove={onPointerMove}
							onPointerUp={onPointerUp}
							onPointerCancel={onPointerUp}
						>
							<g
								// Our own artwork, its accent from a fixed list: no input reaches it.
								// biome-ignore lint/security/noDangerouslySetInnerHtml: see above
								dangerouslySetInnerHTML={{
									__html: artworkMarkup(draft, `${uid}a`),
								}}
							/>
							{draft.layers.map((layer, i) => (
								<g
									key={layer.id}
									// Escaped by textMarkup; the code is a drawn sample.
									// biome-ignore lint/security/noDangerouslySetInnerHtml: see above
									dangerouslySetInnerHTML={{ __html: layerMarkup[i] ?? "" }}
								/>
							))}
							{preview ? null : (
								<>
									<rect
										className={styles.safe}
										x={PASS_SAFE}
										y={PASS_SAFE}
										width={PASS_WIDTH - 2 * PASS_SAFE}
										height={PASS_HEIGHT - 2 * PASS_SAFE}
									/>
									{draft.layers.map((layer) => {
										const box = layerBox(layer);
										return (
											// biome-ignore lint/a11y/useSemanticElements: inside an SVG there is no <button>; a focusable shape with the button role, its keys handled
											<rect
												key={layer.id}
												className={styles.handle}
												data-selected={layer.id === selectedId || undefined}
												x={box.x - 3}
												y={box.y - 3}
												width={box.width + 6}
												height={box.height + 6}
												rx={4}
												tabIndex={0}
												role="button"
												aria-label={`${layerName(layer, questions)}, at ${layer.x}, ${layer.y}`}
												aria-pressed={layer.id === selectedId}
												onPointerDown={(e) => onPointerDown(e, layer)}
												onFocus={() => setSelectedId(layer.id)}
												onKeyDown={(e) => onLayerKey(e, layer)}
											/>
										);
									})}
								</>
							)}
						</svg>
					</div>

					<div className={styles.pickers}>
						<fieldset className={styles.designs}>
							<legend className={styles.label}>Design</legend>
							<div className={styles.strip}>
								{PASS_ARTWORK.map((a) => (
									<label key={a.id} className={styles.thumb}>
										<input
											type="radio"
											name={`${uid}design`}
											className={styles.srOnly}
											checked={draft.base === a.id}
											onChange={() => change((d) => ({ ...d, base: a.id }))}
										/>
										<svg
											viewBox={`0 0 ${PASS_WIDTH} ${PASS_HEIGHT}`}
											aria-hidden="true"
											// Our own artwork, accent from a fixed list.
											// biome-ignore lint/security/noDangerouslySetInnerHtml: see above
											dangerouslySetInnerHTML={{
												__html: artworkMarkup(
													{ base: a.id, accent: draft.accent },
													`${uid}t${a.id}`,
												),
											}}
										/>
										<span className={styles.thumbName}>{a.name}</span>
									</label>
								))}
							</div>
						</fieldset>
						<fieldset className={styles.accents}>
							<legend className={styles.label}>Accent</legend>
							<div className={styles.swatches}>
								<label className={styles.swatch}>
									<input
										type="radio"
										name={`${uid}accent`}
										className={styles.srOnly}
										checked={draft.accent === null}
										onChange={() => change((d) => ({ ...d, accent: null }))}
									/>
									<span
										className={styles.dot}
										style={{ background: passArtwork(draft.base).accent }}
										aria-hidden="true"
									/>
									<span>Design's own</span>
								</label>
								{PASS_ACCENT_KEYS.map((key: PassAccent) => (
									<label key={key} className={styles.swatch}>
										<input
											type="radio"
											name={`${uid}accent`}
											className={styles.srOnly}
											checked={draft.accent === key}
											onChange={() => change((d) => ({ ...d, accent: key }))}
										/>
										<span
											className={styles.dot}
											style={{ background: PASS_ACCENTS[key] }}
											aria-hidden="true"
										/>
										<span>{PASS_ACCENT_NAMES[key]}</span>
									</label>
								))}
							</div>
						</fieldset>
					</div>
				</section>

				<aside className={styles.side} aria-label="Layers and settings">
					<section className={styles.card} aria-labelledby={`${uid}layers`}>
						<div className={styles.cardHead}>
							<h4 className={styles.cardTitle} id={`${uid}layers`}>
								Layers
							</h4>
							<label className={styles.srOnly} htmlFor={`${uid}add`}>
								Add text
							</label>
							<select
								id={`${uid}add`}
								className={styles.add}
								value=""
								disabled={draft.layers.length >= PASS_LAYERS_MAX}
								onChange={(e) => {
									if (e.target.value) addText(e.target.value);
								}}
							>
								<option value="">
									{draft.layers.length >= PASS_LAYERS_MAX
										? `${PASS_LAYERS_MAX} layers at most`
										: "Add text"}
								</option>
								{addOptions}
							</select>
						</div>
						<ul className={styles.layers}>
							{draft.layers.map((layer) => (
								<li key={layer.id} className={styles.layerRow}>
									<button
										type="button"
										className={styles.layerButton}
										aria-current={layer.id === selectedId || undefined}
										onClick={() => setSelectedId(layer.id)}
									>
										{layerName(layer, questions)}
									</button>
									{layer.kind === "qr" ? (
										<span className={styles.locked}>Always on</span>
									) : (
										<button
											type="button"
											className={styles.remove}
											aria-label={`Remove ${layerName(layer, questions)}`}
											onClick={() => removeLayer(layer.id)}
										>
											<TrashIcon />
										</button>
									)}
								</li>
							))}
						</ul>
					</section>

					{selected ? (
						<section className={styles.card} aria-labelledby={`${uid}settings`}>
							<h4 className={styles.cardTitle} id={`${uid}settings`}>
								{layerName(selected, questions)}
							</h4>
							<Inspector
								key={selected.id}
								layer={selected}
								design={draft}
								addOptions={addOptions}
								onChange={(patch) => updateLayer(selected.id, patch)}
							/>
						</section>
					) : null}
				</aside>
			</div>

			<footer className={styles.foot}>
				{ticketCount > 1 ? (
					<button
						type="button"
						className={styles.secondary}
						onClick={() => {
							setAllError(null);
							setConfirmAll(true);
						}}
					>
						Use for all tickets
					</button>
				) : null}
				<button
					type="button"
					className={styles.linkButton}
					onClick={() =>
						change((d) => ({ ...defaultPassDesign(d.base), accent: d.accent }))
					}
				>
					Reset layout
				</button>
			</footer>

			{dirty || message.tone !== "plain" ? (
				<SaveBar
					className={styles.saveBar}
					message={message}
					dirty={dirty}
					pending={pending}
					onDiscard={() => {
						setDraft(saved);
						setMessage({ tone: "plain", text: "" });
					}}
					onSave={() => startTransition(async () => void (await save()))}
				/>
			) : null}

			<Popup
				open={confirmAll}
				onClose={() => setConfirmAll(false)}
				title={`Use this design for all ${ticketCount} tickets?`}
			>
				<p className={dialog.lead}>
					Every ticket of this event gets this design, layout and accent. Their
					own designs are replaced.
				</p>
				{allError ? (
					<p className={styles.error} role="alert">
						{allError}
					</p>
				) : null}
				<div className={dialog.actions}>
					<button
						type="button"
						className={dialog.secondary}
						onClick={() => setConfirmAll(false)}
						disabled={copying}
					>
						Cancel
					</button>
					<button
						type="button"
						className={dialog.primary}
						disabled={copying}
						aria-busy={copying || undefined}
						onClick={() =>
							startCopy(async () => {
								const result = await applyDesignToAll(eventId, ticketId, draft);
								if (!result.ok) {
									setAllError(result.message);
									return;
								}
								setSaved(draft);
								setConfirmAll(false);
								setMessage({
									tone: "plain",
									text: `Used for all ${result.count} tickets.`,
								});
								router.refresh();
							})
						}
					>
						{copying ? "Saving…" : "Use for all tickets"}
					</button>
				</div>
			</Popup>
		</div>
	);
}

/** The chosen layer's settings. Numbers apply on Enter or leaving the box. */
function Inspector({
	layer,
	design,
	addOptions,
	onChange,
}: {
	layer: PassLayer;
	design: PassDesign;
	addOptions: React.ReactNode;
	onChange: (patch: (l: PassLayer) => PassLayer) => void;
}) {
	const id = useId();
	if (layer.kind === "qr")
		return (
			<div className={styles.grid}>
				<NumberBox
					label="X"
					value={layer.x}
					onCommit={(x) => onChange((l) => ({ ...l, x }))}
				/>
				<NumberBox
					label="Y"
					value={layer.y}
					onCommit={(y) => onChange((l) => ({ ...l, y }))}
				/>
				<NumberBox
					label="Size"
					value={layer.size}
					min={PASS_QR_MIN}
					max={PASS_QR_MAX}
					onCommit={(size) =>
						onChange((l) =>
							l.kind === "qr"
								? {
										...l,
										size: Math.min(PASS_QR_MAX, Math.max(PASS_QR_MIN, size)),
									}
								: l,
						)
					}
				/>
				<p className={styles.note}>
					Always dark on a light tile, and never smaller than {PASS_QR_MIN}, so
					phones can scan it.
				</p>
			</div>
		);

	const text = (patch: Partial<PassTextLayer>) =>
		onChange((l) => (l.kind === "text" ? { ...l, ...patch } : l));
	const hard = lowContrast(layer, design);

	return (
		<div className={styles.grid}>
			<div className={styles.wide}>
				<label className={styles.label} htmlFor={`${id}src`}>
					Shows
				</label>
				<select
					id={`${id}src`}
					className={styles.select}
					value={sourceKey(layer.source)}
					onChange={(e) =>
						text({ source: sourceFrom(e.target.value, layer.source) })
					}
				>
					{addOptions}
				</select>
			</div>
			{layer.source.type === "own" ? (
				<div className={styles.wide}>
					<label className={styles.label} htmlFor={`${id}own`}>
						Words
					</label>
					<input
						id={`${id}own`}
						className={styles.input}
						value={layer.source.text}
						maxLength={PASS_OWN_TEXT_MAX}
						autoComplete="off"
						onChange={(e) =>
							text({ source: { type: "own", text: e.target.value } })
						}
						onBlur={(e) => {
							// Never left empty: an empty layer would vanish from the pass.
							if (!e.target.value.trim())
								text({ source: { type: "own", text: "Your words" } });
						}}
					/>
				</div>
			) : null}
			<NumberBox label="X" value={layer.x} onCommit={(x) => text({ x })} />
			<NumberBox label="Y" value={layer.y} onCommit={(y) => text({ y })} />
			<NumberBox
				label="Width"
				value={layer.width}
				min={40}
				max={PASS_WIDTH - 2 * PASS_SAFE}
				onCommit={(width) =>
					text({
						width: Math.min(PASS_WIDTH - 2 * PASS_SAFE, Math.max(40, width)),
					})
				}
			/>
			<div className={styles.wide}>
				<Segmented
					label="Size"
					value={layer.size}
					options={(Object.keys(PASS_SIZE_NAMES) as PassTextSize[]).map(
						(size) => ({
							value: size,
							label: PASS_SIZE_NAMES[size],
						}),
					)}
					onChange={(size) => text({ size })}
				/>
			</div>
			<div className={styles.wide}>
				<Segmented
					label="Weight"
					value={layer.weight}
					options={[
						{ value: "regular" as const, label: "Regular" },
						{ value: "bold" as const, label: "Bold" },
					]}
					onChange={(weight) => text({ weight })}
				/>
			</div>
			<div className={styles.wide}>
				<Segmented
					label="Colour"
					value={layer.colour}
					options={PASS_COLOUR_KEYS.map((c) => ({
						value: c,
						label: PASS_COLOUR_NAMES[c],
						swatch:
							c === "accent"
								? accentColour(design.base, design.accent)
								: passArtwork(design.base)[c],
					}))}
					onChange={(colour) => text({ colour })}
				/>
			</div>
			{hard ? (
				<p className={styles.warn} role="status">
					Hard to read on this design. Try Main, or a bigger size.
				</p>
			) : null}
		</div>
	);
}

function NumberBox({
	label,
	value,
	min,
	max,
	onCommit,
}: {
	label: string;
	value: number;
	min?: number;
	max?: number;
	onCommit: (value: number) => void;
}) {
	const id = useId();
	const [typed, setTyped] = useState<string | null>(null);
	const commit = () => {
		if (typed === null) return;
		const n = Number.parseInt(typed, 10);
		if (Number.isFinite(n)) onCommit(n);
		setTyped(null);
	};
	return (
		<div>
			<label className={styles.label} htmlFor={id}>
				{label}
			</label>
			<input
				id={id}
				className={`${styles.input} ${styles.number}`}
				inputMode="numeric"
				autoComplete="off"
				value={typed ?? String(value)}
				aria-describedby={min !== undefined ? `${id}r` : undefined}
				onChange={(e) =>
					setTyped(e.target.value.replace(/[^\d]/g, "").slice(0, 3))
				}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						commit();
					}
				}}
			/>
			{min !== undefined && max !== undefined ? (
				<span className={styles.srOnly} id={`${id}r`}>
					From {min} to {max}
				</span>
			) : null}
		</div>
	);
}

/** A row of choices, one at a time: native radios, so arrow keys move. */
function Segmented<V extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: V;
	options: { value: V; label: string; swatch?: string }[];
	onChange: (value: V) => void;
}) {
	const name = useId();
	return (
		<fieldset className={styles.segmentSet}>
			<legend className={styles.label}>{label}</legend>
			<div className={styles.segment}>
				{options.map((o) => (
					<label key={o.value} className={styles.segmentOption}>
						<input
							type="radio"
							name={name}
							className={styles.srOnly}
							checked={value === o.value}
							onChange={() => onChange(o.value)}
						/>
						{o.swatch ? (
							<span
								className={styles.dotSmall}
								aria-hidden="true"
								style={{ background: o.swatch }}
							/>
						) : null}
						{o.label}
					</label>
				))}
			</div>
		</fieldset>
	);
}
