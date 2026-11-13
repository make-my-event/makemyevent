# Design spec

Purpose: the single source for every visual value in the product: colour, type, spacing, radius, elevation, grid, controls and interaction.
Product: makemyevent, an event platform with a ticket-stub identity (paper, ink, a confirmation stamp, a perforated tear line).
Version: 1.1, 2026-11-13.

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
- `perforation` is never a fill under text. It may be a hairline or a skeleton fill, where nothing is read on it.
- In the light theme, `stamp` and `alert` pairings sit between 4.7:1 and 4.9:1. There is no headroom. Nothing may lighten them: see the state rules in section 8.
- The theme follows the system setting. A manual override is available and persists.

Status without a colour. These states have no colour of their own. Each is rendered as `ink` or `muted` text with an icon and a word, never as a fill or a tint.

| State | Text | Example |
|---|---|---|
| Expiring | `ink` | Reservation held for 4:59 |
| Pending | `muted` | Payout pending |
| Unpublished | `muted` | Draft, not visible to buyers |
| Waitlisted | `ink` | You are 12th on the waitlist |
| Low stock | `ink` | 8 tickets left |

## 3. Typography

Three fonts. Headings use the display font. Everything else uses the body font. The mono font is only for code-like text such as ticket codes, IDs and tokens.

| Role | Font | Used for |
|---|---|---|
| Display | Bricolage Grotesque | H1, H2, H3 |
| Body | IBM Plex Sans | All other text. Numbers and currency symbols, including the rupee sign, use this font too |
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

States. The same rules apply in both themes.

| State | Rule |
|---|---|
| Hover | `stamp` and `alert` fills: mix 10% toward `ink`, never lighter. `ink` fills: mix 8% toward `paper` |
| Pressed | `stamp` and `alert` fills: mix 20% toward `ink`, never lighter. `ink` fills: mix 15% toward `paper`, the maximum |
| Disabled | `muted` text, `border-strong` replaced by `perforation`, no fill |
| Selected | 2 px `ink` or `stamp` border, plus a check mark on chips and list rows. No fill |

- Opacity is never applied to text or to a filled control. Change the colour instead.
- Hover and pressed mixes are the only derived values permitted outside section 2. `stamp` and `alert` fills move only toward `ink`: they have no contrast headroom. `ink` fills move only toward `paper`, by at most 15%: they have large headroom, and the `paper` label must stay at or above 4.5:1.

## 9. Interaction

- Hit targets: at least 24 px, and 44 px on touch screens.
- Focus: a visible `:focus-visible` ring on every interactive element, 2 px `stamp` with a 2 px offset. Never remove an outline without a replacement. The 2 px offset is load-bearing for contrast on `ink` fills and must not be reduced.
- Motion: 150 to 200 ms, on named properties only (never `transition: all`). Respect `prefers-reduced-motion` by removing movement.
- Every control has a visible label or an accessible name. Icon-only buttons need one.
- Buttons say what they do: "Save changes", not "Submit". Errors say what happened and how to fix it. The same action keeps the same name through a flow.
- Empty states say what to do next.

## 10. Images

- Event covers are 16:9. The ratio is enforced at upload: the organizer crops to it before the image is saved. No other ratio is stored or displayed.
- Organizers customise the cover image only. Organizer colours and fonts do not appear anywhere in the product.
- Covers never carry text that the page depends on.

## 11. Identity marks

The stamp motif and the tear line are the product's signature. They appear only on confirmation screens and on tickets. Nowhere else.

- Stamp: `stamp` colour, drawn as a stroke, rotated. Exact rotation deferred until the first ticket is designed.
- Tear line: a dashed hairline in `perforation`. Exact dash and gap values deferred until the first ticket is designed.
- Add the values here before shipping the first ticket.

## 12. Native (mobile app)

Every value in this file applies to the mobile app. Read px as dp on Android and pt on iOS. Differences:

- Fonts ship as static files, not variable fonts: Bricolage Grotesque 700; IBM Plex Sans 400, 500, 700; IBM Plex Mono 400.
- Pressed state is a colour shift per section 8, never an opacity change.
- Reduced motion follows the platform setting. When it is on, remove movement.
- Font scaling follows the platform setting, capped at 1.3x in the scanner app so controls stay usable at the door.
- Every control is the Touch height, 44 px.

## 13. Changing this file

