import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { LlmOutputError, isAiConfigured, runStructuredCompletion } from '@/lib/services/llm-provider'
import { describeAiFailure, getAiStatus } from '@/lib/services/llm-status'

export const maxDuration = 60

// The test spends real (tiny) money. A short per-user cooldown stops a stuck
// button or a script from hammering it; it is per server instance, which is
// enough for a guard rail on an owner/admin-only action.
const TEST_COOLDOWN_MS = 10_000
const lastTestAt = new Map<string, number>()

// One tiny real call to the configured provider, so the creator learns right
// away whether the key/model work. Costs a fraction of a cent; it is not tied
// to a Seed, so it is not written to the generation ledger.
export async function POST(request: NextRequest) {
  let body: { workspaceId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }
  if (!body.workspaceId) return NextResponse.json({ error: 'workspaceIdが必要です。' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })

  const membership = await requireWorkspaceMember(supabase, body.workspaceId, user.id, 'edit_settings', 'AIの接続テストを行う権限がありません。')
  if (isNextResponse(membership)) return membership

  const previous = lastTestAt.get(user.id) ?? 0
  if (Date.now() - previous < TEST_COOLDOWN_MS) {
    return NextResponse.json({ ok: false, error: '少し待ってから、もう一度テストしてください。' }, { status: 429 })
  }
  lastTestAt.set(user.id, Date.now())

  if (!isAiConfigured()) {
    return NextResponse.json({ error: 'AIのAPIキー（DEEPSEEK_API_KEY）が未設定です。' }, { status: 400 })
  }

  const startedAt = Date.now()
  try {
    const { output, usage } = await runStructuredCompletion({
      system: 'You are a connection test. Reply with the requested json only.',
      user: 'Return ok=true and a short Japanese greeting in "message".',
      toolName: 'connection_test',
      toolDescription: 'Report that the connection works.',
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
        required: ['ok', 'message'],
      },
      maxTokens: 100,
      timeoutMs: 30_000,
    })
    const reply = output as { ok?: unknown; message?: unknown }
    if (reply?.ok !== true) throw new LlmOutputError('The model did not confirm the test.', usage)

    return NextResponse.json({
      ok: true,
      provider: getAiStatus().provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs: Date.now() - startedAt,
    })
  } catch (cause) {
    console.error('AI connection test failed:', cause)
    return NextResponse.json({ ok: false, error: describeAiFailure(cause) }, { status: 502 })
  }
}
