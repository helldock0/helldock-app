import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type LinkPayload = {
  match_player_id: string
  target_player_id: string
  label?: string | null
  /** Allow moving the Riot ID from a different player to target. UI sets this when
   *  the user is re-linking an already-attributed row. */
  allow_reassign?: boolean
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { match_player_id, target_player_id, label, allow_reassign } =
    (await req.json()) as LinkPayload
  if (!match_player_id || !target_player_id) {
    return NextResponse.json({ error: 'match_player_id and target_player_id required' }, { status: 400 })
  }

  const { data: source } = await supabase
    .from('match_players')
    .select('id, player_id, riot_name, riot_tag, puuid')
    .eq('id', match_player_id)
    .single()
  if (!source) return NextResponse.json({ error: 'match_player not found' }, { status: 404 })

  const { riot_name, riot_tag, puuid } = source
  if (!riot_name && !puuid) {
    return NextResponse.json(
      {
        error:
          'This row has no riot id or puuid stored — cannot identify which account to link. Re-import the match to backfill.',
      },
      { status: 400 }
    )
  }

  // Make sure the target player exists.
  const { data: target } = await supabase
    .from('players')
    .select('id, display_name')
    .eq('id', target_player_id)
    .single()
  if (!target) return NextResponse.json({ error: 'target player not found' }, { status: 404 })

  // Upsert player_accounts row. Conflict on (riot_name, riot_tag) and/or puuid.
  // If allow_reassign is true, an existing link to a different player is moved
  // to target instead of rejected.
  let accountId: string | null = null
  let reassignedFrom: string | null = null

  if (riot_name && riot_tag) {
    const { data: existing } = await supabase
      .from('player_accounts')
      .select('id, player_id, players(display_name)')
      .eq('riot_name', riot_name)
      .eq('riot_tag', riot_tag)
      .maybeSingle()
    if (existing) {
      if (existing.player_id !== target_player_id) {
        const owner = (existing as { players?: { display_name?: string } | null }).players
          ?.display_name ?? 'another player'
        if (!allow_reassign) {
          return NextResponse.json(
            { error: `Account ${riot_name}#${riot_tag} is already linked to ${owner}` },
            { status: 409 }
          )
        }
        await supabase
          .from('player_accounts')
          .update({ player_id: target_player_id })
          .eq('id', existing.id)
        reassignedFrom = owner
      }
      accountId = existing.id
    }
  }

  if (!accountId && puuid) {
    const { data: existingByPuuid } = await supabase
      .from('player_accounts')
      .select('id, player_id, players(display_name)')
      .eq('puuid', puuid)
      .maybeSingle()
    if (existingByPuuid) {
      if (existingByPuuid.player_id !== target_player_id) {
        const owner = (existingByPuuid as { players?: { display_name?: string } | null }).players
          ?.display_name ?? 'another player'
        if (!allow_reassign) {
          return NextResponse.json(
            { error: `This puuid is already linked to ${owner}` },
            { status: 409 }
          )
        }
        await supabase
          .from('player_accounts')
          .update({ player_id: target_player_id })
          .eq('id', existingByPuuid.id)
        reassignedFrom = owner
      }
      accountId = existingByPuuid.id
    }
  }

  if (!accountId) {
    if (!riot_name || !riot_tag) {
      return NextResponse.json(
        { error: 'puuid present but no riot id — re-import the match to capture the riot id' },
        { status: 400 }
      )
    }
    const { data: created, error } = await supabase
      .from('player_accounts')
      .insert({
        player_id: target_player_id,
        riot_name,
        riot_tag,
        puuid: puuid ?? null,
        is_primary: false,
        label: label ?? 'alt',
      })
      .select('id')
      .single()
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 400 })
    }
    accountId = created.id
  } else if (puuid) {
    // Account existed but maybe didn't have puuid yet — fill it in.
    await supabase
      .from('player_accounts')
      .update({ puuid })
      .eq('id', accountId)
      .is('puuid', null)
  }

  // Backfill: relink every match_players row that matches this account.
  // When allow_reassign is true, we move rows away from any current player_id;
  // otherwise we only fill orphans (player_id IS NULL) — preserves the safe
  // default for the historical "link an unknown row" flow.
  const linkedIds = new Set<string>()

  async function applyUpdate(
    column: 'riot' | 'puuid'
  ): Promise<{ error?: string }> {
    let q = supabase
      .from('match_players')
      .update({ player_id: target_player_id })
    if (column === 'riot') {
      if (!riot_name || !riot_tag) return {}
      q = q.eq('riot_name', riot_name).eq('riot_tag', riot_tag)
    } else {
      if (!puuid) return {}
      q = q.eq('puuid', puuid)
    }
    // When not reassigning we only touch orphans (safe default). When the user
    // explicitly chose a different target from the match-detail UI, we move all
    // rows for this Riot ID — including ones that point to other players — over
    // to the new target.
    if (!allow_reassign) q = q.is('player_id', null)
    const { data, error } = await q.select('id')
    if (error) return { error: error.message }
    for (const row of data ?? []) linkedIds.add(row.id)
    return {}
  }

  for (const col of ['riot', 'puuid'] as const) {
    const r = await applyUpdate(col)
    if (r.error) {
      return NextResponse.json({ error: `Backfill (${col}) failed: ${r.error}` }, { status: 500 })
    }
  }

  return NextResponse.json({
    account_id: accountId,
    linked: linkedIds.size,
    target: target.display_name,
    reassigned_from: reassignedFrom,
  })
}
