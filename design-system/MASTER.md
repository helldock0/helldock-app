# Helldock — Design System (MASTER)

Reflects the system already implemented in `helldock-app/tailwind.config.ts` and `src/app/globals.css` as of 2026-05-24. The reference implementation is `src/app/app/page.tsx` (Pulse dashboard) and the `pro-scout-app/src/app/page.tsx` (VCT team index). Pattern any new page after those before reinventing.

Scope: helldock-app SaaS surfaces + pro-scout-app. Both apps share these tokens.

**Hierarchy:** This file is the global source of truth. Page-specific overrides live in `design-system/pages/<page>.md` and only apply on that page.

---

## Style

- **Name:** Data-Dense Dark (OLED-friendly)
- **Mode Support:** Dark only — no light variant in MVP
- **Mood:** Coach-grade analytics console, scrim-ops command center, no-nonsense
- **Best For:** Long late-night scrim review, high-information KPI grids, cross-match comparison
- **Performance target:** instant; tables >50 rows must virtualize
- **Accessibility target:** WCAG AA across body text, AAA where reachable on primary text

## Colors (canonical Tailwind tokens)

Reference the Tailwind class, not the hex. Hex values shown so the spec is self-contained.

### Surfaces
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0F0F12` | Page background, body root |
| `surface` | `#1B1B1F` | Default card / panel surface |
| `surface-2` | `#2C2C32` | Elevated card (Pulse cards, Watch cards, Review queue container) |
| `surface-3` | `#35353C` | Hover state for `surface-2`, table row hover |

### Borders
| Token | Hex | Use |
|---|---|---|
| `line` | `#2F2F36` | Default dividers, table row dividers |
| `line-strong` | `#3C3C44` | Card outlines (typically `border-line-strong/40` at 40% opacity), input borders |

### Text
| Token | Hex | Use |
|---|---|---|
| `fg` | `#F5F5F7` | Primary text, KPI values, table cells |
| `muted` | `#8A8A93` | Secondary text, descriptions |
| `muted-2` | `#6B7280` | Tertiary text, uppercase eyebrows, metadata, footer |

### Brand accents
| Token | Hex | Use |
|---|---|---|
| `gold` | `#FFD700` | Primary brand accent: wins, "working", focus ring, primary CTA bg |
| `gold-hover` | `#FFC107` | Hover state on gold buttons |
| `gold-dim` | `#B89400` | Disabled/dim gold variant |
| `crimson` | `#DC143C` | Problems, "broken", losses, destructive |
| `crimson-dim` | `#8B0E27` | Disabled/dim crimson variant |
| `win-green` | `#34D399` | Win counts in tables, positive deltas (not a primary brand color — used sparingly for "W" indicators) |

### Accent semantics (load-bearing)
- **gold** = good news / strengths / call to action / primary brand
- **crimson** = problems to fix / losses / destructive actions / alerts
- **win-green** = win-count indicators only (tables, sparklines)
- Never use gold for problems or crimson for wins. The two-tone semantic is the product's core visual logic.

## Typography

Already wired in `src/app/layout.tsx` via `next/font/google` → CSS variables `--font-fira-sans` and `--font-fira-code`. Tailwind maps `font-sans` → Fira Sans, `font-mono` → Fira Code.

- **Body / UI:** Fira Sans (300, 400, 500, 600, 700)
- **Numerics / code:** Fira Code (400, 500, 600, 700) — used for KPI values, table number columns, match IDs
- **Tabular figures:** globally on via `font-feature-settings: 'tnum', 'ss01';` in `body` (globals.css). For explicit cases, also use `.tnum` utility class or `tabular-nums`.

**Type scale in use:**
- `text-2xs` (custom: 11px / 16px line height) — uppercase eyebrows, metadata, footer
- `text-xs` (12px) — small captions, table headers
- `text-sm` (14px) — body, secondary text
- `text-base` (16px) — default body
- `text-lg` (18px) — emphasis
- `text-xl` / `text-2xl` (20 / 24px) — page H1
- `text-[2.25rem]` (~36px) — KPI value (size=md cards)
- `text-5xl` / `text-6xl` (48 / 60px) — landing hero only

**Tracking conventions:**
- Uppercase eyebrows: `tracking-[0.16em]` for compact zones, `tracking-[0.22em]` for zone headers, `tracking-[0.25em]`–`[0.3em]` for hero/landing eyebrows
- Headlines: `tracking-tight`
- Body: default

## Effects

Already defined in `tailwind.config.ts` and `globals.css`:

