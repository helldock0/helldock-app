# Cover Email — Wuxi TEC Data Analyst Application

> **Subject:** TEC 数据分析师应聘 — VCT CN scouting system + AG sample report — James (jamesjoy696@gmail.com)
>
> _Replace bracketed parts before sending. Keep total length ~250 words in body — coaches don't read long emails._

---

To: \[VCTCNPosting contact / TEC recruiting email\]
From: James Joy · jamesjoy696@gmail.com · \[your phone / WeChat / Discord\]
Subject: TEC 数据分析师应聘 — VCT CN scouting system + AG sample report

Hi,

Applying for the data analyst role you posted via VCTCNPosting. Rather than describe what I'd do, here's what I built in the 3 days since the post went up:

**Live scouting system:** \[VERCEL_URL\]/pro-scout
**Sample deep scout — All Gamers (your EWC LBF loss):** \[VERCEL_URL\]/pro-scout/all-gamers

The system ingests every VCT CN match from VLR.gg into a structured database, then renders per-team dossiers — map pool, side splits, roster vs role baselines, top comps, tactical patterns (pistol/eco/plant rate/closeout-vs-comeback), and an AI-generated coach memo. The memo is produced by Gemma 4 31B via Google AI Studio with a prompt designed to surface tactical insight a head coach can act on — not pretty charts.

I picked AG as the sample because they're your most recent painful matchup. The system identifies their +21.4pp recent trend, their 93%-closeout / 27%-comeback fragility, their 29% plant rate (pick-driven attack), and Septem7 as the clear pressure target. That's the kind of read I'd produce for every opponent on the Stage 2 schedule.

I've reached out to Grid this week about formalizing access to their VCT data feed — that's where round-level economy and positional data live (VLR can't expose those). The framework I built ports directly to richer data once I'm on staff.

Stack: Next.js 14, Supabase, custom VLR scraper, Gemma 4 31B for narrative generation. Code is private; happy to walk through architecture on a call.

Available for video call in your timezone.

— James

---

## Loom script (record 2-3 minutes)

1. **0:00–0:20** Title card on screen: "Wuxi TEC · Data Analyst Application · James"
2. **0:20–0:45** Open `/pro-scout` — pan over the team list, "12 teams in VCT 2026 CN Stage 1, indexed from VLR.gg"
3. **0:45–1:30** Click into All Gamers. Read the AI memo aloud. Point to one tactical claim (e.g. "93% closeout, 27% comeback — get them down early"). Then point to the underlying data that supports the claim (the Tactical Patterns card).
4. **1:30–2:15** Scroll to roster table. Show the f4ngeer/Septem7 split. Mention the league-baseline column ("this player is +44 over role p50 — that's why he's labeled the carry").
5. **2:15–2:45** Scroll to map matrix. Show pick split + side splits. Note Pearl 0-2.
6. **2:45–3:00** Close: "This is what I'd produce for every opponent on the Stage 2 schedule. The system runs in ~20 seconds per team. Looking forward to talking."
