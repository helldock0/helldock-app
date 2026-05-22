/**
 * VLR.gg HTML parsers. Cheerio-based.
 *
 * Selectors confirmed against a real VCT CN Stage 1 match page (659476).
 * Defensive: returns nulls instead of throwing when a field is missing.
 */

import * as cheerio from 'cheerio'
import type {
  CheerioAPI,
  Cheerio,
} from 'cheerio'
import type { Element } from 'domhandler'
import { num, parseTeamHref, parsePlayerHref } from './client'
import type {
  VlrMatch,
  VlrMapResult,
  VlrRound,
  VlrPlayerMapStats,
  VlrTeamRef,
  VlrEventMeta,
  VlrEventMatchSummary,
} from './types'

// ─── Match page ──────────────────────────────────────────────────────────────

export function parseMatchPage(html: string, vlrMatchId: number): VlrMatch | null {
  const $ = cheerio.load(html)

  const teamAEl = $('.match-header-link.mod-1').first()
  const teamBEl = $('.match-header-link.mod-2').first()
  if (!teamAEl.length || !teamBEl.length) return null

  const teamA = extractTeamRef(teamAEl)
  const teamB = extractTeamRef(teamBEl)

  // .match-header-vs-note: first = status ("final"/"live"), later = format ("Bo3")
  const notes = $('.match-header-vs-note').map((_, el) => $(el).text().trim()).get()
  const format = (notes.find((s) => /^Bo[135]$/i.test(s)) || null) as
    | 'Bo1'
    | 'Bo3'
    | 'Bo5'
    | null

  // Event
  const eventEl = $('.match-header-event').first()
  const eventHref = eventEl.attr('href') || ''
  const eventIdMatch = eventHref.match(/\/event\/(\d+)/)
  const eventVlrId = eventIdMatch ? Number(eventIdMatch[1]) : null
  // Event name lives in a div with inline `font-weight: 700`, sibling to .match-header-event-series.
  const eventStage = clean(eventEl.find('.match-header-event-series').text()) || null
  const eventName =
    clean(eventEl.find('div[style*="font-weight"]').first().text()) || null

  // Date
  let matchDate: string | null = null
  let matchDatetime: string | null = null
  const dateEl = $('.match-header-date .moment-tz-convert').first()
  const utcTs = dateEl.attr('data-utc-ts')
  if (utcTs) {
    const d = new Date(utcTs.replace(' ', 'T') + 'Z')
    if (!isNaN(d.getTime())) {
      matchDatetime = d.toISOString()
      matchDate = matchDatetime.slice(0, 10)
    }
  }

  // Maps (skip aggregate `data-game-id="all"`)
  const maps: VlrMapResult[] = []
  $('.vm-stats-game').each((_, el) => {
    const $game = $(el)
    const gid = $game.attr('data-game-id')
    if (!gid || gid === 'all') return
    const m = parseMapBlock($, $game, maps.length + 1)
    if (m) maps.push(m)
  })

  // Series-level scores: count map wins (more reliable than reading winner/loser)
  const aMapsWon = maps.filter((m) => m.winnerSide === 'a').length
  const bMapsWon = maps.filter((m) => m.winnerSide === 'b').length
  const winnerSide: 'a' | 'b' | null =
    aMapsWon > bMapsWon ? 'a' : bMapsWon > aMapsWon ? 'b' : null

  return {
    vlrMatchId,
    url: `https://www.vlr.gg/${vlrMatchId}`,
    eventName,
    eventStage,
    eventVlrId,
    format,
    matchDate,
    matchDatetime,
    patch: null,
    teamA,
    teamB,
    teamAScore: aMapsWon,
    teamBScore: bMapsWon,
    winnerSide,
    maps,
  }
}

// ─── Per-map block ───────────────────────────────────────────────────────────