- **Card shadow:** `shadow-card` — inset white-2% top edge + 24px shadow at 60% opacity below. Use on elevated cards.
- **Gold glow:** `shadow-gold-glow` — 1px gold ring at 25% opacity + 32px gold glow. Use on hover/active for emphasis (sparingly).
- **Focus ring:** Global `:focus-visible` outline is 2px gold at 75% with 2px offset and 6px radius (in `globals.css`). Don't override.
- **Custom transition timing:** `ease-out` — cubic-bezier(0.16, 1, 0.3, 1). Use on accent transitions.
- **Flash gold animation:** `.flash-gold` class — 2s gold flash for deep-link landings (used by review-queue "Jump to round").
- **Custom scrollbar:** 10px width, `#2F2F36` thumb hovering to `#3C3C44`.

**Interaction patterns observed in the dashboard:**
- Card hover: `hover:bg-surface-3 hover:border-line-strong`
- Link hover: `hover:text-gold transition-colors`
- Border hover: `hover:border-gold/30` or `hover:border-gold/60` for stronger emphasis
- Left-edge accent bar: `before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-{gold,crimson}/70` — used to color-code Pulse cards and Watch cards
- Pill tag: `border bg-{accent}/15 text-{accent} border-{accent}/40 px-2 py-0.5 rounded text-2xs uppercase tracking-wider`

## Information Architecture (zone pattern)

The dashboard establishes a repeatable zone pattern. Use it for any data-dense screen.

- **`<ZoneHeader>`** — dot indicator (gold / crimson / muted-2) + uppercase title + optional right-aligned hint
- **Section spacing:** `mb-7` between zones
- **Grid:** Pulse uses 2 / 3 / 6 columns responsive. Watch list and most KPI grids use 1 / 2 / 3 columns. Tables use full width inside `bg-surface-2 rounded-2xl border border-line-strong/40`.
- **Card radius:** `rounded-2xl` for cards and containers, `rounded-md` for inline buttons / tags, `rounded-lg` for medium buttons
- **Padding:** Cards `p-4` (small) or `p-5` (default). Section gap `gap-3`.

## Anti-patterns (do not do)

- **Hardcoded hex in components** — use Tailwind tokens. The landing page (`src/app/page.tsx`) currently violates this with `#0E0E12`, `#FFD700`, etc.; it's a known cleanup target.
- **Light-mode default** — dark is the only theme in MVP
- **Emoji as structural icons** — use Lucide / Heroicons SVG. (Emojis as semantic accents inside copy — e.g. ⚠ for failures, ▶ for chevrons — are tolerated; not as primary nav/action icons.)
- **Color as the sole indicator** of win/loss, attack/defense, severity — pair with icon, label, or shape
- **Decorative animations on data** — animation must convey state change (filter applied, row updated, deep-link landed), not personality
- **Skipping virtualization** on tables that can exceed 50 rows (match log, round log, audit log)
- **Mixing numeric font with body font in columns** — number columns must use Fira Code or `tnum` so digits don't shift
- **Crimson for emphasis / gold for warnings** — that inverts the semantic. Keep the two-tone discipline.

## Pre-Delivery Checklist

When polishing any page, verify:

- [ ] All colors come from Tailwind tokens (`bg-`, `text-`, `border-`) — no raw `#hex` in component class strings
- [ ] Text contrast: `text-fg` on `bg`/`surface`/`surface-2` passes 4.5:1
- [ ] Interactive elements have visible `:focus-visible` state (global gold ring handles most cases — verify it isn't removed)
- [ ] Hover transitions use `transition-colors` or `transition-all duration-200 ease-out`
- [ ] Number columns and KPI values use `font-mono`, `tnum`, or `tabular-nums`
- [ ] Tables that can exceed 50 rows are virtualized
- [ ] Section spacing uses the zone pattern (`mb-7`, `ZoneHeader`, `rounded-2xl bg-surface-2 border border-line-strong/40`)
- [ ] `prefers-reduced-motion` honored — globals.css handles it; new bespoke animations must add their own clamp
- [ ] Responsive verified at 375 / 768 / 1024 / 1440 px
- [ ] Accent semantics correct: gold = good, crimson = bad, win-green = win counts only

## Reference implementations

When in doubt, mimic these:

- `helldock-app/src/app/app/page.tsx` — Pulse dashboard. The canonical zone-based, data-dense KPI grid + tables + alert cards. Read it before designing any new analytics screen.
- `pro-scout-app/src/app/page.tsx` — Tokenized list of teams. The canonical "list of clickable rows in a card container" pattern.
- `helldock-app/src/app/globals.css` — base layer (focus ring, tabular numerals, scrollbar, flash animation)
- `helldock-app/tailwind.config.ts` — color tokens, font wiring, shadows, easing

## Pattern (landing page only)

Landing pages use a separate convention: hero with gold-accent eyebrow + crimson/gold inline-emphasis headline + 4-card feature grid + problem statement with `→` bullets + closing CTA + thin footer. This is documented in the existing `helldock-app/src/app/page.tsx`. When the landing page is polished, that polish should also produce a `pages/landing.md` override capturing any landing-specific rules.
