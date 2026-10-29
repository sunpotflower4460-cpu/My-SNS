import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { claimReplyJob } from './reply-worker'

function claimStub() {
  const calls: string[] = []
  const chain = {
    update: () => chain,
    eq: (field: string, value: unknown) => { calls.push(`eq:${field}:${value}`); return chain },
    is: (field: string, value: unknown) => { calls.push(`is:${field}:${value}`); return chain },
    or: (filter: string) => { calls.push(`or:${filter}`); return chain },
    select: () => chain,
    maybeSingle: async () => ({ data: { id: 'reply-1' }, error: null }),
  }
  return { calls, supabase: { from: () => chain } as unknown as SupabaseClient }
}

describe('reply worker claim safety', () => {
  it('never reclaims an abandoned public reply or retries a failed public send', async () => {
    const { calls, supabase } = claimStub()
    expect(await claimReplyJob(supabase, 'reply-1', 'instagram')).toBeTruthy()
    expect(calls).toContain('eq:status:scheduled')
    expect(calls).toContain('is:claimed_at:null')
    expect(calls.some((call) => call.startsWith('or:'))).toBe(false)
  })

  it('preserves the LINE retry-key window but excludes unknown-result failed jobs', async () => {
    const { calls, supabase } = claimStub()
    expect(await claimReplyJob(supabase, 'reply-1', 'line')).toBeTruthy()
    expect(calls).toContain('or:status.eq.scheduled,and(status.eq.failed,error_message.not.like.EXTERNAL_RESULT_UNKNOWN:%)')
    expect(calls.some((call) => call.startsWith('or:claimed_at.is.null'))).toBe(true)
  })
})
