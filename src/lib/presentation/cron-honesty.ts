/**
 * Vercel Hobby allows at most one cron run per path per day. vercel.json
 * therefore uses daily schedules (`0 0/1/2 * * *` UTC), not the previous
 * 5-minute cadence. Copy that still says "5分" would tell the user a lie.
 */
export const PUBLISH_WORKER_BATCH_SIZE = 20

export const PUBLISH_WORKER_DELAY_JA =
  'WorkerはHobbyプラン制約で1日1回（1回最大20件）のため、予約時刻から最大約1日遅れることがあります。急ぎの場合は「今すぐ公開」を使ってください'

export const REPLY_WORKER_DELAY_JA =
  '送信WorkerはHobbyプラン制約で1日1回のため、予約した時刻の次の実行まで待つことがあります。すぐ送りたい場合は「今すぐ」を選んでください。'
