# Quality measurements

Four gates, one source of numbers: [`perf-budgets.json`](../perf-budgets.json).
Change a budget there and Lighthouse, axe and k6 all follow.

| Command | Measures | Reads |
|---|---|---|
| `pnpm quality:a11y` | WCAG 2.2 AA, every route × both themes × both widths, plus the mobile menu open | `accessibility` |
| `pnpm quality:lighthouse` | LCP, CLS, TBT, category scores, transfer sizes, on simulated 4G mobile | `lighthouse` |
| `pnpm quality:load` | Throughput, latency percentiles, error rate, server CPU and memory | `load` |
| `pnpm quality` | All three | all |

Everything runs against `next build` + `next start`. The dev server recompiles
on demand and ships unminified code, so its numbers are meaningless; nothing
here will use it.

Reports land in `quality/reports/`, which is not committed.

## Reporting, not gating, for now

`perf-budgets.json` sets `enforce: false`. Breaches are printed and the run
still passes, and `.github/workflows/quality.yml` marks each step
`continue-on-error`. That is deliberate: a threshold set before a baseline
exists is a guess, and a noisy gate gets ignored or switched off, which is
worse than no gate.

Flipping `enforce` to `true` turns every budget into a real failure in one
move, and the `continue-on-error` lines come out of the workflow at the same
time. Do that per budget once CI runs show the number is stable.

## What the load test does not measure

`quality/load.mjs` drives one `next start` process on one machine. There is no
CDN, no edge cache, no autoscaling and no geography in the result. It answers
"what does one instance cost per visitor", which is the input to the hosting
decision — not the decision.

Note that every route is currently rendered on demand: the per-request CSP
nonce (`apps/web/src/lib/csp.ts`) means no HTML response can be reused. That
is what makes per-instance cost the number worth knowing.

## Requirements

- Chrome or Chromium on `PATH`, or `CHROME_PATH` set. Lighthouse and axe both
  drive a real browser; the repository does not ship one.
- [k6](https://k6.io/docs/get-started/installation/) for the load test, or
  `K6_PATH` pointing at the binary.

## Experiments

One-off investigations, in `quality/experiments/`. They carry no budgets and
nothing in CI runs them: each answers a question once, and the answer is
written down rather than watched.

| Script | Question |
|---|---|
| `control.mjs` | What can this machine measure at all? Run it first; no result above this ceiling means anything. |
| `a-per-route.mjs` | Is one route unusually expensive? |
| `b-multi-process.mjs` | Does capacity multiply across processes? |
| `c-caching.mjs` | What does the per-request CSP nonce cost, and what would caching with an edge nonce rewrite buy? |

`c-caching.mjs` prototypes the edge rewrite in front of the real app: the HTML
is rendered once, and every response gets a freshly generated nonce
substituted into the body and the CSP header. No visitor is served another
visitor's nonce and nothing is relaxed. Its third configuration, a cached body
sent untouched, exists only to separate the cost of caching from the cost of
rewriting — it is not a proposal, because it would hand every visitor the same
nonce.

Run them with a load generator on a separate machine if the numbers are going
to be spent. On one box, k6 and the servers compete for the same cores and the
multi-process result in particular cannot be trusted.
