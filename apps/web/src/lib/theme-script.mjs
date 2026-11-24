/**
 * Applies the theme before the first paint, so the page never flashes the
 * wrong one. The theme follows the system setting; a stored choice wins.
 *
 * It is the one inline script in the page. The root layout gives it the
 * request nonce set by the middleware, which is what the
 * Content-Security-Policy allows (see lib/csp.ts).
 */
export const THEME_SCRIPT =
	'(function(){try{var s=localStorage.getItem("makemyevent-theme");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();';
