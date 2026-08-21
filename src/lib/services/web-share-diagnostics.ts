export type WebShareSupportState = 'supported' | 'unsupported' | 'unknown'
export type WebShareRecommendation = 'file-share' | 'text-share' | 'fallback'

export interface WebShareDiagnostics {
  secureContext: boolean
  shareSupported: boolean
  canShareSupported: boolean
  policyState: WebShareSupportState
  textShareState: WebShareSupportState
  fileShareState: WebShareSupportState
  userActivationSupported: boolean
  visibilityState: string
  userAgent: string
  recommendation: WebShareRecommendation
}

export interface WebShareFailure {
  code: 'abort' | 'not-allowed' | 'invalid-state' | 'invalid-data' | 'data-error' | 'unknown'
  message: string
}

const DIAGNOSTIC_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

export function chooseWebShareRecommendation(input: {
  secureContext: boolean
  shareSupported: boolean
  textShareState: WebShareSupportState
  fileShareState: WebShareSupportState
}): WebShareRecommendation {
  if (!input.secureContext || !input.shareSupported) return 'fallback'
  if (input.fileShareState === 'supported') return 'file-share'
  if (input.textShareState !== 'unsupported') return 'text-share'
  return 'fallback'
}

function readPolicyState(): WebShareSupportState {
  type PolicyApi = { allowsFeature?: (feature: string) => boolean }
  const policyDocument = document as Document & {
    permissionsPolicy?: PolicyApi
    featurePolicy?: PolicyApi
  }
  const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy
  if (!policy?.allowsFeature) return 'unknown'

  try {
    return policy.allowsFeature('web-share') ? 'supported' : 'unsupported'
  } catch {
    return 'unknown'
  }
}

export function createWebShareDiagnosticImage(): File {
  const binary = window.atob(DIAGNOSTIC_PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new File([bytes], 'my-sns-share-test.png', { type: 'image/png', lastModified: Date.now() })
}

export function detectWebShareDiagnostics(): WebShareDiagnostics {
  const secureContext = window.isSecureContext
  const shareSupported = typeof navigator.share === 'function'
  const canShareSupported = typeof navigator.canShare === 'function'
  const policyState = readPolicyState()

  let textShareState: WebShareSupportState = shareSupported ? 'unknown' : 'unsupported'
  let fileShareState: WebShareSupportState = shareSupported ? 'unknown' : 'unsupported'

  if (canShareSupported) {
    try {
      textShareState = navigator.canShare({ text: 'My-SNS 共有診断' }) ? 'supported' : 'unsupported'
    } catch {
      textShareState = 'unknown'
    }

    try {
      const diagnosticFile = createWebShareDiagnosticImage()
      fileShareState = navigator.canShare({ files: [diagnosticFile] }) ? 'supported' : 'unsupported'
    } catch {
      fileShareState = 'unknown'
    }
  }

  return {
    secureContext,
    shareSupported,
    canShareSupported,
    policyState,
    textShareState,
    fileShareState,
    userActivationSupported: typeof navigator.userActivation !== 'undefined',
    visibilityState: document.visibilityState,
    userAgent: navigator.userAgent,
    recommendation: chooseWebShareRecommendation({ secureContext, shareSupported, textShareState, fileShareState }),
  }
}

function errorName(cause: unknown): string {
  if (!cause || typeof cause !== 'object' || !('name' in cause)) return ''
  return String((cause as { name?: unknown }).name ?? '')
}

export function describeWebShareFailure(cause: unknown, hasFiles: boolean): WebShareFailure {
  switch (errorName(cause)) {
    case 'AbortError':
      return {
        code: 'abort',
        message: '共有がキャンセルされたか、利用できる共有先が見つかりませんでした。共有シートが表示された場合は、そのまま再試行できます。',
      }
    case 'NotAllowedError':
      return {
        code: 'not-allowed',
        message: '共有が許可されていないか、共有に必要なタップ操作の有効時間が切れました。もう一度ボタンを押し、改善しない場合は共有診断を確認してください。',
      }
    case 'InvalidStateError':
      return {
        code: 'invalid-state',
        message: '別の共有処理が進行中か、この画面が現在アクティブではありません。共有シートを閉じてMy-SNSへ戻り、もう一度お試しください。',
      }
    case 'TypeError':
      return {
        code: 'invalid-data',
        message: hasFiles
          ? 'この端末では、選択した画像・動画の形式または組み合わせを共有できません。素材の「開く・保存」とSNS投稿画面を使ってください。'
          : 'この端末では、この投稿文をWeb Shareで渡せません。投稿文コピーとSNS投稿画面を使ってください。',
      }
    case 'DataError':
      return {
        code: 'data-error',
        message: '共有先へのデータ受け渡し中にエラーが発生しました。もう一度試すか、素材の「開く・保存」とSNS投稿画面を使ってください。',
      }
    default:
      return {
        code: 'unknown',
        message: cause instanceof Error && cause.message
          ? cause.message
          : '共有シートを開けませんでした。共有診断を確認するか、従来の投稿ボタンをご利用ください。',
      }
  }
}
