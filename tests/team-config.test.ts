import assert from 'node:assert/strict'
import test from 'node:test'

import { TEAM_CONFIGS } from '../src/lib/teams'

test('Scylla imports from Igawr as the side anchor', () => {
  assert.equal(TEAM_CONFIGS.scylla.mainAccount.name, 'Igawr')
  assert.equal(TEAM_CONFIGS.scylla.mainAccount.tag, 'xuu\u8bb8')
})
