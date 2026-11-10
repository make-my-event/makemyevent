# Color Systems Reference: makemyevent

Concept: a ticket stub. Paper, ink, a confirmation stamp, a perforated tear line.

This file replaces the generic palette-generation reference. makemyevent has **five colors and no scales**. Do not generate tints, shades, harmonies, or extra hues. Source of truth: `apps/web/src/app/globals.css` (light and dark).

## The palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#F7F6F2` | `#131211` | Page background, text on stamp/alert buttons |
| `ink` | `#1B1A18` | `#F4F3EE` | Primary text, focus ring, input borders (at 50%) |
| `stamp` | `#1F7A4D` | `#2D9B5E` | Primary actions, confirmed states. Sparingly: the only brand color |
| `perforation` | `#DAD6CC` | `#2A2925` | Decorative dividers, card borders, the tear line |
| `alert` | `#C0432A` | `#EF4444` | Sold out, cancelled. Genuinely urgent states only |

Rules:
- Only `stamp` is a brand color. If a screen has more than one or two stamp things competing, make something neutral.
- No new color without adding it to this skill and `globals.css` first and getting approval.
- No raw hex, no `bg-[#...]`, no default Tailwind palette (`amber-*`, `green-*`, `emerald-*`, `sky-*`, `red-*`, `bg-black`, `bg-white`).
- `stamp-dark` / `stamp-light` do not exist. Do not use them.

## Tokens (Tailwind v4)

Tokens live in `@theme` in `globals.css`. There is no `tailwind.config.js`. Use `@theme inline` so the utilities read the live CSS variable, which is what makes dark mode switch:

```css
:root {
  --paper: #F7F6F2;
  --ink: #1B1A18;
  --stamp: #1F7A4D;
  --perforation: #DAD6CC;
  --alert: #C0432A;
}

.dark {
  --paper: #131211;
  --ink: #F4F3EE;
  --stamp: #2D9B5E;
  --perforation: #2A2925;
  --alert: #EF4444;
}

@theme inline {
  --color-paper: var(--paper);
  --color-ink: var(--ink);
  --color-stamp: var(--stamp);
  --color-perforation: var(--perforation);
  --color-alert: var(--alert);
}
```

Classes: `bg-paper`, `text-ink`, `bg-stamp`, `border-perforation`, `text-alert`, and opacity forms like `text-ink/70`.

Known code bugs this fixes (do not change app code unless asked):
- `@theme { --color-paper: var(--color-paper) }` refers to itself. Use `@theme inline` with separate source variables as above.
- There is no `@custom-variant dark`, so `dark:` classes follow the OS, not the theme toggle. Add `@custom-variant dark (&:where(.dark, .dark *));` and make it match whatever the toggle sets (`.dark` class or `data-theme`).

## Semantic map (documentation only)

Generic skills and libraries use semantic names. Map them to the five tokens. Components keep using the token classes; do not add `bg-primary` aliases.

| Semantic | Token |
|---|---|
| background | `paper` |
| foreground | `ink` |
| primary | `stamp` |
| primary-foreground | `paper` |
| destructive | `alert` |
| destructive-foreground | `paper` |
| border (decorative) | `perforation` |
| border (controls) | `ink` at 50% |
| ring (focus) | `ink` |
| muted-foreground | `ink` at 70% (never lighter) |

Do not invent secondary, accent, muted, or card colors. Derive from `ink`/`paper` opacity or ask.

## Status without new colors

| State | Treatment |
|---|---|
| Confirmed, registered | `stamp` text or outline badge, plus a Lucide `Check` icon |
| Sold out, cancelled | `alert` text or outline badge, plus a Lucide `XCircle`/`Ban` icon |
| Pending, waitlisted, warning, info | Neutral `ink` text, `border-ink/50` outline, plus a Lucide `Clock` or `AlertCircle` icon |

- Never amber, green, or sky for status.
- Never rely on color alone: always pair with an icon or label.
- Badges are outlined on `paper`. **Tinted badges (`bg-stamp/10`, `bg-alert/10`) are not allowed**: they fail contrast (4.32 and 4.15).
- Do not add a status color without approval. If neutral feels too bland in real UI, propose a single `pending` token deliberately.

## Interactive states

| State | Rule |
|---|---|
| Primary button | `bg-stamp text-paper` |
| Primary hover | Keep the fill, add `hover:ring-2 hover:ring-stamp/40`. Do not use `opacity-90` (4.11:1, fails) |
| Focus | `focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2`. Never bare `focus:outline-none` |
| Disabled | `opacity-50` |
| Input / checkbox border | `border-ink/50`. Never `border-perforation` as the only boundary |
| Secondary text | `text-ink/70` minimum. Never `text-ink/60` or lighter |

