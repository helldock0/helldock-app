# Helldock — Features Reference

The full operator guide for everything currently shipped in helldock-app. Every page, every tab, every hidden query-param, every "click-this-row-to-expand" trick.

Last synced: 2026-05-20 (post-S19).

---

## 1. Quick map of everything

| Where | What | Hidden tricks |
|---|---|---|
| `/` | **Command Center** (Pulse, Watch list, Broken/Working, Opp intel, Entry) | Watch list only renders if anomalies detected |
| `/matches` | Match log (last 50, sortable) | — |
| `/matches/[id]` | Match detail + Win Probability curve | `?edit=1` enables inline edit |
| `/matches/new` | Manual match entry | — |
| `/calendar` | Scrim schedule + match log overlay | `?ym=YYYY-MM` jumps to month |
| `/analytics` | 7-tab deep dive | `?tab=`, `?map=`, `?hideAcademy=1` |
| `/trends` | Rolling form, streaks, weekly retro | — |
| `/prep?opp=NAME` | Opponent dossier (ban/pick/threats/export) | Direct URL works without nav |
| `/opponents/[name]` | Same dossier, detail view | — |
| `/players/[playerId]` | Player career profile | — |
| `/import` | Henrik fetch + bulk import + rehydrate | localStorage caches previews |
| `/roster` | Roster grid (Main/Sub/Trial, inline edit) | — |
| `/settings` | Discord webhook + capture tokens | Gear icon top-right |
| `/select-team` | Team switcher | Full-screen overlay |
| Global Search | Players / opps / matches keyword search | Header; hidden on mobile |

---

## 2. Command Center — `/`

**5 zones, top-to-bottom:**

### 2.1 Pulse strip (6 cards)
`Total Scrims | This Week | Win Rate | Win Streak | Last Match | Most Played`
- Each card is a link. Last Match jumps to the specific match detail; Most Played jumps to `/analytics?tab=maps`.

### 2.2 Watch list (conditional)
Renders **only** if `computeWatchList()` finds anomalies. Each card is severity-tagged:
- **act** (crimson) — needs action (e.g., pistol DEF loss streak)
- **check** (gold) — worth a look (e.g., new comp underperforming)

If you don't see it, no anomalies. That's good news.

### 2.3 What's broken (crimson zone)
4 cards: Worst Map, DEF Side %, Pistol DEF L Streak, 1v1 Losses. All click through to relevant analytics tab.

### 2.4 What's working (gold zone)
4 cards: Best Map, ATT Side %, Best Player (7d), Comp Working.

### 2.5 Opp intel (top 5 by appearance)
Mini-table of last-5 most-faced opponents with W-L record. Footer: `view all opponents →` → `/analytics?tab=opps`.

### 2.6 Entry stats
2 cards: FK Conversion, FD Survival. Both link to Rounds tab.

**Empty state:** With 0 matches, you see "No data yet" + Import/New buttons.

**Hidden:** Trials excluded from all aggregates (see `roster_status === 'trial'` filter at `src/app/(authed)/page.tsx:174`).

---

## 3. Matches — `/matches`, `/matches/[id]`, `/matches/new`

### 3.1 `/matches`
Sortable table of last 50 non-deleted matches. Columns: ID, Date, Type, Opponent, Map, Score, Result.

### 3.2 `/matches/[matchId]`
Full match breakdown. Includes:
- Round-by-round summary (kill events, plant timing, ult usage)
- Player stat lines (our + opp)
- **Win Probability curve** — logistic regression trained on team history, predicted WP per round (see Section 12)
- Discord embed preview (if webhook configured)

**Query param:** `?edit=1` — opens inline-edit mode for coach grades, tags, MVP picks, etc.

**Rehydrate button** — re-pulls from Henrik V4, replaces kill_events + rounds + player stats. Use after shipping new V4-derived fields.

### 3.3 `/matches/new`
Manual match entry form. Locks to current team. No Henrik dependency — just opponent + map + scores + agents. Generates the next `match_id_helldock` (M001, M002…). Fires Discord webhook on save.

---

## 4. Calendar — `/calendar`

Month grid with two event types overlaid:
- **Matches** — past/completed, click for detail
- **Scrim Schedule** — future scheduled scrims (set up via the scrim-schedule API)

**Navigation:** ←prev / today / next→ buttons. Or `?ym=2026-05` to jump directly to a month.

**Event status:** scheduled / cancelled / completed. Completed events can link to the match they produced.

