import { NextResponse } from 'next/server'
import { requireTeamWriteScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

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
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

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

  const { error } = await scope.supabase
    .from('teams')
    .update({ discord_webhook_url: webhookUrl })
    .eq('id', scope.teamId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'teams',
    rowId: scope.teamId,
    changes: { discord_webhook_url: webhookUrl ? '(set)' : null },
  })

  return NextResponse.json({ ok: true, discord_webhook_url: webhookUrl })
}