function parseMapBlock(
  $: CheerioAPI,
  $game: Cheerio<Element>,
  mapOrder: number
): VlrMapResult | null {
  const $header = $game.find('.vm-stats-game-header').first()
  if (!$header.length) return null

  // Map name + which team picked
  const $mapDiv = $header.find('.map').first()
  const mapText = $mapDiv.find('span').first().clone().children().remove().end().text().trim()
  const mapName = mapText.replace(/\s+/g, ' ').trim()
  if (!mapName) return null

  const $picked = $mapDiv.find('.picked').first()
  let pickedBy: 'a' | 'b' | null = null
  if ($picked.length) {
    if ($picked.hasClass('mod-1')) pickedBy = 'a'
    else if ($picked.hasClass('mod-2')) pickedBy = 'b'
  }

  // Team headers — left (no .mod-right), right (.mod-right)
  const $teams = $header.find('.team')
  const $teamA = $teams.not('.mod-right').first()
  const $teamB = $teams.filter('.mod-right').first()

  const teamAScore = num($teamA.find('.score').first().text()) ?? 0
  const teamBScore = num($teamB.find('.score').first().text()) ?? 0

  // Side splits: the FIRST .mod-t / .mod-ct span position indicates first-half side
  const teamAFirst = $teamA.find('.mod-t, .mod-ct').first()
  const teamAStartSide: 'Attack' | 'Defense' | null =
    teamAFirst.length === 0
      ? null
      : teamAFirst.hasClass('mod-t')
      ? 'Attack'
      : 'Defense'

  const teamAAtkScore = num($teamA.find('.mod-t').first().text())
  const teamADefScore = num($teamA.find('.mod-ct').first().text())
  const teamBAtkScore = num($teamB.find('.mod-t').first().text())
  const teamBDefScore = num($teamB.find('.mod-ct').first().text())

  // Rounds
  const rounds: VlrRound[] = []
  $game.find('.vlr-rounds .vlr-rounds-row-col').each((_, el) => {
    const $col = $(el)
    const title = $col.attr('title')
    if (!title) return // first col is team-logo header
    if ($col.hasClass('mod-spacing')) return

    const rn = num($col.find('.rnd-num').first().text())
    if (rn == null) return

    const $sqs = $col.find('.rnd-sq')
    if ($sqs.length < 2) return
    const $a = $sqs.eq(0)
    const $b = $sqs.eq(1)

    let winnerSide: 'a' | 'b'
    let winnerRole: 't' | 'ct' | null = null
    if ($a.hasClass('mod-win')) {
      winnerSide = 'a'
      winnerRole = $a.hasClass('mod-t') ? 't' : $a.hasClass('mod-ct') ? 'ct' : null
    } else if ($b.hasClass('mod-win')) {
      winnerSide = 'b'
      winnerRole = $b.hasClass('mod-t') ? 't' : $b.hasClass('mod-ct') ? 'ct' : null
    } else {
      return
    }

    const winnerImg = (winnerSide === 'a' ? $a : $b).find('img').first().attr('src') || ''
    let endType: VlrRound['endType'] = null
    if (winnerImg.includes('elim')) endType = 'elim'
    else if (winnerImg.includes('defuse')) endType = 'defuse'
    else if (winnerImg.includes('boom')) endType = 'detonate'
    else if (winnerImg.includes('time')) endType = 'time'

    let plantHappened: boolean | null = null
    if (endType === 'defuse' || endType === 'detonate') plantHappened = true
    else if (endType === 'time') plantHappened = false

    const half: VlrRound['half'] = rn <= 12 ? '1st' : rn <= 24 ? '2nd' : 'OT'

    // Per-round sides — derived from teamAStartSide + round number
    let teamASide: 'Attack' | 'Defense' | null = null
    let teamBSide: 'Attack' | 'Defense' | null = null
    if (teamAStartSide) {
      if (half === '1st') {
        teamASide = teamAStartSide
      } else if (half === '2nd') {
        teamASide = teamAStartSide === 'Attack' ? 'Defense' : 'Attack'
      } else {
        // OT: each pair of rounds swaps. R25=A's start, R26=swap, R27=A's start, ...
        const otOffset = rn - 25 // 0,1,2,3,...
        const flipped = Math.floor(otOffset / 1) % 2 === 1
        const baseAfter2H = teamAStartSide === 'Attack' ? 'Defense' : 'Attack'
        teamASide = flipped
          ? baseAfter2H === 'Attack'
            ? 'Defense'
            : 'Attack'
          : baseAfter2H
      }
      teamBSide = teamASide === 'Attack' ? 'Defense' : 'Attack'
    } else if (winnerRole) {
      // Fallback: use the winner-role hint
      const winnerSideRole = winnerRole === 't' ? 'Attack' : 'Defense'
      if (winnerSide === 'a') {
        teamASide = winnerSideRole
        teamBSide = winnerSideRole === 'Attack' ? 'Defense' : 'Attack'
      } else {
        teamBSide = winnerSideRole
        teamASide = winnerSideRole === 'Attack' ? 'Defense' : 'Attack'
      }
    }

    rounds.push({
      roundNum: rn,
      half,
      winnerSide,
      endType,
      plantHappened,
      teamASide,
      teamBSide,
    })
  })

  // Players — two scoreboard tables per map, first = team A, second = team B
  const $tables = $game.find('table.wf-table-inset.mod-overview')
  const players: VlrPlayerMapStats[] = []
  $tables.each((tIdx, tbl) => {
    const teamSide: 'a' | 'b' = tIdx === 0 ? 'a' : 'b'
    $(tbl)
      .find('tbody > tr')
      .each((_, tr) => {
        const p = parsePlayerRow($, $(tr), teamSide)
        if (p) players.push(p)
      })
  })

  // Winner of the map
  const winnerSide: 'a' | 'b' | null =
    teamAScore > teamBScore ? 'a' : teamBScore > teamAScore ? 'b' : null

  return {
    mapOrder,
    mapName,
    pickedBy,
    teamAScore,
    teamBScore,
    teamAAtkScore,
    teamADefScore,
    teamBAtkScore,
    teamBDefScore,
    teamAStartSide,
    winnerSide,
    durationMinutes: null,
    players,
    rounds,
  }
}

// ─── Player row ──────────────────────────────────────────────────────────────

