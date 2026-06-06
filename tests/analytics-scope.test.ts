import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveAnalyticsMatchScope } from '../src/lib/analytics-scope'

const matches = [
  {
    id: 'older',
    match_id_helldock: 'M001',
    match_date: '2026-05-31',
    session_num: 1,
    created_at: '2026-05-31T18:00:00.000Z',
  },
  {
    id: 'latest-second',
    match_id_helldock: 'M004',
    match_date: '2026-06-02',
    session_num: 2,
    created_at: '2026-06-02T20:00:00.000Z',
  },
  {
    id: 'middle',
    match_id_helldock: 'M002',
    match_date: '2026-06-01',
    session_num: 1,
    created_at: '2026-06-01T18:00:00.000Z',
  },
  {
    id: 'latest-first',
    match_id_helldock: 'M003',
    match_date: '2026-06-02',
    session_num: 1,
    created_at: '2026-06-02T19:00:00.000Z',
  },
]

test('lastGames limits the scope to the newest visible matches', () => {
  const scope = resolveAnalyticsMatchScope(matches, '2')

  assert.equal(scope.lastGames, 2)
  assert.equal(scope.totalMatches, 4)
  assert.deepEqual(
    scope.matches.map((match) => match.id),
    ['latest-second', 'latest-first']
  )
})

test('invalid lastGames keeps the full newest-first scope', () => {
  const scope = resolveAnalyticsMatchScope(matches, 'nope')

  assert.equal(scope.lastGames, null)
  assert.equal(scope.totalMatches, 4)
  assert.deepEqual(
    scope.matches.map((match) => match.id),
    ['latest-second', 'latest-first', 'middle', 'older']
  )
})

