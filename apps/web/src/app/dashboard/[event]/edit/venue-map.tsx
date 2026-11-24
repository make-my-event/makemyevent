"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
	type IControl,
	Map as MapLibre,
	Marker,
	NavigationControl,
	setWorkerUrl,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import styles from "./schedule-venue.module.css";

/**
 * The venue on a map, to set the pin exactly: click the map or drag the
 * pin. From the keyboard, the place search above sets it.
 *
 * Tiles from OpenFreeMap (OpenStreetMap data, free, no key), drawn by
 * MapLibre. The light or dark style follows the site's theme.
 */

// MapLibre finds its worker beside its own file, which the bundler moves:
// point it at the copy the bundler emits, served from this site.
setWorkerUrl(
	new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
);

const STYLES = {
	light: "https://tiles.openfreemap.org/styles/positron",
	dark: "https://tiles.openfreemap.org/styles/dark",
};
const WORLD = { center: [20, 20] as [number, number], zoom: 1 };
const CLOSE = 15;

const isDark = () => document.documentElement.classList.contains("dark");
const reducedMotion = () =>
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 9.965800° N, 76.242100° E */
function coordinates(lat: number, lng: number): string {
	return `${Math.abs(lat).toFixed(5)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lng).toFixed(5)}° ${lng < 0 ? "W" : "E"}`;
}

/** Centres the map on a spot, close enough to see the street. */
function goTo(map: MapLibre, lng: number, lat: number) {
	map.stop();
	const target = {
		center: [lng, lat] as [number, number],
		zoom: Math.max(map.getZoom(), CLOSE),
	};
	if (reducedMotion()) map.jumpTo(target);
	else map.flyTo({ ...target, duration: 900 });
}

/** A target: the map's own button that brings the pin back into view. */
const TARGET_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;

/** "Show the pin", drawn in the map's control column under zoom. */
class ShowPinControl implements IControl {
	readonly button: HTMLButtonElement;
	private readonly box: HTMLDivElement;
	constructor(onPress: () => void) {
		this.box = document.createElement("div");
		this.box.className = "maplibregl-ctrl maplibregl-ctrl-group";
		this.button = document.createElement("button");
		this.button.type = "button";
		this.button.className = styles.showPin ?? "";
		this.button.setAttribute("aria-label", "Show the pin");
		this.button.title = "Show the pin";
		this.button.innerHTML = TARGET_ICON;
		this.button.addEventListener("click", onPress);
		this.box.append(this.button);
	}
	onAdd() {
		return this.box;
	}
	onRemove() {
		this.box.remove();
	}
	setVisible(visible: boolean) {
		this.box.hidden = !visible;
	}
}

