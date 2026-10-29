import { formatBytes } from './input'

// The private Supabase Storage bucket rejects files above its configured limit
// (50 MiB by default, both in supabase/config.toml and on the hosted free tier)
// with an English storage error — after the Seed row already exists. Check first
// and say it in Japanese. Raise NEXT_PUBLIC_MAX_UPLOAD_MB together with the
// bucket's file_size_limit if the project allows larger files.
const DEFAULT_MAX_UPLOAD_MB = 50

export function getMaxUploadBytes(value = process.env.NEXT_PUBLIC_MAX_UPLOAD_MB): number {
  const megabytes = Number(value)
  return (Number.isFinite(megabytes) && megabytes > 0 ? megabytes : DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024
}

export interface UploadPartition {
  accepted: File[]
  tooLarge: File[]
}

export function partitionUploadFiles(files: File[], maxBytes = getMaxUploadBytes()): UploadPartition {
  const accepted: File[] = []
  const tooLarge: File[] = []
  for (const file of files) (file.size > maxBytes ? tooLarge : accepted).push(file)
  return { accepted, tooLarge }
}

export function describeTooLarge(files: File[], maxBytes = getMaxUploadBytes()): string {
  if (files.length === 0) return ''
  const names = files.slice(0, 3).map((file) => `「${file.name}」（${formatBytes(file.size)}）`).join('、')
  const more = files.length > 3 ? ` ほか${files.length - 3}件` : ''
  return `${names}${more}は大きすぎるため追加できません。1ファイル${formatBytes(maxBytes)}までです。動画は書き出し時に容量を下げるか、短く分けてからお試しください。`
}
