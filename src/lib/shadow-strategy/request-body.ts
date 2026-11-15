import { readJsonBodyWithLimit as readJson } from '@/lib/api/read-json'
import { SHADOW_STRATEGY_IMPORT_MAX_BYTES } from './constants'

export function readJsonBodyWithLimit(request: Request, maxBytes = SHADOW_STRATEGY_IMPORT_MAX_BYTES) {
  return readJson(request, maxBytes)
}
