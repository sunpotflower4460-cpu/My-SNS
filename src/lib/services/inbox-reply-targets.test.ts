import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { resolveContentSendTarget, resolveDmSendTarget } from './inbox-reply-targets'

// Minimal chainable stub covering exactly the .from(table).select(...).eq(...)
// .maybeSingle() shape resolveContentSendTarget/resolveDmSendTarget use — not
// a general Supabase mock. Queued per call to .from() (in call order).
function fakeSupabase(responses: Array<{ data: unknown; error: unknown }>): SupabaseClient {
  let call = 0
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => responses[call++] ?? { data: null, error: null },
  }
  return { from: () => chain } as unknown as SupabaseClient
}

describe('resolveContentSendTarget (Instagram/YouTube comment, X reply — no contact)', () => {
  it('resolves the inbox item externalId as the send target, scheduled immediately', async () => {
    const supabase = fakeSupabase([{ data: { id: 'account-1' }, error: null }])

    const result = await resolveContentSendTarget(supabase, 'workspace-1', 'instagram', 'comment-external-1')

    expect(result).not.toBeInstanceOf(Response)
    if ('sendTarget' in result) {
      expect(result.sendTarget).toBe('comment-external-1')
      expect(result.contactId).toBeUndefined()
      expect(new Date(result.scheduledAt).getTime()).not.toBeNaN()
    }
  })

  it('refuses (400) when the inbox item has no external content id to reply under', async () => {
    const supabase = fakeSupabase([{ data: { id: 'account-1' }, error: null }])

    const result = await resolveContentSendTarget(supabase, 'workspace-1', 'instagram', null)

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(400)
  })

  it('refuses (400) when no account is connected for the platform', async () => {
    const supabase = fakeSupabase([{ data: null, error: null }])

    const result = await resolveContentSendTarget(supabase, 'workspace-1', 'youtube', 'comment-1')

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(400)
    const body = await (result as Response).json()
    expect(body.error).toContain('YouTube')
  })

  it('fails closed (502, not a silent empty state) when the account lookup itself errors', async () => {
    const supabase = fakeSupabase([{ data: null, error: { message: 'db down' } }])

    const result = await resolveContentSendTarget(supabase, 'workspace-1', 'x', 'tweet-1')

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(502)
  })
})

describe('resolveDmSendTarget (LINE)', () => {
  it('refuses (400) with a platform-specific message when no account is connected', async () => {
    const supabase = fakeSupabase([{ data: null, error: null }])

    const result = await resolveDmSendTarget(supabase, 'workspace-1', 'line', 'contact-1', false)

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(400)
    const body = await (result as Response).json()
    expect(body.error).toContain('LINE')
  })

  it('refuses (400) when the inbox item has no linked contact', async () => {
    const supabase = fakeSupabase([{ data: { id: 'account-1' }, error: null }])

    const result = await resolveDmSendTarget(supabase, 'workspace-1', 'line', null, false)

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(400)
  })

  it('resolves the contact external id as the send target when sendNow is true (bypassing quiet hours)', async () => {
    const supabase = fakeSupabase([
      { data: { id: 'account-1' }, error: null },
      { data: { id: 'contact-1', external_contact_id: 'line-user-1', timezone: null, quiet_hours_start: null, quiet_hours_end: null }, error: null },
    ])

    const result = await resolveDmSendTarget(supabase, 'workspace-1', 'line', 'contact-1', true)

    expect(result).not.toBeInstanceOf(Response)
    if ('sendTarget' in result) {
      expect(result.sendTarget).toBe('line-user-1')
      expect(result.contactId).toBe('contact-1')
    }
  })
})
