import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'

const VALID_WEBHOOK_PREFIXES = [
  'https://discord.com/api/webhooks/',
  'https://discordapp.com/api/webhooks/',
  'https://ptb.discord.com/api/webhooks/',
  'https://canary.discord.com/api/webhooks/',
]

function isValidDiscordWebhook(url: string): boolean {
  return VALID_WEBHOOK_PREFIXES.some((p) => url.startsWith(p))
}

export async function PATCH(req: Request) {
  const { teamId } = await requireSelectedTeam()
  const body = (await req.json().catch(() => null)) as { url?: string | null } | null
  if (!body || (body.url !== null && typeof body.url !== 'string')) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  let webhookUrl: string | null = null
  if (body.url != null) {
    const trimmed = body.url.trim()
    if (trimmed.length === 0) {
      webhookUrl = null
    } else if (!isValidDiscordWebhook(trimmed)) {
      return NextResponse.json(
        { error: 'Not a Discord webhook URL — must start with https://discord.com/api/webhooks/' },
        { status: 400 }
      )
    } else {
      webhookUrl = trimmed
    }
  }

  const supabase = createClient()
  const { error } = await supabase
    .from('teams')
    .update({ discord_webhook_url: webhookUrl })
    .eq('id', teamId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, discord_webhook_url: webhookUrl })
}