## Contrast (WCAG AA)

Computed from the hex values. AA needs 4.5:1 for normal text, 3:1 for large text and UI components.

### Light

| Pair | Ratio | Result |
|---|---|---|
| ink on paper | 16.08 | Pass |
| paper on stamp | 4.92 | Pass |
| stamp on paper | 4.92 | Pass |
| paper on alert | 4.76 | Pass |
| alert on paper | 4.76 | Pass |
| ink on perforation | 11.98 | Pass |
| `ink/70` on paper | 6.18 | Pass |
| `ink/60` on paper | 4.45 | **Fail** (151 uses in code) |
| `ink/50` border on paper | 3.28 | Pass for UI (3:1), not for text |
| perforation on paper | 1.34 | **Fail** as a control boundary. Decorative only |
| stamp on perforation | 3.66 | **Fail** for normal text |
| alert on perforation | 3.55 | **Fail** for normal text |
| ink on stamp | 3.27 | **Fail**. Use paper text |
| ink on alert | 3.38 | **Fail**. Use paper text |

### Dark

| Pair | Ratio | Result |
|---|---|---|
| ink on paper | 16.84 | Pass |
| paper on stamp | 5.31 | Pass |
| stamp on paper | 5.31 | Pass |
| paper on alert | 4.97 | Pass |
| alert on paper | 4.97 | Pass |
| ink on perforation | 13.10 | Pass |
| `ink/70` on paper | 8.60 | Pass |
| `ink/60` on paper | 6.57 | Pass |
| `ink/50` border on paper | 4.89 | Pass |
| perforation on paper | 1.29 | **Fail** as a control boundary. Decorative only |
| stamp on perforation | 4.13 | **Fail** for normal text |
| alert on perforation | 3.87 | **Fail** for normal text |
| ink on stamp | 3.17 | **Fail**. Use paper text |
| ink on alert | 3.39 | **Fail**. Use paper text |

Hard rules:
- Text on `stamp` or `alert` fills is always `paper`, never `ink`.
- Never put `stamp` or `alert` text on a `perforation` background.
- `perforation` is for decorative dividers and the tear line. Controls use `border-ink/50`.
- `text-ink/60` passes in dark mode only. It is banned in light, so ban it everywhere.

### Contrast checker

Use this to verify any proposed change. The opacity helper blends a token over its background so you can check `ink/50`-style values.

```tsx
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) throw new Error("Invalid hex color");
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Blend fg over bg at the given alpha (0-1), e.g. text-ink/70
function blend(fg: [number, number, number], bg: [number, number, number], alpha: number) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as [number, number, number];
}

// Usage
const paper = hexToRgb("#F7F6F2");
const ink = hexToRgb("#1B1A18");
contrast(blend(ink, paper, 0.7), paper); // 6.18 (passes)
contrast(blend(ink, paper, 0.6), paper); // 4.45 (fails 4.5)
```

## Dark mode

- Light and dark values are both defined in `globals.css` and listed in SKILL.md.
- Dark `alert` (`#EF4444`) equals Tailwind `red-500`. That is intentional; do not use `red-500` directly anyway.
- Dark must follow the theme toggle, not just the OS. See the `@custom-variant dark` note above.
- Components use token classes only, so they need no `dark:` overrides for color. If you reach for `dark:bg-...`, you are probably using a raw color.

## Color blindness

- Never convey state with color alone. Every status pairs color with a Lucide icon and a text label.
- Stamp (green) versus alert (red) is the risky pair. The icon (`Check` versus `XCircle`) and label carry the meaning.
- The neutral pending treatment avoids the issue entirely.

## QR codes

QR codes must read colors from the CSS variables or `tokens.json`, never inline hex. Foreground `ink`, background `paper`. Currently 4 files pass hex inline; that is tech debt to fix.

## Do not

- Generate color scales, OKLCH ramps, harmonies (complementary, triadic), or primitive/semantic/component token tiers. The palette is five colors by design.
- Use the default Tailwind palette, `bg-black`, or `bg-white`.
- Use `alert` for anything that is not genuinely urgent.
- Use ink on stamp or alert fills.
- Use `perforation` as the only visible edge of an input, checkbox, or other control.
- Use emojis. Use Lucide icons.