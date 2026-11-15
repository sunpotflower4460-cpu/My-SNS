import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { InlineAlert } from '@/components/ui/kit'
import { museAuthorizationPath, museCallback, parseMuseAuthorization } from '@/lib/muse/oauth-params'
import { createClient } from '@/lib/supabase/server'
import { MuseApprovalForm } from './approval-form'

export const metadata: Metadata = { title: 'Muse との接続を承認', robots: { index: false } }

function ApprovalPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-8 sm:items-center sm:p-8">
      <div className="w-full max-w-md rounded-container border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><Sparkles aria-hidden className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-medium text-violet-700">My-SNS</p>
            <h1 className="text-xl font-semibold text-gray-900">Muse との接続を承認</h1>
          </div>
        </div>
        {children}
      </div>
    </main>
  )
}

export default async function MuseConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry)
  }
  const authorization = parseMuseAuthorization(params)
  if (!authorization) {
    return <ApprovalPage><InlineAlert tone="error">Muse のチャットから接続を開始し、Muse が表示したリンクを開いてください。</InlineAlert></ApprovalPage>
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const path = museAuthorizationPath(authorization)
  if (!user) redirect(`/login?${new URLSearchParams({ next: path })}`)

  const { data, error } = await supabase.from('workspace_members')
    .select('workspace_id, workspace:workspaces(name)')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
  const cancelUrl = museCallback(authorization, { error: 'access_denied' })
  const workspaces = (data ?? []).flatMap((membership) => {
    const workspace = Array.isArray(membership.workspace) ? membership.workspace[0] : membership.workspace
    return workspace ? [{ id: membership.workspace_id, name: workspace.name }] : []
  })

  return (
    <ApprovalPage>
      {error ? (
        <InlineAlert tone="error">ワークスペースを取得できませんでした。ページを再読み込みしてください。</InlineAlert>
      ) : workspaces.length ? (
        <MuseApprovalForm
          authorizationPath={path}
          allowCapture={authorization.canCapture}
          cancelUrl={cancelUrl}
          workspaces={workspaces}
        />
      ) : (
        <div className="space-y-4">
          <InlineAlert tone="error">接続するワークスペースのオーナーまたは管理者のアカウントでログインしてください。</InlineAlert>
          <a className="text-sm font-medium text-violet-700 underline" href={cancelUrl}>Muse に戻る</a>
        </div>
      )}
    </ApprovalPage>
  )
}