---

## 5. Analytics — `/analytics?tab=...`

7 sub-tabs. URL drives the active tab: `?tab=maps | players | opps | rounds | complab | pool | gems`.

**Persistent UI across all tabs:**
- **Coach Summary strip** at the top (last 5/10 record, side bias, best/worst map, worst round type, top/bottom fragger, AFK/FF flags, **most-depended player**)
- **Hide Academy toggle** (top-right) — appears only if `internalCount > 0`. Filters out matches where 3+ opponents are on the OTHER academy team's roster (auto-detected).

### 5.1 Maps tab — `?tab=maps`
- Per-map win % with sample size
- Side splits (ATT/DEF win rates)
- Pistol %, Eco %, Site execute %
- Avg score, top comp per map
- Tier classification (S/A/B/C/DEV)

### 5.2 Players tab — `?tab=players`

**Main table columns (sortable):** name, games, ACS, K/D, +/-, best map, 7d ACS Δ, FK, FD, plants, defuses, ADR, HS%, trade rate, drag, carry, KST, opening duel %, **Rating 2.0**, 2K rate.

🔑 **Click any row to expand a stat drawer** — this is where the deep S17 metrics live:
- **Rating 2.0** breakdown — KPR (kills/round), survival rate, KST%
- **ACS consistency** — stdev + coefficient of variation (cv%)
- **Pre-plant / Post-plant kills** — tactical timing split
- **Per-map ACS**, top agent, rating history per match

The drawer is the highest-value part of this tab and easy to miss. If a player has Rating 2.0 = 1.10 with 12% cv, that's a steady high-impact frag. Cv > 30% = streaky.

**Glossary for this tab:** see Section 15.

### 5.3 Opponents tab — `?tab=opps`
- Head-to-head record per team
- Riot MMR chip per opponent player (cached, refreshed via button)
- **🧾 Prep icon** in each row — opens `/prep?opp=NAME` (full dossier)
- Top 3 threats by ACS

### 5.4 Rounds tab — `?tab=rounds`
- Side bias (ATT% vs DEF%)
- Pistol rate
- Round-type matrix (Pistol / Eco / Anti-Eco / Bonus / Full Buy × ATT/DEF outcomes)
- Clutch %, first-blood %, plant timing
- Half breakdown (1st / 2nd / OT)
- Pistol carryover (W rate on bonus after pistol win/loss)

🔑 **Map filter** — dropdown at the top of the tab. Selecting a map filters every section (matrix, FB impact, halves, pistol, plant timing). State persists in the URL as `?map=Ascent` so it's bookmarkable. "All maps" returns to aggregate view.

### 5.5 Comp Lab tab — `?tab=complab`
3 sub-views via `?view=permap | heatmap | synergy`:

- **Per-map** (default): Winners (≥60% WR), Experimental (40–60%), Losers (<40%) on the selected map. Map selector at top.
- **Heatmap**: comp × map grid with WR per cell.
- **Synergy**: pairwise agent synergy + **lift** (pair WR − mean of solo WR). Top pairs leaderboard + agent×agent grid.

🔑 The synergy view is buried 2 levels deep but has the highest signal for duo identification. Lift > +10pp = overperforming duo; lift < −10pp = anti-synergy.

### 5.6 Map Pool tab — `?tab=pool`
All 11 maps with tier classification + pick/ban recommendation. Quick read on map-pool health.

### 5.7 Gems tab — `?tab=gems`
6 specialized leaderboards:
1. **Multi-kill leaders** — 2K/3K/4K/ace rates per game
2. **Clutch leverage** — clutches + high-leverage 1v2+ clutches
3. **Trade %** — team trade rate on first-blood rounds (per map)
4. **First-blood weapons** — meta breakdown (which guns get FBs)
5. **Damage net** — damage made − received (per player)
6. **Plant timing by map** — median plant time, W vs L (3+ sample min)

Plus a 7th panel: **Pistol carryover** — bonus round WR after pistol W vs L.

---

## 6. Trends — `/trends`

Long-horizon view. 5 sections:
- **Rolling WR** — 30-match rolling average (scrim-only line + overall line)
- **Weekly side bias** — ATT% vs DEF% per ISO week, last 12 weeks
- **Player ACS buckets** — 5-game rolling ACS per player, auto-flagged improving/declining/stable
- **Streaks** — current + longest W/L streaks
- **Weekly retro** — last 7d vs prior 7d (W/L delta, side % delta, top-fragger delta)

