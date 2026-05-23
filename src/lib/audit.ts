import { createAdminClient } from './supabase/admin'

/**
 * Mutation audit logger. Writes to the audit_log table via service-role
 * (bypassing RLS, since the application can't read or insert from this table
 * directly). Failures are swallowed so a missing audit row never causes a
 * user-facing 500 — we still log to console as a backup signal.
 */
export async function logMutation(meta: {
  userId: string
  teamId: string
  action: 'insert' | 'update' | 'delete'
  table: string
  rowId: string
  changes?: Record<string, unknown>
}): Promise<void> {
  // Console signal — Vercel logs are still useful when DB writes fail.
  console.info(JSON.stringify({
    type: 'audit',
    at: new Date().toISOString(),
    ...meta,
  }))

  try {
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      user_id: meta.userId,
      team_id: meta.teamId,
      action: meta.action,
      table_name: meta.table,
      row_id: meta.rowId,
      changes: meta.changes ?? null,
    })
  } catch (err) {
    // Don't propagate — audit failure should not break the mutation.
    console.warn('[audit] DB insert failed:', err instanceof Error ? err.message : err)
  }
}
