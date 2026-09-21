import { configuredMonthlyAiBudgetUsd } from './ai-generation-claims'
import { resolveAiModel, resolveLlmProvider, type LlmProvider } from './llm-provider'

// Server-only. What the Settings screen shows about AI: which provider is
// active, the model, and whether spend limits/rates are set. Never the key.

export interface AiStatus {
  configured: boolean
  provider: LlmProvider | null
  model: string | null
  monthlyBudgetUsd: number | null
  /** True when cost rates are set, so the monthly budget can actually trip. */
  costRatesConfigured: boolean
}

export function getAiStatus(env: Record<string, string | undefined> = process.env): AiStatus {
  const provider = resolveLlmProvider(env)
  const rate = (value: string | undefined) => Number(value) > 0
  return {
    configured: provider !== null,
    provider,
    model: provider ? resolveAiModel(env, provider) : null,
    monthlyBudgetUsd: configuredMonthlyAiBudgetUsd(),
    costRatesConfigured:
      rate(env.AI_INPUT_COST_PER_MTOK ?? env.ANTHROPIC_INPUT_COST_PER_MTOK) &&
      rate(env.AI_OUTPUT_COST_PER_MTOK ?? env.ANTHROPIC_OUTPUT_COST_PER_MTOK),
  }
}

/** Creator-facing wording for a failed provider call (raw text stays in server logs). */
export function describeAiFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : ''
  if (/\((401|403)\)|authentication|invalid.*key|api key/i.test(message)) {
    return 'APIキーが正しくないか、無効です。キーを確認して、開発サーバーを再起動してください。'
  }
  if (/\(402\)|insufficient|balance/i.test(message)) {
    return 'APIの残高が不足しています。プロバイダの管理画面でチャージしてください。'
  }
  if (/\(429\)|rate limit/i.test(message)) {
    return 'APIの利用回数の上限に達しました。少し待ってからもう一度お試しください。'
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return 'AIからの応答が時間内に返りませんでした。通信状態を確認して、もう一度お試しください。'
  }
  if (/model/i.test(message) && /(400|404)/.test(message)) {
    return 'モデル名が正しくない可能性があります（DEEPSEEK_MODEL を確認してください）。'
  }
  return 'AIに接続できませんでした。キーとネットワークを確認してください。'
}
