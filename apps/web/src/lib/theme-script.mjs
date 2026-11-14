/**
 * Applies the theme before the first paint, so the page never flashes the
 * wrong one. The theme follows the system setting; a stored choice wins.
 *
 * This exact string is hashed at build time and allowed by name in the
 * Content-Security-Policy (see next.config.mjs). Changing one character
 * changes the hash, and the build picks that up automatically.
 */
export const THEME_SCRIPT =
	'(function(){try{var s=localStorage.getItem("makemyevent-theme");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();';