Change a value here first, in its own change, then update everything that uses it. If this file and a screen disagree, this file wins and the screen is fixed.

## Changelog

### v1.1, 2026-11-13

Added:
- States for every control: hover, pressed, disabled, selected (section 8). Opacity is never applied to text or filled controls. The 2 px focus offset must not be reduced (section 9).
- `perforation` is never a fill under text; hairlines and skeleton fills only (section 2).
- Disabled: `muted` text, `perforation` border, no fill. Selected: border only, no fill (section 8).
- Status without a colour: expiring, pending, unpublished, waitlisted, low stock, each rendered as text, icon and word (section 2).
- Event covers: one enforced ratio, 16:9, cropped on upload. Organizers customise the cover image only (section 10).
- Identity marks: stamp motif and tear line only on confirmation screens and tickets; dash and rotation values deferred until the first ticket (section 11).
- Native section: static font files, pressed state as a colour shift, reduced motion from the platform setting, font scaling capped at 1.3x in the scanner (section 12).
- Theme follows the system setting with a persistent manual override (section 2).
- Typography: the body font covers currency symbols, including the rupee sign (section 3).

Fixed:
- Hover and pressed now state both cases: `stamp` and `alert` fills mix toward `ink`, never lighter; `ink` fills mix toward `paper` by at most 15%, with the label held at or above 4.5:1 (section 8).
- Selected is a 2 px border, not 1 px, plus a check mark on chips and list rows (section 8).

Contrast, measured. WCAG 2 relative luminance, mixes composited in sRGB. Resolved tones: light `muted` #686764, `border-strong` #7E7D7A; dark `muted` #A5A4A1, `border-strong` #8F8E8B.

| Pairing | Minimum | Light | Dark | Result |
|---|---|---|---|---|
| `ink` text on `paper` | 4.5 | 16.08:1 | 16.84:1 | pass |
| `muted` text on `paper` | 4.5 | 5.23:1 | 7.51:1 | pass |
| `stamp` text on `paper` | 4.5 | 4.92:1 | 5.31:1 | pass |
| `alert` text on `paper` | 4.5 | 4.76:1 | 4.97:1 | pass |
| `paper` label on `ink` fill | 4.5 | 16.08:1 | 16.84:1 | pass |
| `paper` label on `ink` fill, hover (8% `paper`) | 4.5 | 12.91:1 | 14.29:1 | pass |
| `paper` label on `ink` fill, pressed (15% `paper`) | 4.5 | 10.35:1 | 12.24:1 | pass |
| `paper` label on `stamp` fill | 4.5 | 4.92:1 | 5.31:1 | pass |
| `paper` label on `stamp` fill, hover (10% `ink`) | 4.5 | 5.60:1 | 6.02:1 | pass |
| `paper` label on `stamp` fill, pressed (20% `ink`) | 4.5 | 6.32:1 | 6.82:1 | pass |
| `paper` label on `alert` fill | 4.5 | 4.76:1 | 4.97:1 | pass |
| `paper` label on `alert` fill, hover (10% `ink`) | 4.5 | 5.41:1 | 5.50:1 | pass |
| `paper` label on `alert` fill, pressed (20% `ink`) | 4.5 | 6.21:1 | 6.09:1 | pass |
| Disabled: `muted` text on `paper` | 4.5 | 5.23:1 | 7.51:1 | pass (inactive controls are exempt; reported anyway) |
| `border-strong` control border vs `paper` | 3.0 | 3.81:1 | 5.71:1 | pass |
| Selected: 2 px `ink` border vs `paper` | 3.0 | 16.08:1 | 16.84:1 | pass |
| Selected: 2 px `stamp` border vs `paper` | 3.0 | 4.92:1 | 5.31:1 | pass |
| Focus ring `stamp` vs `paper` (offset gap) | 3.0 | 4.92:1 | 5.31:1 | pass |
| Focus ring `stamp` vs `ink` fill (adjacent) | 3.0 | 3.27:1 | 3.17:1 | pass |
| Disabled: `perforation` border vs `paper` | 3.0 | 1.34:1 | 1.29:1 | below minimum in light and dark (inactive controls are exempt) |
| `perforation` hairline vs `paper` | - | 1.34:1 | 1.29:1 | decorative, no minimum |

Below minimum:
- Disabled: `perforation` border vs `paper`: light and dark. Inactive controls are exempt.
