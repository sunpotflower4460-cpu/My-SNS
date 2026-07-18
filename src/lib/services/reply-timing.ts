// Recipient-appropriate send timing for outbound DM replies.
//
// The product promise: even if the creator approves a reply at 3am, it should
// go out at a time that suits the *recipient* — never in the middle of their
// night. This pure function turns "approved now" into an absolute UTC instant:
// during the recipient's waking hours it returns now (send promptly); during
// their quiet hours it returns the next quiet-hours-end boundary in their
// timezone. The creator can always override to "send now" — that path skips
// this function entirely (see the approve route).
//
// The result is an absolute UTC ISO string, baked into reply_jobs.scheduled_at
// at enqueue, so the reply Worker stays completely timezone-agnostic — exactly
// like publish_jobs.scheduled_at.

export const DEFAULT_TIMEZONE = 'Asia/Tokyo'
export const DEFAULT_QUIET_START = 22 // 22:00 local
export const DEFAULT_QUIET_END = 8 // 08:00 local

interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** The wall-clock date/time an instant reads as in a given IANA timezone. */
function getLocalParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant)

  const map: Record<string, string> = {}
  for (const part of parts) map[part.type] = part.value

  // Some engines render midnight as hour '24' rather than '00'.
  let hour = Number(map.hour)
  if (hour === 24) hour = 0

  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), hour, minute: Number(map.minute) }
}

/** Offset (ms) between `timeZone` and UTC at the given instant: localWallAsUtc - instant. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const p = getLocalParts(instant, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0)
  return asUtc - instant.getTime()
}

/**
 * The absolute UTC instant of a wall-clock time in `timeZone`. Uses one offset
 * correction pass — exact for fixed-offset zones (Asia/Tokyo has no DST) and
 * correct for DST zones except in the ~1h/year fold/gap around a transition,
 * which is immaterial for "send at 8am" scheduling.
 */
function zonedWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  const offset = timeZoneOffsetMs(new Date(naiveUtc), timeZone)
  return new Date(naiveUtc - offset)
}

/** Whether `hour` falls inside the [start, end) quiet window, which may wrap midnight (start > end). */
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false // empty window → never quiet
  if (start < end) return hour >= start && hour < end
  return hour >= start || hour < end // wraps midnight (e.g. 22 → 8)
}

export interface RecipientTimingOptions {
  timeZone?: string
  quietStart?: number
  quietEnd?: number
}

/**
 * The UTC instant at which a reply approved at `now` should actually be sent,
 * given the recipient's timezone and quiet hours. Waking hours → `now`. Quiet
 * hours → the next `quietEnd` boundary in the recipient's timezone.
 */
export function computeRecipientSendTime(now: Date, options: RecipientTimingOptions = {}): string {
  const timeZone = options.timeZone || DEFAULT_TIMEZONE
  const quietStart = options.quietStart ?? DEFAULT_QUIET_START
  const quietEnd = options.quietEnd ?? DEFAULT_QUIET_END

  const local = getLocalParts(now, timeZone)
  if (!isQuietHour(local.hour, quietStart, quietEnd)) {
    return now.toISOString() // waking hours → send promptly
  }

  // In quiet hours: target the next quietEnd boundary in the recipient's tz.
  let { year, month, day } = local

  // Only the late-night side of a midnight-wrapping window (hour >= quietStart)
  // rolls the boundary to tomorrow; the early-morning side (hour < quietEnd)
  // and any non-wrapping window resolve to quietEnd on the same local day.
  const wrapsMidnight = quietStart > quietEnd
  if (wrapsMidnight && local.hour >= quietStart) {
    const next = new Date(Date.UTC(year, month - 1, day))
    next.setUTCDate(next.getUTCDate() + 1)
    year = next.getUTCFullYear()
    month = next.getUTCMonth() + 1
    day = next.getUTCDate()
  }

  return zonedWallTimeToUtc(year, month, day, quietEnd, 0, timeZone).toISOString()
}
