/**
 * Shared between the client `ThemeProvider` and the server-rendered
 * `ThemeScript`. Kept out of the "use client" provider module so that server
 * components import the plain values rather than client references.
 */
export const THEME_STORAGE_KEY = "makemyevent-theme";

/** Theme used when the visitor has never chosen one. */
export const DEFAULT_THEME = "light";

/**
 * Runs synchronously in <head>, before first paint, so a saved dark theme is
 * applied without a flash of the light theme. Mirrors the resolution logic in
 * `ThemeProvider`; keep the two in step.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
	THEME_STORAGE_KEY,
)});var t=s==="light"||s==="dark"||s==="system"?s:${JSON.stringify(
	DEFAULT_THEME,
)};var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;
