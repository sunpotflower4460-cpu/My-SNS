import { configuredMonthlyAiBudgetUsd } from './ai-generation-claims'
import { LlmOutputError, envValue, resolveAiModel, resolveLlmProvider, type LlmProvider } from './llm-provider'

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
      rate(envValue(env.AI_INPUT_COST_PER_MTOK, env.ANTHROPIC_INPUT_COST_PER_MTOK)) &&
      rate(envValue(env.AI_OUTPUT_COST_PER_MTOK, env.ANTHROPIC_OUTPUT_COST_PER_MTOK)),
  }
}

/** Creator-facing wording for a failed provider call (raw text stays in server logs). */
export function describeAiFailure(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : ''
  const name = cause instanceof Error ? cause.name : ''
  if (/\((401|403)\)|authentication|invalid.*key|api key/i.test(message)) {
    return 'APIキーが正しくないか、無効です。キーを確認して、開発サーバーを再起動してください。'
  }
  if (/\(402\)|insufficient|balance/i.test(message)) {
    return 'APIの残高が不足しています。プロバイダの管理画面でチャージしてください。'
  }
  if (/\(429\)|rate limit/i.test(message)) {
    return 'APIの利用回数の上限に達しました。少し待ってからもう一度お試しください。'
  }
  if (name === 'TimeoutError' || /timeout|timed out|aborted/i.test(message)) {
    return 'AIからの応答が時間内に返りませんでした。通信状態を確認して、もう一度お試しください。'
  }
  if (/\((400|404|422)\)/.test(message)) {
    return 'AIへのリクエストが受け付けられませんでした。モデル名（DEEPSEEK_MODEL）と接続先（DEEPSEEK_BASE_URL）の設定を確認してください。'
  }
  if (/\((500|502|503|504)\)/.test(message)) {
    return 'AIのサービス側で一時的な問題が起きています。少し待ってからもう一度お試しください。'
  }
  if (cause instanceof LlmOutputError) {
    return 'AIには接続できましたが、使える形式の応答が返りませんでした。もう一度お試しください。続く場合はモデルを変えてみてください。'
  }
  return 'AIに接続できませんでした。キーとネットワークを確認してください。'
}
