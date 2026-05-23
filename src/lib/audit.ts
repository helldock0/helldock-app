/**
 * Phase 1 mutation audit logger — writes to console.info / Vercel logs.
 * Phase 2 will swap this for an audit_log table insert.
 */
export function logMutation(meta: {
  userId: string
  teamId: string
  action: 'insert' | 'update' | 'delete'
  table: string
  rowId: string
  changes?: Record<string, unknown>
}): void {
  console.info(JSON.stringify({
    type: 'audit',
    at: new Date().toISOString(),
    ...meta,
  }))
}
