# Layout, Spacing and Responsive Standards: makemyevent

Applies to all UI work. Colors are defined separately in `SKILL.md` and `color-systems.md`. These standards replace the older spacing and layout rules in `AGENTS.md`.

Built on Tailwind's default 4px scale, WCAG 2.2, and common Material/Apple guidance. Use Tailwind classes only. No arbitrary values (`p-[13px]`) unless a comment explains why.

## 1. Spacing

4px base grid. Allowed Tailwind steps:

| Class | px | Use |
|---|---|---|
| `1` | 4 | Icon-to-text gap, tight inline gaps |
| `2` | 8 | Between closely related items |
| `3` | 12 | Compact padding, gap between form fields in dense UI |
| `4` | 16 | Default padding, card inner space, form field gap |
| `6` | 24 | Between groups inside a section |
| `8` | 32 | Between large groups |
| `12` | 48 | Section spacing, mobile |
| `16` | 64 | Section spacing, tablet and desktop |
| `24` | 96 | Large page sections (landing pages) |

- Not allowed: half steps (`0.5`, `1.5`, `2.5`, `3.5`) and arbitrary values.
- `5` (20px) and `10` (40px) are allowed only when a design needs them. Do not use them by default.
- **Proximity rule:** space inside a group is always smaller than space between groups. Related things sit closer together than unrelated things.
- Use `gap-*` on flex and grid parents. Avoid margins on children for spacing, and avoid `space-*` utilities on elements that can wrap.

Defaults by context:

| Context | Mobile | Desktop |
|---|---|---|
| Page side padding | `px-4` (16) | `md:px-6` (24), `lg:px-8` (32) |
| Card padding | `p-4` | `md:p-6` |
| Gap between form fields | `gap-4` | `gap-4` |
| Gap between cards in a grid | `gap-4` | `md:gap-6` |
| Vertical section spacing | `py-12` (48) | `md:py-16` (64) |
| Space between tap targets | at least `gap-2` (8) | same |

## 2. Page layout

- Container: `mx-auto w-full max-w-7xl px-4 md:px-6 lg:px-8`. Use the same container on every page. Header content aligns with the page content below it.
- Reading text: `max-w-prose` (about 65ch). Never let paragraphs stretch edge to edge on wide screens.
- Forms: `max-w-md` or `max-w-lg`, single column.
- Full-bleed backgrounds are fine, but their content still sits in the container.
- Use `min-h-dvh`, never `h-screen` or `100vh`, for full-height layouts (mobile browser bars).
- Add safe-area padding (`pb-[env(safe-area-inset-bottom)]`) to fixed bottom bars.

## 3. Breakpoints and responsive behavior

Tailwind defaults, mobile-first: base (below 640), `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536.

- Write base styles for phones, then add `sm:`, `md:`, `lg:` upward. Never write desktop first and patch down.
- Card grids: 1 column, then 2 at `sm`, 3 at `lg`, 4 at `xl` at most. Do not wait until `lg` for the first split.
- Side-by-side layouts (list + detail, form + summary) switch at `md`.
- Navigation: collapse to a menu below `md`.
- Test at 320, 375, 768, 1024 and 1440px. Nothing may scroll horizontally at 320.
- Tables: wrap in `overflow-x-auto`, or restack into cards on mobile. Never let a table widen the page.

## 4. Typography

- Body 16px (`text-base`), line height about 1.5. Never below 14px for content, never below 12px (`text-xs`) for anything.
- Inputs are 16px or larger, or iOS zooms the page on focus.
- Line length 45 to 75 characters.
- One `h1` per page, no skipped heading levels.
- Headings may use fluid `clamp()`. Keep the ratio between levels consistent.
- Use only loaded font weights. No `font-bold` or `font-black` unless that weight is loaded.
- Use `text-balance` on headings and `text-pretty` on paragraphs where supported.

## 5. Touch targets and controls

- Minimum 44×44px for every interactive element (buttons, links in nav, checkboxes, icon buttons).
- Control heights: `h-11` (44px) on mobile. Dense desktop tables may use `h-9` at `md` and above only.
- Icon-only buttons need `aria-label` and a 44px hit area even if the icon is 20px.
- Primary action buttons are full width on mobile (`w-full sm:w-auto`).
- Every control defines hover, `focus-visible`, active, disabled and loading states. Never use bare `focus:outline-none`; always replace the outline with `focus-visible:` styles.

## 6. Forms

- Label above the input, always visible. Placeholders are not labels.
- Gap between fields `gap-4`. Gap between a label and its input `gap-2`.
- Helper and error text sit directly under the field, 14px or 12px.
- Validate inline, keep the user's input after errors, disable submit while sending, show a clear success state.
- Group related fields. Long forms are split into steps or sections.

## 6a. Radius and shadow

- Radius: 4px (`rounded-sm`) badges, 6px (`rounded-md`) buttons, inputs and cards, 8px (`rounded-lg`) dialogs, `rounded-full` avatars and dots. No `rounded-xl` or `rounded-2xl`.
- No shadows on cards, buttons or inputs. A shadow is allowed only for floating layers (menus, popovers, dialogs).

## 7. Preventing overlap and overflow

Most layout bugs come from a short list of causes. Check for them:

- Fixed widths (`w-[400px]`) on content. Use `max-w-*` with `w-full`.
- `w-screen` or `100vw`, which includes the scrollbar and causes horizontal scroll. Use `w-full`.
- `absolute` or `fixed` used for normal layout flow. Use flex or grid.
- Flex children that cannot shrink. Add `min-w-0` so `truncate` and wrapping work.
- Long unbroken strings (emails, URLs, names). Use `break-words` or `truncate`/`line-clamp-*` on purpose.
- Nested scroll areas and scroll inside scroll.
- Sticky and fixed elements covering content. Reserve space (padding) for the sticky header and bottom bars.

Z-index layers (use these only, never ad hoc numbers): content 0, sticky `z-10`, dropdown/popover `z-20`, modal `z-30`, toast `z-40`.

## 8. Images and media

- Always set width/height or `aspect-*` to prevent layout shift.
- Use `next/image` with `sizes`. Lazy-load below the fold. Set `priority` only on the main above-the-fold image.
- Covers and banners use `object-cover` with a fixed aspect ratio. Keep text in the inner 80% safe zone.
- Avatars are square, `rounded-full`.

## 9. States every page needs

Loading (skeleton, not blank), empty (an invitation with a next action), error (what happened and what to do), success, and no-permission. Also 404 and 500 pages. No dead ends: every page has a way back.

## 10. Motion

- 150ms for feedback, 200ms for small enter animations, 250ms for dialogs. Easing: ease-out on enter, ease-in on exit.
- Every animation has a `motion-reduce:` fallback. Never animate layout properties on scroll.

## 11. Pre-merge checklist

- No horizontal scroll at 320px.
- No overlap or clipping with long text.
- All tap targets 44px or larger.
- Inputs 16px or larger.
- Focus visible on every control.
- Only spacing steps from the table above.
- Images have dimensions.
- Loading, empty and error states exist.
- Looks right in light and dark.