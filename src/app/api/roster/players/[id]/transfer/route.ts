import { NextResponse } from 'next/server'
import { logMutation } from '@/lib/audit'
import { getCurrentUserContext } from '@/lib/authz'
import { requireTeamWriteScope } from '@/lib/route-guard'
import { canWriteTeamFromContext, planRosterTransfer } from '@/lib/roster-transfer'

type TransferPayload = {
  target_team_id?: string
}

type TeamRow = {
  id: string
  slug: string
  name: string
  org_id: string | null
}

type PlayerRow = {
  id: string
  display_name: string
  team_id: string | null
  riot_name: string | null
  riot_tag: string | null
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const body = (await req.json()) as TransferPayload
  const targetTeamId = String(body.target_team_id ?? '').trim()
  if (!targetTeamId) {
    return NextResponse.json({ error: 'target_team_id required' }, { status: 400 })
  }
  if (targetTeamId === scope.teamId) {
    return NextResponse.json({ error: 'player is already on this team' }, { status: 400 })
  }

  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canWriteTeamFromContext(ctx, targetTeamId)) {
    return NextResponse.json(
      { error: 'Forbidden - coach role or higher required on target team' },
      { status: 403 }
    )
  }

  const { data: player } = await scope.supabase
    .from('players')
    .select('id, display_name, team_id, riot_name, riot_tag')
    .eq('id', params.id)
    .eq('team_id', scope.teamId)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'player not found' }, { status: 404 })

  const { data: teams } = await scope.supabase
    .from('teams')
    .select('id, slug, name, org_id')
    .in('id', [scope.teamId, targetTeamId])

  const byId = new Map(((teams ?? []) as TeamRow[]).map((team) => [team.id, team]))
  const sourceTeam = byId.get(scope.teamId)
  const targetTeam = byId.get(targetTeamId)
  if (!targetTeam || !sourceTeam) {
    return NextResponse.json({ error: 'target team not found' }, { status: 404 })
  }
  if (sourceTeam.org_id && targetTeam.org_id && sourceTeam.org_id !== targetTeam.org_id) {
    return NextResponse.json({ error: 'target team must be in the same org' }, { status: 400 })
  }

  let duplicateTargetPlayer: PlayerRow | null = null
  if (player.riot_name && player.riot_tag) {
    const { data: duplicate } = await scope.supabase
      .from('players')
      .select('id, display_name, team_id, riot_name, riot_tag')
      .eq('team_id', targetTeamId)
      .eq('riot_name', player.riot_name)
      .eq('riot_tag', player.riot_tag)
      .maybeSingle()
    duplicateTargetPlayer = duplicate as PlayerRow | null
  }

  const plan = planRosterTransfer({
    sourcePlayer: player as PlayerRow,
    targetTeamId,
    duplicateTargetPlayer,
  })

  if (plan.kind === 'merge') {
    const mergeError = await mergeDuplicateTargetPlayer(
      scope.supabase,
      plan.sourcePlayerId,
      plan.duplicatePlayerId
    )
    if (mergeError) return NextResponse.json({ error: mergeError }, { status: 400 })
  }

  const { error } = await scope.supabase
    .from('players')
    .update({ team_id: targetTeamId, is_active: true })
    .eq('id', params.id)
    .eq('team_id', scope.teamId)
  if (error) {
    const status = error.code === '23505' ? 409 : 400
    return NextResponse.json({ error: error.message }, { status })
  }

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'players',
    rowId: params.id,
    changes: {
      transfer: true,
      display_name: player.display_name,
      from_team_id: scope.teamId,
      from_team_slug: sourceTeam.slug,
      to_team_id: targetTeam.id,
      to_team_slug: targetTeam.slug,
      merged_duplicate_player_id: plan.kind === 'merge' ? plan.duplicatePlayerId : null,
    },
  })

  return NextResponse.json({
    ok: true,
    target_team: {
      id: targetTeam.id,
      slug: targetTeam.slug,
      name: targetTeam.name,
    },
  })
}

async function mergeDuplicateTargetPlayer(
  supabase: TeamScopeSupabase,
  sourcePlayerId: string,
  duplicatePlayerId: string
): Promise<string | null> {
  const referenceMoves = [
    supabase.from('player_accounts').update({ player_id: sourcePlayerId }).eq('player_id', duplicatePlayerId),
    supabase.from('match_players').update({ player_id: sourcePlayerId }).eq('player_id', duplicatePlayerId),
    supabase.from('round_player_stats').update({ player_id: sourcePlayerId }).eq('player_id', duplicatePlayerId),
  ] as const

  for (const move of referenceMoves) {
    const { error } = await move
    if (error) return error.message
  }

  const { error: deleteError } = await supabase
    .from('players')
    .delete()
    .eq('id', duplicatePlayerId)
  if (!deleteError) return null

  const { error } = await supabase
    .from('players')
    .update({
      riot_name: null,
      riot_tag: null,
      is_active: false,
      display_name: 'Merged duplicate',
    })
    .eq('id', duplicatePlayerId)
  return error?.message ?? null
}

type TeamScopeSupabase = Awaited<ReturnType<typeof requireTeamWriteScope>> extends NextResponse
  ? never
  : Exclude<Awaited<ReturnType<typeof requireTeamWriteScope>>, NextResponse>['supabase']
