# Design spec

## Colour

| Token | Light | Dark | Used for |
|---|---|---|---|
| `paper` | `#F7F6F2` | `#131211` | Page and surface background |
| `ink` | `#1B1A18` | `#F4F3EE` | Text, icons, primary buttons |
| `stamp` | `#1F7A4D` | `#2D9B5E` | Confirmation, success, primary accent, focus ring |
| `perforation` | `#DAD6CC` | `#2A2925` | Dividers, card outlines, decorative borders |
| `alert` | `#C0432A` | `#EF4444` | Errors and destructive actions |
| `muted` | 65% `ink` over `paper` | 65% `ink` over `paper` | Secondary text, captions, placeholders |
| `border-strong` | 55% `ink` over `paper` | 55% `ink` over `paper` | Input and control borders |
| `surface` | `#FEFDFC` | `#1A1917` | Cards, toolbar groups, inputs |
| `tint` | `#EEECE5` | `#26251F` | Badges, counts, secondary buttons, segmented-control track |
| `stamp-tint` | `#E6EEE9` | `#17281E` | The active workspace chip |

### Data colours

For telling things of the same kind apart, such as ticket types in a count. Never for state: success is `stamp`, errors are `alert`. Taken from [Open Color](https://yeun.github.io/open-color/) 1.9.1 (MIT). Each meets 3:1 against `perforation` (a bar's track) and `surface` (a card) in its theme. Red is left out because it reads as an error, grey because it reads as "the rest", and orange and yellow because no Open Color shade of either reaches 3:1 on the light track.

| Token | Light | Dark | Open Color |
|---|---|---|---|
| `series-1` | `stamp` | `stamp` | (the brand green) |
| `series-2` | `#1971C2` | `#4DABF7` | blue 8 / blue 4 |
| `series-3` | `#C2255C` | `#F783AC` | pink 8 / pink 4 |
| `series-4` | `#7048E8` | `#B197FC` | violet 7 / violet 3 |
| `series-5` | `#0B7285` | `#3BC9DB` | cyan 9 / cyan 4 |
| `series-rest` | `muted` | `muted` | Everything past the fifth |

Series are given biggest first, and every chart lists each item by name and number in text, so colour is never the only way to tell them apart.

### Pass colours

The guest's ticket pass, and its preview on the Tickets page. Used only on the pass, never for the interface around it. Taken from [Open Color](https://yeun.github.io/open-color/) 1.9.1 (MIT), indigo.

| Token | Light | Dark | Open Color | Used for |
|---|---|---|---|---|
| `pass` | `#364FC7` | `#3B5BDB` | indigo 9 / indigo 8 | The pass background |
| `on-pass` | `#FFFFFF` | `#FFFFFF` | white | Text on the pass: 6.8:1 light, 5.7:1 dark |
| `on-pass-muted` | `#DBE4FF` | `#EDF2FF` | indigo 1 / indigo 0 | Secondary text on the pass: 5.3:1 light, 5.1:1 dark |
| `pass-line` | `#748FFC` | `#748FFC` | indigo 4 | The tear line and dividers on the pass; decorative, never text |

## Typography

| Role | Font | Used for |
|---|---|---|
| Display | Bricolage Grotesque | H1, H2, H3 |
| Body | IBM Plex Sans | All other text, including numbers and currency symbols |
| Mono | IBM Plex Mono | Ticket codes, IDs, tokens, and the dates and counts on event cards and filters |

| Style | Desktop | Tablet | Mobile | Line height | Weight |
|---|---|---|---|---|---|
| H1 | 60 px | 48 px | 32 px | 1.1 | 700 |
| H2 | 36 px | 32 px | 24 px | 1.2 | 700 |
| H3 | 24 px | 20 px | 20 px | 1.25 | 700 |
| Large | 20 px | 18 px | 18 px | 1.4 | 400 |
| Body | 16 px | 16 px | 16 px | 1.5 | 400, 500 for emphasis and buttons |
| Card title | 16 px | 16 px | 16 px | 1.25 | 700 |
| Small | 14 px | 14 px | 14 px | 1.4 | 400, 500 for emphasis and buttons, 700 for names |
| Caption | 12 px | 12 px | 12 px | 1.3 | 400, 500 for buttons, 700 for emphasis |
| Micro | 11 px | 11 px | 11 px | 1.3 | 400 |
