# Pro Scout — VCT CN scouting module

Public-facing opposition dossiers for every VCT 2026 China Stage 1 team. Built as a sibling module inside `helldock-app`, sharing the same Next.js + Supabase stack but with its own `pro_*` table namespace and a public-readable route under `/pro-scout`.

Built in 3 days for the **Wuxi TEC data analyst** application.

## What's at /pro-scout

- **`/pro-scout`** — team picker. Lists all 12 VCT CN teams with quick form (record · win % · last 5 series · last played).
- **`/pro-scout/[teamSlug]`** — deep scout report on one team. Sections:
  - Auto-computed **scout headline** (algorithmic, never empty)
  - **AI coach memo** (Gemma 4 31B via Google AI Studio, cached in DB)
  - **Form** card — series + map record, recent W-L strip, trend delta
  - **Map pool** — per map: pick split, win %, atk/def side splits, top agent comps
  - **Tactical patterns** — pistol / bonus / plant rate / closeout / comeback / OT
  - **Roster** — per player: primary role, signature agent, ACS vs role baseline (full-league percentiles), +/- diff
  - **Top comps** — most-played 5-agent combos with win %
  - **Match history** — last 15 matches with map breakdown

## Data pipeline

```
VLR.gg HTML
   ↓ src/lib/vlr/parsers.ts   (cheerio)
   ↓ src/lib/vlr/ingest.ts
Supabase pro_* tables
   ↓ src/lib/pro-scout/dossier.ts
ProTeamDossier
   ↓ src/lib/pro-scout/narrative.ts  (Google AI Studio · Gemma 4 31B)
pro_scout_narratives cache
   ↓ src/app/pro-scout/[teamSlug]/page.tsx
Rendered HTML (public)
```

## What VLR exposes vs what we get

| Data | VCT CN Stage 1 | EWC China Qual | Evolution Act 2 |
|---|:---:|:---:|:---:|
| Match metadata (teams, score, event) | ✓ | ✓ | ✓ |
| Per-map score + side splits | ✓ | ✓ | ✓ |
| Per-player ACS / K / D / A / +- | ✓ | ✗ (blank) | partial |
| Per-player agent | ✓ | ✗ | partial |
| Round-by-round winner + end type | ✓ | ✗ | ✗ |
| Round economy / kill events / positions | ✗ (paid-tier only) | ✗ | ✗ |

VLR's rendering is event-dependent — sometimes detailed stats are gated behind a different tab or hidden until the event finishes. The compute layer is defensive: NULL stats are excluded from averages rather than dragging them down.

## Operating the system

### Initial setup (one-time)

```powershell
# 1. Apply the pro_* schema (already migrated via Supabase MCP)
cat SCHEMA_PRO.sql # for reference; migration named 'pro_scouting_schema' is live

# 2. Backfill events
npx tsx scripts/scrape-vlr-event.mts   # all configured events
npx tsx scripts/scrape-vlr-event.mts --event 2864 --limit 1   # smoke test
```

### Generate AI memos

```powershell
# Set GOOGLE_AI_API_KEY in .env.local
npx tsx scripts/gen-narratives.mts              # all teams with ≥3 matches
npx tsx scripts/gen-narratives.mts --vlr 1119   # specific team by VLR id
npx tsx scripts/gen-narratives.mts --force      # ignore 24h cache TTL
```

### Add a new event to the dataset

1. Find the VLR event id (URL: `/event/{id}/{slug}`).
2. Append to `EVENTS` array in `scripts/scrape-vlr-event.mts`.
3. Run `npx tsx scripts/scrape-vlr-event.mts --event {id}`.

## Limitations (be honest about these in the pitch)

1. **No round-level data for EWC matches.** VLR doesn't render the round strip. Tactical patterns for those matches come purely from VCT CN Stage 1 data.
2. **No kill events / positional data anywhere.** That's rib.gg / Grid territory, paid.
3. **AI memo quality varies.** Gemma 4 31B is solid but not Claude-class. Some memos may need a manual editorial pass before being treated as final coach-facing copy.
4. **VLR scraping is ToS-grey.** Polite rate (1.5s) helps, but a heavy-traffic VLR change could break us. Grid as an upstream is the real long-term answer.

## Roadmap if hired by TEC

- Formalize Grid data feed (round-level economy + positional)
- Hand-tag opponent comp playbooks for top 5 maps in pool
- Daily refresh cron (Vercel cron hits scrape + gen-narratives)
- TEC self-scout view alongside opponent dossiers
- Chinese-language UI toggle
- Player-individual deep dives (entry/trade/closeout rates per round phase)

## Stack

- **Next.js 14** App Router · server components
- **Supabase** — Postgres + RLS (anon SELECT on `pro_*`, authenticated full access)
- **cheerio** — VLR HTML parsing
- **Recharts** — (shared with scrim helldock; not heavily used in pro-scout MVP yet)
- **Google AI Studio · Gemma 4 31B** — narrative generation (free tier, cached)
- **Tailwind** — styled in helldock's existing color palette
