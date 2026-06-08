import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveAnalyticsTeamScope } from '../src/lib/analytics-team-scope'

const teams = [
  { id: 'scylla-id', slug: 'scylla', name: 'SOP Scylla' },
  { id: 'hydra-id', slug: 'hydra', name: 'SOP Hydra (Academy)' },
]

test('team=all combines every readable Helldock team', () => {
  const scope = resolveAnalyticsTeamScope({
    readableTeams: teams,
    selectedTeamSlug: 'scylla',
    requestedTeam: 'all',
  })

  assert.equal(scope.teamSlug, 'all')
  assert.deepEqual(scope.teamIds, ['scylla-id', 'hydra-id'])
})

test('specific requested team wins when the user can read it', () => {
  const scope = resolveAnalyticsTeamScope({
    readableTeams: teams,
    selectedTeamSlug: 'scylla',
    requestedTeam: 'hydra',
  })

  assert.equal(scope.teamSlug, 'hydra')
  assert.deepEqual(scope.teamIds, ['hydra-id'])
})

test('unknown requested team falls back to selected team', () => {
  const scope = resolveAnalyticsTeamScope({
    readableTeams: teams,
    selectedTeamSlug: 'scylla',
    requestedTeam: 'unknown',
  })

  assert.equal(scope.teamSlug, 'scylla')
  assert.deepEqual(scope.teamIds, ['scylla-id'])
})
