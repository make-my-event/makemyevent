/**
 * Class names for the landing page's pill buttons. A function rather than a
 * component so the same look applies to <Link>, <a>, <button> and <span>.
 * Landing only: app pages use the standard rounded-md buttons.
 */
export type PillButtonVariant =
	| "primary"
	| "secondary"
	| "inverse"
	| "secondary-on-ink";

export type PillButtonSize = "md" | "sm";

const BASE =
	"inline-flex items-center justify-center gap-2 rounded-pill border font-body text-base font-medium leading-tight no-underline transition-[border-color,box-shadow,scale] duration-150 active:scale-98 disabled:cursor-default disabled:opacity-50 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100";

const SIZES: Record<PillButtonSize, string> = {
	md: "min-h-12 px-6 py-2",
	sm: "min-h-11 px-4 py-2",
};

const VARIANTS: Record<PillButtonVariant, string> = {
	primary: "border-stamp bg-stamp text-paper hover:ring-3 hover:ring-stamp/40",
	secondary:
		"border-ink/50 text-ink hover:border-ink disabled:hover:border-ink/50",
	inverse:
		"border-paper bg-paper text-ink hover:ring-3 hover:ring-paper/40 focus-visible:outline-paper",
	"secondary-on-ink":
		"border-paper/50 text-paper hover:border-paper focus-visible:outline-paper",
};

export function pillButtonClass(
	variant: PillButtonVariant,
	size: PillButtonSize = "md",
): string {
	return `${BASE} ${SIZES[size]} ${VARIANTS[variant]}`;
}
