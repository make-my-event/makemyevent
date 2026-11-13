# Design spec

Purpose: the single source for every visual value in the product: colour, type, spacing, radius, elevation, grid, controls and interaction.
Product: makemyevent, an event platform with a ticket-stub identity (paper, ink, a confirmation stamp, a perforated tear line).
Version: 1.0, 2026-11-13.

## 1. How to use this file

- Vercel's Web Interface Guidelines are the authority for interaction, accessibility, forms, motion and layout behaviour: https://vercel.com/design/guidelines
- This file sets every value. The colours and fonts are this product's own. The scales for type, spacing, radius, elevation and grid follow Vercel's approach: few values, each with one job.
- If a value is not in this file, do not invent one. Add it here first, then use it.
- Build with named tokens and the steps listed here. Do not use raw hex values, palette colour names or arbitrary one-off sizes.
- Light and dark themes are both first-class. Every rule holds in both.

## 2. Colour

Five colours, no scales, no extra hues.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `paper` | `#F7F6F2` | `#131211` | Page and surface background |
| `ink` | `#1B1A18` | `#F4F3EE` | Text, icons, primary buttons |
| `stamp` | `#1F7A4D` | `#2D9B5E` | Confirmation, success, primary accent, focus ring |
| `perforation` | `#DAD6CC` | `#2A2925` | Dividers, card outlines, decorative borders |
| `alert` | `#C0432A` | `#EF4444` | Errors and destructive actions |

Two derived tones are mixed from the five. They add no new hue.

| Token | Recipe | Used for |
|---|---|---|
| `muted` | 65% `ink` over `paper` | Secondary text, captions, placeholders |
| `border-strong` | 55% `ink` over `paper` | Input and control borders |

Rules:
- `perforation` is decorative. It is too light to mark a control, so every form control uses `border-strong`. Control boundaries must reach 3:1 contrast.
- Body text must reach 4.5:1 and large text 3:1, in both themes. Check each pairing before shipping it.
- Colour never carries meaning alone. Pair `alert` and `stamp` with an icon or text.
- Text on a `stamp` or `alert` fill uses `paper`. Check the contrast in both themes.

## 3. Typography

Three fonts. Headings use the display font. Everything else uses the body font. The mono font is only for code-like text such as ticket codes, IDs and tokens.

| Role | Font | Used for |
|---|---|---|
| Display | Bricolage Grotesque | H1, H2, H3 |
| Body | IBM Plex Sans | All other text, including numbers and the rupee sign |
| Mono | IBM Plex Mono | Ticket codes, IDs, tokens |

| Style | Desktop | Tablet | Mobile | Line height | Used for |
|---|---|---|---|---|---|
| H1 | 60 px | 48 px | 32 px | 1.1 | Page titles, hero |
| H2 | 36 px | 32 px | 24 px | 1.2 | Section titles |
| H3 | 24 px | 20 px | 20 px | 1.25 | Card and block titles |
| Large | 20 px | 18 px | 18 px | 1.4 | Intro lines, lead paragraphs |
| Body | 16 px | 16 px | 16 px | 1.5 | Paragraphs, table rows, form fields, buttons |
| Small | 14 px | 14 px | 14 px | 1.4 | Labels, captions, legal lines |

Rules:
- The smallest text size is 14 px. Inputs are 16 px so iOS does not zoom on focus.
- Weights: 400 for body, 500 for emphasis and buttons, 700 for display headings. No other weights.
- Keep paragraphs under about 70 characters wide.
- Use tabular figures for prices, counts and table columns so digits line up.
- Do not letter-space body text. Display headings may tighten by at most 1%.
- Use sentence case. Do not set UI text in all caps.

## 4. Spacing

Use only these steps. Nothing between them is a valid value.

| Name | Value | Used for |
|---|---|---|
| space-2xs | 4 px | Tight gaps inside controls |
| space-xs | 8 px | An icon next to its label |
| space-s | 16 px | Label to field. Page margin and gutter on mobile |
| space-m | 24 px | Gutter on tablet. Between rows of a list |
| space-l | 32 px | Gutter on desktop. Between groups |
| space-xl | 40 px | Page margin on desktop and tablet |
| space-2xl | 80 px | Between blocks inside a section |
| space-3xl | 120 px | Between sections on marketing pages |

Inside the product (dashboards, forms, management screens) stop at space-xl. The two largest steps are for marketing pages.

## 5. Radius

| Name | Value | Used for |
|---|---|---|
| radius-s | 6 px | Buttons, inputs, badges, menu items |
| radius-m | 12 px | Cards, dialogs, popovers, panels |
| radius-full | 9999 px | Avatars, pills, chips |

A nested element uses the same radius as its parent or a smaller one, never a larger one.

## 6. Elevation

Depth comes from a 1 px `perforation` border first. Shadows are only for elements that float above the page.

| Name | Value | Used for |
|---|---|---|
| flat | none | Cards, panels, anything in the page flow |
| overlay | `0 8px 24px rgb(0 0 0 / 0.08)` in light; none in dark, use a border | Menus, popovers, dialogs, toasts |

Build shadows from black at low opacity, never from `ink`, which is near-white in the dark theme.

## 7. Grid and breakpoints

One grid per screen size. Gutters and margins come from the spacing scale.

| Screen | Starts at | Design frame | Columns | Gutter | Margin |
|---|---|---|---|---|---|
| Desktop | 1024 px | 1440 px | 12 | 32 px (space-l) | 40 px (space-xl) |
| Tablet | 640 px | 834 px | 8 | 24 px (space-m) | 40 px (space-xl) |
| Mobile | below 640 px | 393 px | 4 | 16 px (space-s) | 16 px (space-s) |

- Content is centred with a maximum width of 1360 px (a 1440 px frame minus two 40 px margins).
- Card layouts: a card spans all 4 columns on mobile, 4 of 8 on tablet (two per row), and 3 to 6 of 12 on desktop.
- Check every screen at 390 px and 1280 px, in both themes, with no horizontal scroll.

## 8. Controls

| Control | Height | Used for |
|---|---|---|
| Compact | 32 px | Dense desktop toolbars and tables only |
| Default | 40 px | Buttons, inputs, selects on desktop |
| Touch | 44 px | Every control on touch screens |

Icons are 16, 20 or 24 px, drawn at the same stroke weight, and take the colour of the text next to them.

## 9. Interaction

- Hit targets: at least 24 px, and 44 px on touch screens.
- Focus: a visible `:focus-visible` ring on every interactive element, 2 px `stamp` with a 2 px offset. Never remove an outline without a replacement.
- Motion: 150 to 200 ms, on named properties only (never `transition: all`). Respect `prefers-reduced-motion` by removing movement.
- Every control has a visible label or an accessible name. Icon-only buttons need one.
- Buttons say what they do: "Save changes", not "Submit". Errors say what happened and how to fix it. The same action keeps the same name through a flow.
- Empty states say what to do next.

## 10. Changing this file

Change a value here first, in its own change, then update everything that uses it. If this file and a screen disagree, this file wins and the screen is fixed.