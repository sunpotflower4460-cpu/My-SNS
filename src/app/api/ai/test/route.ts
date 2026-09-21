import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { LlmOutputError, isAiConfigured, runStructuredCompletion } from '@/lib/services/llm-provider'
import { describeAiFailure, getAiStatus } from '@/lib/services/llm-status'

export const maxDuration = 60

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
