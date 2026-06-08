import assert from 'node:assert/strict'
import test from 'node:test'

import { getRosterTransferTargets, planRosterTransfer } from '../src/lib/roster-transfer'
import type { UserContext } from '../src/lib/authz'

const baseCtx: UserContext = {
  userId: 'user-1',
  email: 'coach@example.com',
  isPlatformAdmin: false,
  memberships: [
    {
      orgId: 'org-1',
      orgSlug: 'sop',
      orgName: 'SOP',
      orgRole: 'viewer',
      suspended: false,
      teams: [
        {
          teamId: 'scylla-id',
          teamSlug: 'scylla',
          teamName: 'SOP Scylla',
          teamRole: 'coach',
          playerId: null,
        },
        {
          teamId: 'hydra-id',
          teamSlug: 'hydra',
          teamName: 'SOP Hydra (Academy)',
          teamRole: 'coach',
          playerId: null,
        },
        {
          teamId: 'viewer-id',
          teamSlug: 'viewer-team',
          teamName: 'Viewer Team',
          teamRole: 'viewer',
          playerId: null,
        },
      ],
    },
    {
      orgId: 'org-2',
      orgSlug: 'other',
      orgName: 'Other Org',
      orgRole: 'viewer',
      suspended: false,
      teams: [
        {
          teamId: 'other-id',
          teamSlug: 'other-main',
          teamName: 'Other Main',
          teamRole: 'coach',
          playerId: null,
        },
      ],
    },
  ],
}

test('returns other writable teams as roster transfer targets', () => {
  const targets = getRosterTransferTargets(baseCtx, 'hydra-id')

  assert.deepEqual(targets, [
    { id: 'scylla-id', slug: 'scylla', name: 'SOP Scylla' },
  ])
})

test('excludes the current team and read-only teams', () => {
  const targets = getRosterTransferTargets(baseCtx, 'scylla-id')

  assert.deepEqual(targets, [
    { id: 'hydra-id', slug: 'hydra', name: 'SOP Hydra (Academy)' },
  ])
})

test('excludes writable teams from another org', () => {
  const targets = getRosterTransferTargets(baseCtx, 'hydra-id')

  assert.deepEqual(
    targets.map((team) => team.id),
    ['scylla-id']
  )
})

test('platform admins can transfer to any known team except the current team', () => {
  const targets = getRosterTransferTargets(
    { ...baseCtx, isPlatformAdmin: true, memberships: [] },
    'scylla-id',
    [
      { id: 'scylla-id', slug: 'scylla', name: 'SOP Scylla' },
      { id: 'hydra-id', slug: 'hydra', name: 'SOP Hydra (Academy)' },
    ]
  )

  assert.deepEqual(targets, [
    { id: 'hydra-id', slug: 'hydra', name: 'SOP Hydra (Academy)' },
  ])
})

test('plans a merge when target team already has the same Riot ID', () => {
  const plan = planRosterTransfer({
    sourcePlayer: {
      id: 'hydra-ark',
      team_id: 'hydra-id',
      riot_name: 'Ark',
      riot_tag: 'VCSA',
    },
    targetTeamId: 'scylla-id',
    duplicateTargetPlayer: {
      id: 'scylla-ark',
      team_id: 'scylla-id',
      riot_name: 'Ark',
      riot_tag: 'VCSA',
    },
  })

  assert.deepEqual(plan, {
    kind: 'merge',
    sourcePlayerId: 'hydra-ark',
    duplicatePlayerId: 'scylla-ark',
    targetTeamId: 'scylla-id',
  })
})

test('plans a direct move when target team has no duplicate Riot ID', () => {
  const plan = planRosterTransfer({
    sourcePlayer: {
      id: 'hydra-trippie',
      team_id: 'hydra-id',
      riot_name: 'Trippie',
      riot_tag: '0114',
    },
    targetTeamId: 'scylla-id',
    duplicateTargetPlayer: null,
  })

  assert.deepEqual(plan, {
    kind: 'move',
    sourcePlayerId: 'hydra-trippie',
    targetTeamId: 'scylla-id',
  })
})