🔑 **Coming next (per plan):** Model Health panel — calibration of the Win Probability model. Don't trust the WP curve until you see how calibrated it is.

---

## 7. Prep / Opponent Dossier

### 7.1 `/prep?opp=NAME`
Full prep checklist for an opponent. Sections:
- **Ban candidates** — their strongest maps (≥60% WR, n≥2)
- **Pick candidates** — our strongest maps vs them (≥60% WR, n≥2)
- **Recent form** — last 5 matches vs this opponent
- **Top threats** — their 3 highest-ACS players
- **Map breakdown** — every map vs them with W/L %
- **Match history** — chronological list
- **🔘 Export to markdown** — copies a full dossier to clipboard. Drop into Discord or a coach doc.

### 7.2 `/opponents/[name]`
Same data shape, dedicated route. Useful for sharing a permalink.

**Entry points:**
- 🧾 icon on Opponents tab rows
- Direct URL
- `/prep` with no `?opp=` shows the empty state (use the search there)

---

## 8. Player Profile — `/players/[playerId]`

Single-player deep dive:
- Career stats — lifetime ACS, K/D, HS%, entry-frag rate
- **Stats vs each opponent** — ACS/KD matrix per opp faced
- **Stats per agent** — pick rate, WR, ACS per agent
- **Match history** — every match with result/map/ACS
- **Rating trend chart** (`RatingTrendChart` component)

**Entry points:** Click any player name on Analytics → Players tab. Or direct URL.

---

## 9. Import — `/import`

Henrik-based bulk import flow:

1. **Search** — type Riot ID (name + tag), select region
2. **Fetch** — pulls 10 recent custom + 10 Premier matches from Henrik V4
3. **Filter** — auto-filters out <12 round games, dedupes per team
4. **Internal-scrim flag** — auto-detects scrims against the OTHER academy team's roster (≥3 player overlap)
5. **Preview** — see opponent, map, score, agents before saving
6. **Bulk save** — checkbox-select matches, hit save. Ingests rounds + kill events + player stats; fires Discord webhook
7. **Rehydrate** — re-pull existing match from Henrik. Use after shipping new V4-derived fields (cross-ref `feedback_rehydrate_after_ship.md`)
8. **Hide internal scrim toggle** — localStorage-persisted per team

**Cache:** Recent fetches stored in localStorage with age display.

---

## 10. Roster — `/roster`

Player grid grouped by status:
- **Main** — active starters
- **Sub** — bench
- **Trial** — excluded from team aggregates (badge tooltip explains this)

**Each player card:** display name, Riot ID, role, agent, status, match count.

**Inline edit:** Click any player to edit display name, riot ID, role, agent, status. Save in place.

**+ Add Player** — create new roster entry.

**Alt account linking:** Each player can have multiple `player_accounts` rows (alt smurf account, separate riot IDs that map to the same person). Useful when one player plays on multiple Riot accounts.

---

## 11. Settings — `/settings`

Two sections:

### 11.1 Discord webhook
- Paste webhook URL → save
- Test message button (sends a sample embed)
- Clear webhook
- State indicator: idle / saving / saved / error

Stored at `teams.discord_webhook_url`. Used by ingest pipeline to post match summaries.

### 11.2 Capture tokens (HDX automator)
For the `helldock-capture` Electron tray agent:
- Generate new bearer token (plaintext shown **once** — copy immediately)
- View active tokens (label, player, last-used timestamp)
- Revoke token (soft delete — `revoked_at` set)

Tokens are SHA-256 hashed at rest. The capture agent reads the lockfile from `%LOCALAPPDATA%\Riot Games\...` and POSTs hidden custom match IDs to `/api/captures/ingest` using its token.

---

## 12. Match Win Probability — read this

On `/matches/[id]`, you see a WP curve. **It is a per-round logistic regression** trained on this team's history, with features:
- Score difference
- Side (ATT/DEF)
- Econ ratio
- Round number
- Pistol round flag

A round predicted at "70% to win" means: across this team's similar past situations, that scenario resolved as a win 70% of the time. **It is not a real-time game-state estimator like rib.gg.**

**Calibration matters.** Until the Model Health panel ships on Trends (planned), you have no UI feedback on whether the model is overconfident. Rule of thumb: if you've shipped recent metric changes, run `/api/matches/[id]/rehydrate` so the training data is fresh.

---

## 13. Discord integration — what fires when

