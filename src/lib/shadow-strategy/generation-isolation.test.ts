import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function read(relativePath: string): string {
  return readFileSync(path.resolve(ROOT, relativePath), 'utf8')
}

const GENERATION_FILES = [
  'src/lib/app/app-provider.tsx',
  'src/app/api/drafts/generate/route.ts',
  'src/lib/services/anthropic-draft.ts',
  'src/lib/services/ai-draft.ts',
  'src/lib/services/interfaces.ts',
]

const FORBIDDEN = [
  'shadow-strategy',
  'ShadowGrowthStrategy',
  'GrowthStrategy',
  'strategyId',
  'overallScore',
  'inputsDigest',
]

describe('generation isolation', () => {
  it('does not pass Shadow Strategy into draft generation, prompts, or AppProvider', () => {
    for (const file of GENERATION_FILES) {
      const source = read(file)
      for (const token of FORBIDDEN) {
        expect(source, `${file} must not mention ${token}`).not.toContain(token)
      }
    }
  })

  it('keeps AppProvider free of shadow strategy state', () => {
    const source = read('src/lib/app/app-provider.tsx')
    expect(source).not.toContain('shadowStrategy')
    expect(source).not.toContain('view_shadow_strategy')
    expect(source).not.toContain('/api/internal/shadow-strategy')
  })

  it('does not add SNS-Growth-Bridge as a My-SNS dependency', () => {
    const pkg = read('package.json')
    const lock = read('package-lock.json')
    expect(pkg).not.toMatch(/sns-growth-bridge|SNS-Growth-Bridge/)
    expect(lock).not.toMatch(/sns-growth-bridge|SNS-Growth-Bridge/)
  })
})
