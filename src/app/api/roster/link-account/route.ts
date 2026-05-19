import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type LinkPayload = {
  match_player_id: string
  target_player_id: string
  label?: string | null
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { match_player_id, target_player_id, label } = (await req.json()) as LinkPayload
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
  let accountId: string | null = null
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
          ?.display_name
        return NextResponse.json(
          { error: `Account ${riot_name}#${riot_tag} is already linked to ${owner ?? 'another player'}` },
          { status: 409 }
        )
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
          ?.display_name
        return NextResponse.json(
          { error: `This puuid is already linked to ${owner ?? 'another player'}` },
          { status: 409 }
        )
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

  // Backfill: relink every orphan match_players row that matches this account.
  // Two separate updates avoids fragile compound-OR filter encoding when
  // riot_name has spaces or unicode (e.g. "Scooby dooby doo", "Igawr#xuu许").
  const linkedIds = new Set<string>()

  if (riot_name && riot_tag) {
    const { data, error } = await supabase
      .from('match_players')
      .update({ player_id: target_player_id })
      .is('player_id', null)
      .eq('riot_name', riot_name)
      .eq('riot_tag', riot_tag)
      .select('id')
    if (error) {
      return NextResponse.json({ error: `Backfill (riot_id) failed: ${error.message}` }, { status: 500 })
    }
    for (const row of data ?? []) linkedIds.add(row.id)
  }

  if (puuid) {
    const { data, error } = await supabase
      .from('match_players')
      .update({ player_id: target_player_id })
      .is('player_id', null)
      .eq('puuid', puuid)
      .select('id')
    if (error) {
      return NextResponse.json({ error: `Backfill (puuid) failed: ${error.message}` }, { status: 500 })
    }
    for (const row of data ?? []) linkedIds.add(row.id)
  }

  return NextResponse.json({
    account_id: accountId,
    linked: linkedIds.size,
    target: target.display_name,
  })
}
