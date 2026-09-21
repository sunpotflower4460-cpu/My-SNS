import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The repoint behaviour lives in SQL (finalize_social_account_connection and
// guard_publish_job_update) and is verified against a real Postgres in a
// BEGIN ... ROLLBACK transaction. These contract checks pin the load-bearing
// clauses so a later migration that re-creates either function from an older
// copy (which 20260828153000 did to the fence logic) is noticed in review.
const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260829000000_repoint_jobs_on_reconnect.sql'),
  'utf8',
)

function functionBody(name: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(start).toBeGreaterThanOrEqual(0)
  return migration.slice(start, migration.indexOf('\n$$;', start))
}

describe('reconnect repoint migration', () => {
  it('repoints only non-terminal jobs from retired rows of the same identity', () => {
    const body = functionBody('finalize_social_account_connection')
    expect(body).toContain('UPDATE public.publish_jobs')
    expect(body).toMatch(/'draft'::public\.publish_job_status,\s+'scheduled'::public\.publish_job_status,\s+'failed'::public\.publish_job_status/)
    expect(body).not.toMatch(/'published'::public\.publish_job_status,|'cancelled'::public\.publish_job_status,/)
    expect(body).toContain('old_account.connected = FALSE')
    expect(body).toContain('old_account.external_account_id = v_account.external_account_id')
    // Repoint runs after the new row is connected, before the function returns.
    expect(body.indexOf('SET connected = TRUE')).toBeLessThan(body.indexOf('UPDATE public.publish_jobs'))
  })

  it('keeps social_account_id immutable except for the same-identity reconnect follow-up', () => {
    const body = functionBody('guard_publish_job_update')
    expect(body).toContain('NEW.social_account_id IS DISTINCT FROM OLD.social_account_id')
    expect(body).toContain('v_old_account.connected IS DISTINCT FROM FALSE')
    expect(body).toContain('v_new_account.connected IS DISTINCT FROM TRUE')
    expect(body).toContain('v_old_account.external_account_id = v_new_account.external_account_id')
    // The plain provenance list must no longer contain social_account_id.
    const provenance = body.slice(0, body.indexOf('reconnect follow-up'))
    expect(provenance).not.toContain('NEW.social_account_id IS DISTINCT FROM OLD.social_account_id')
  })

  it('preserves the external-call fence and unsafe-result markers in both guards', () => {
    const update = functionBody('guard_publish_job_update')
    for (const marker of ['PARTIAL_EXTERNAL_SUCCESS:%', 'EXTERNAL_RESULT_UNKNOWN:%', 'TIKTOK_PENDING:%', 'external_call_started_at', 'Publish Worker claims are service-managed']) {
      expect(update).toContain(marker)
    }
    const insert = functionBody('guard_publish_job_insert')
    for (const marker of ['PARTIAL_EXTERNAL_SUCCESS:%', 'EXTERNAL_RESULT_UNKNOWN:%', 'TIKTOK_PENDING:%', 'external_call_started_at IS NOT NULL', 'Publish job social account belongs to another workspace']) {
      expect(insert).toContain(marker)
    }
  })
})