| Trigger | Where | Embed contents |
|---|---|---|
| New match imported (Henrik) | `ingestMatch()` at end | Halves, pistol, ATT/DEF WR, top fragger, heatmap PNG |
| New match logged (manual) | `POST /api/matches` | Same shape, minus heatmap if no kills |
| Test from Settings | `POST /api/settings/discord/test` | Sample embed |
| Replay missed posts | `scripts/resend-discord.mts <matchIds>` | Same as ingest path |

Heatmap PNG: server-side rendered via `@resvg/resvg-js` (`src/lib/discord-heatmap.ts`). Currently NOT cached — every send re-renders.

---

## 14. URL query param cheat-sheet

| Route | Param | Purpose | UI control? |
|---|---|---|---|
| `/analytics` | `?tab=maps\|players\|opps\|rounds\|complab\|pool\|gems` | Active tab | Yes (tab strip) |
| `/analytics` | `?map=NAME` | Map filter on Rounds tab + CompLab map selection | Yes (dropdown in both tabs) |
| `/analytics` | `?hideAcademy=1` | Filter internal scrims | Yes (toggle, conditional) |
| `/analytics?tab=complab` | `?view=permap\|heatmap\|synergy` | Comp Lab sub-view | Yes (buttons) |
| `/calendar` | `?ym=YYYY-MM` | Jump to month | Yes (prev/next buttons) |
| `/matches/[id]` | `?edit=1` | Inline-edit mode | Yes (edit button) |
| `/prep` | `?opp=NAME` | Load opponent dossier | Yes (search) |

🔑 **Power-user shortcut:** Bookmark `/analytics?tab=rounds&map=Ascent&hideAcademy=1` to land directly on filtered round stats for Ascent in scrim-only mode.

---

## 15. Glossary

### Player metrics

| Term | Formula | Interpretation |
|---|---|---|
| **ACS** | (kills × 150 + assists × 75 + damage/1000 × 100) per round | Combat score; 220+ is strong |
| **Rating 2.0** (Helldock) | `0.5 × normKPR + 0.3 × normSurvival + 0.2 × normKST` | HLTV-style; 1.00 ≈ pro avg. Above 1.10 = elite |
| **KST%** | `% rounds with kill, survive, or trade-death` (no assists — Henrik limitation) | 70%+ = strong round impact; 50%- = weak |
| **KPR / SPR** | Kills per round / Survives per round | Inputs to Rating 2.0 |
| **Trade rate** | % of deaths where teammate avenged within 5s | Team cohesion signal |
| **Drag** | `P(loss \| died) − P(loss \| alive)` | High = team depends on this player surviving |
| **Carry** | `P(win \| had ≥1 kill) − P(win \| 0 kills)` | High = team needs them to frag |
| **Opening duel W%** | First-blood conversion rate | 55%+ = strong entry; 45%- = passive |
| **ACS stdev / cv** | stdev of match-level ACS / coefficient of variation | Low cv (<20%) = consistent; high (>35%) = streaky |
| **Pre/Post-plant kills** | Kill count split around bomb plant moment | Tactical role indicator |

### Round/team metrics

| Term | Meaning |
|---|---|
| **FK / FD** | First Kill / First Death of a round |
| **Round types** | Pistol / Eco / Anti-Eco / Bonus / Full Buy |
| **Pistol carryover** | Bonus round WR after pistol W vs L |
| **Site execute %** | Successful planted-site rate (per A/B/C) |

### Comp metrics

| Term | Meaning |
|---|---|
| **Lift (pp)** | Pair WR − mean(solo WR of A, solo WR of B) | + = overperforming duo |
| **Archetype** | Standard / Double Init / Double Sentinel / etc. (auto-classified) |
| **Tier** | S/A/B/C/DEV — based on WR thresholds + sample size |

### Coach grades

Rounds can carry 1–5 grade + tags (free-text). Surfaces in Coach Summary strip via `computeCoachSummary`.

---

## Quick wins you might be missing

If you only read one section: **5.2 Players tab row expansion**. Click a player row. The drawer contains 80% of the analytical value you're paying compute for.

Second pick: **5.5 Comp Lab → synergy sub-view**. The lift number tells you which duos are over/underperforming relative to their solo records. Top of the duos list = your most reliable 2-stack; bottom = consider splitting.

Third: **7.1 Prep → Export to markdown**. Before every match, paste this into your coach Discord. Takes 3 seconds, replaces 20 minutes of prep work.