export default function VenueMap({
	lat,
	lng,
	name,
	focus,
	onPick,
}: {
	lat: number | null;
	lng: number | null;
	name: string | null;
	/** Changes when a place is picked from search: the map goes to the pin. */
	focus: number;
	onPick: (lat: number, lng: number) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<MapLibre | null>(null);
	const markerRef = useRef<Marker | null>(null);
	const pickRef = useRef(onPick);
	pickRef.current = onPick;
	const showPinRef = useRef<ShowPinControl | null>(null);
	const pinAt = useRef<[number, number] | null>(null);
	pinAt.current = lat !== null && lng !== null ? [lng, lat] : null;
	const [failed, setFailed] = useState(false);
	const [ready, setReady] = useState(false);

	// The map once; the pin and the view follow the props below.
	// biome-ignore lint/correctness/useExhaustiveDependencies: created once; later positions move it
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		let map: MapLibre;
		try {
			map = new MapLibre({
				container,
				style: isDark() ? STYLES.dark : STYLES.light,
				...(lat !== null && lng !== null
					? { center: [lng, lat] as [number, number], zoom: CLOSE }
					: WORLD),
				attributionControl: { compact: true },
				// One finger scrolls the page on a phone; two move the map.
				cooperativeGestures: false,
				dragRotate: false,
				pitchWithRotate: false,
				touchPitch: false,
			});
		} catch {
			// No WebGL: the coordinates and search still work without the map.
			setFailed(true);
			return;
		}
		map.touchZoomRotate.disableRotation();
		map.keyboard.disableRotation();
		map.addControl(new NavigationControl({ showCompass: false }), "top-right");
		const showPin = new ShowPinControl(() => {
			if (pinAt.current) goTo(map, pinAt.current[0], pinAt.current[1]);
		});
		showPin.setVisible(pinAt.current !== null);
		map.addControl(showPin, "top-right");
		showPinRef.current = showPin;
		map.on("click", (event) => {
			pickRef.current(
				Math.round(event.lngLat.lat * 1e6) / 1e6,
				Math.round(event.lngLat.lng * 1e6) / 1e6,
			);
		});
		map.on("load", () => setReady(true));
		map.on("error", () => {
			if (!map.loaded()) setFailed(true);
		});
		// The canvas gets a name; keyboard users reach it to pan and zoom.
		map
			.getCanvas()
			.setAttribute(
				"aria-label",
				"Venue map. Arrow keys pan, plus and minus zoom.",
			);
		mapRef.current = map;

		// The theme can change while the page is open.
		const observer = new MutationObserver(() => {
			map.setStyle(isDark() ? STYLES.dark : STYLES.light);
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		// The frame follows the card's height, which the fields beside it
		// and the schedule card set: the map redraws to the new size.
		const sized = new ResizeObserver(() => map.resize());
		sized.observe(container);

		return () => {
			sized.disconnect();
			observer.disconnect();
			markerRef.current?.remove();
			markerRef.current = null;
			showPinRef.current = null;
			map.remove();
			mapRef.current = null;
		};
	}, []);

	// The pin: placed, moved or taken off as the coordinates change.
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		showPinRef.current?.setVisible(lat !== null && lng !== null);
		if (lat === null || lng === null) {
			markerRef.current?.remove();
			markerRef.current = null;
			return;
		}
		if (!markerRef.current) {
			const element = document.createElement("div");
			// MapLibre positions this element with a transform, so the drop
			// shape (which is turned) is a child: turning the element itself
			// would turn its position too and put the pin off the spot.
			element.className = styles.pin ?? "";
			element.setAttribute("aria-hidden", "true");
			const drop = document.createElement("span");
			drop.className = styles.pinDrop ?? "";
			element.append(drop);
			const marker = new Marker({ element, draggable: true, anchor: "bottom" })
				.setLngLat([lng, lat])
				.addTo(map);
			marker.on("dragend", () => {
				const at = marker.getLngLat();
				pickRef.current(
					Math.round(at.lat * 1e6) / 1e6,
					Math.round(at.lng * 1e6) / 1e6,
				);
			});
			markerRef.current = marker;
		} else {
			markerRef.current.setLngLat([lng, lat]);
		}
		// Kept in view: a pin moved off screen (by a pick far away) is
		// followed; one set by a click or a drag is already where the host is
		// looking.
		if (!map.getBounds().contains([lng, lat])) goTo(map, lng, lat);
	}, [lat, lng]);

	// A place picked from search: always shown, centred and close up.
	// biome-ignore lint/correctness/useExhaustiveDependencies: only when a new place is picked
	useEffect(() => {
		const map = mapRef.current;
		if (focus === 0 || !map || lat === null || lng === null) return;
		goTo(map, lng, lat);
	}, [focus]);

	const pinned = lat !== null && lng !== null;

	return (
		<div className={styles.mapBlock}>
			<div
				className={styles.mapFrame}
				data-loading={!ready && !failed ? "" : undefined}
			>
				{failed ? (
					<p className={styles.mapFallback}>
						The map could not load here. Search the location above to set the
						pin.
					</p>
				) : (
					<div ref={containerRef} className={styles.map} />
				)}
				{/* Top left, clear of the map's credits along the bottom. */}
				{!failed || pinned ? (
					<div className={styles.chips}>
						{name && pinned ? (
							<span className={styles.chipName} aria-hidden="true">
								{name}
							</span>
						) : null}
						{pinned ? (
							<span className={styles.chipCoords}>{coordinates(lat, lng)}</span>
						) : (
							<span className={styles.chipCoords} data-empty="">
								Click the map to drop the pin
							</span>
						)}
					</div>
				) : null}
			</div>
		</div>
	);
}
