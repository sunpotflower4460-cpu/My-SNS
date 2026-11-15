'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import EmptyState from '@/components/ui/EmptyState'
import { buttonClassName } from '@/components/ui/kit/Button'
import { useApp } from '@/lib/app/app-provider'
import { museDestinationPath, parseMuseDestination } from '@/lib/muse/links'

export default function MuseOpenPage() {
  const router = useRouter()
  const params = useSearchParams()
  const { currentWorkspace, workspaces, setActiveWorkspaceId } = useApp()
  const target = parseMuseDestination(params)
  const workspace = target && workspaces.find(({ id }) => id === target.workspaceId)
  const workspaceId = workspace?.id
  const destination = target && museDestinationPath(target)

  useEffect(() => {
    if (!workspaceId || !destination) return
    if (currentWorkspace?.id !== workspaceId) {
      setActiveWorkspaceId(workspaceId)
      return
    }
    router.replace(destination)
  }, [currentWorkspace?.id, destination, router, setActiveWorkspaceId, workspaceId])

  if (!workspace) {
    return (
      <EmptyState
        title="Muse のリンクを開けません"
        description="リンクが無効か、このアカウントでは対象のワークスペースにアクセスできません。"
        action={<Link className={buttonClassName({})} href="/app/dashboard">ホームへ戻る</Link>}
      />
    )
  }

  return <p role="status" className="py-10 text-center text-sm text-gray-600">{workspace.name} を開いています…</p>
}
