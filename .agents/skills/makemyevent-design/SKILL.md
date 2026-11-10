---
name: makemyevent-design
description: Use for any UI work in makemyevent (components, pages, styling, Tailwind, forms). Covers the brand colors and color usage, plus the layout standards (spacing, layout, breakpoints, typography, touch targets, forms, radius/shadow, overlap prevention). Overrides any generic palette or layout guidance from other skills.
---

# makemyevent design: colors and layout

## 1. The five brand colors

Values from `apps/web/src/app/globals.css`. Do not change them.

| Token | Light | Dark |
|---|---|---|
| `paper` | `#f7f6f2` | `#131211` |
| `ink` | `#1b1a18` | `#f4f3ee` |
| `stamp` | `#1f7a4d` | `#2d9b5e` |
| `perforation` | `#dad6cc` | `#2a2925` |
| `alert` | `#c0432a` | `#ef4444` |

## 2. Use the theme tokens

- Use the token classes: `bg-paper`, `text-ink`, `bg-stamp`, `border-perforation`, `text-alert` (and opacity forms such as `text-ink/70`).
- Never raw hex (no `bg-[#...]`, no inline hex).
- Never the default Tailwind palette: no `amber-*`, `green-*`, `red-*`, `sky-*`, `bg-black`, `bg-white`.
- No new colors without approval.

## 3. Contrast rules

- Text on `stamp` or `alert` fills is `paper`, never `ink`.
- Input and checkbox borders use `border-ink/50`.
- Secondary text is `text-ink/70` at minimum.
- `perforation` is for decorative dividers only, never the only boundary of a control.
- No `stamp` or `alert` text on a `perforation` background.

## 4. Pending and warning states

No new color. Use neutral `ink` plus a Lucide icon (for example `Clock` or `AlertCircle`).

## 5. Contrast tables

See [references/color-systems.md](references/color-systems.md) for the light and dark contrast tables.

## 6. Layout and spacing

Follow [references/layout-standards.md](references/layout-standards.md) for spacing, layout, breakpoints, typography, touch targets, forms, radius/shadow and overlap prevention.