function parsePlayerRow(
  $: CheerioAPI,
  $tr: Cheerio<Element>,
  teamSide: 'a' | 'b'
): VlrPlayerMapStats | null {
  // Player
  const $playerLink = $tr.find('.mod-player a').first()
  const playerHref = $playerLink.attr('href') || ''
  const { id: vlrPlayerId } = parsePlayerHref(playerHref)
  const ign =
    $playerLink.find('div').first().clone().children().remove().end().text().trim() ||
    $playerLink.text().trim()
  if (!ign) return null

  // Country (from flag i.mod-{cc})
  const flagClasses = $tr.find('.mod-player i.flag').first().attr('class') || ''
  const ccMatch = flagClasses.match(/mod-([a-z]{2})\b/i)
  const country = ccMatch ? ccMatch[1].toUpperCase() : null

  // Agent
  const $agentImg = $tr.find('.mod-agents img').first()
  const agent =
    ($agentImg.attr('title') || $agentImg.attr('alt') || null)?.trim() || null

  // Stat cells in order:
  // [0] R(rating), [1] ACS, [2] K, [3] D, [4] A, [5] +/-,
  // [6] KAST, [7] ADR, [8] HS%, [9] FK, [10] FD, [11] FK-FD
  const $cells = $tr.find('td.mod-stat')
  const both = (i: number) =>
    num($cells.eq(i).find('.side.mod-both').first().text())
  const atk = (i: number) => num($cells.eq(i).find('.side.mod-t').first().text())
  const def = (i: number) => num($cells.eq(i).find('.side.mod-ct').first().text())

  return {
    player: {
      vlrPlayerId,
      ign,
      country,
      url: playerHref ? `https://www.vlr.gg${playerHref}` : null,
    },
    teamSide,
    agent,
    rating: both(0),
    acs: both(1),
    k: both(2),
    d: both(3),
    a: both(4),
    plusMinus: both(5),
    kast: both(6),
    adr: both(7),
    hsPct: both(8),
    fk: both(9),
    fd: both(10),
    fkFdDiff: both(11),
    acsAtk: atk(1),
    acsDef: def(1),
    kAtk: atk(2),
    kDef: def(2),
    dAtk: atk(3),
    dDef: def(3),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTeamRef($el: Cheerio<Element>): VlrTeamRef {
  const href = $el.attr('href') || ''
  const { id, slug } = parseTeamHref(href)
  const name = clean($el.find('.wf-title-med').first().text())
  return {
    vlrTeamId: id ?? 0,
    name,
    tag: null,
    slug,
    url: href ? `https://www.vlr.gg${href}` : '',
  }
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// ─── Event matches page ──────────────────────────────────────────────────────

export function parseEventMatchesPage(
  html: string,
  vlrEventId: number
): { meta: VlrEventMeta; matches: VlrEventMatchSummary[] } {
  const $ = cheerio.load(html)

  const name = $('.wf-title').first().text().trim() || 'Unknown Event'
  const prizePool =
    $('.event-desc-item-label:contains("Prize pool")').next().text().trim() ||
    null
  const dates =
    $('.event-desc-item-label:contains("Dates")').next().text().trim() || null

  let startDate: string | null = null
  let endDate: string | null = null
  if (dates) {
    // e.g. "Mar 31 - May 10, 2026" — best-effort parse
    const m = dates.match(/([A-Za-z]+ \d{1,2})\s*[-–]\s*([A-Za-z]+ \d{1,2}),?\s*(\d{4})/)
    if (m) {
      const yr = m[3]
      const s = new Date(`${m[1]}, ${yr}`)
      const e = new Date(`${m[2]}, ${yr}`)
      if (!isNaN(s.getTime())) startDate = s.toISOString().slice(0, 10)
      if (!isNaN(e.getTime())) endDate = e.toISOString().slice(0, 10)
    }
  }

  const matches: VlrEventMatchSummary[] = []
  $('a.wf-module-item.match-item, a.match-item').each((_, el) => {
    const $a = $(el)
    const href = $a.attr('href') || ''
    const idMatch = href.match(/^\/(\d+)\//)
    if (!idMatch) return
    const vlrMatchId = Number(idMatch[1])

    const teamNames = $a
      .find('.match-item-vs-team-name')
      .map((_, t) => clean($(t).text()))
      .get()
      .filter(Boolean)
    const stage = clean($a.find('.match-item-event-series').text()) || null
    const date = clean($a.find('.match-item-time').text()) || null
    // A match is completed when there's a winner team marker; live matches show
    // .mod-live; future matches have neither.
    const completed = $a.find('.match-item-vs-team.mod-winner').length > 0

    matches.push({
      vlrMatchId,
      url: `https://www.vlr.gg${href}`,
      stage,
      date,
      teamAName: teamNames[0] || '',
      teamBName: teamNames[1] || '',
      completed,
    })
  })

  return {
    meta: {
      vlrEventId,
      name,
      url: `https://www.vlr.gg/event/${vlrEventId}`,
      region: null,
      prizePool,
      startDate,
      endDate,
    },
    matches,
  }
}
