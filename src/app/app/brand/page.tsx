'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import PermissionGate from '@/components/ui/PermissionGate'
import { useApp } from '@/lib/app/app-provider'

function normalizeList(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean)))
}

export default function BrandProfilePage() {
  const { currentMember, currentWorkspace, defaultBrandProfile, saveDefaultBrandProfile } = useApp()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState('')
  const [voiceTraits, setVoiceTraits] = useState('')
  const [values, setValues] = useState('')
  const [preferredTerms, setPreferredTerms] = useState('')
  const [avoidedTerms, setAvoidedTerms] = useState('')
  const [defaultCallToAction, setDefaultCallToAction] = useState('')
  const [language, setLanguage] = useState('ja')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!defaultBrandProfile) return
    setName(defaultBrandProfile.name)
    setDescription(defaultBrandProfile.description ?? '')
    setAudience(defaultBrandProfile.audience ?? '')
    setVoiceTraits(defaultBrandProfile.voiceTraits.join(', '))
    setValues(defaultBrandProfile.values.join('\n'))
    setPreferredTerms(defaultBrandProfile.preferredTerms.join('\n'))
    setAvoidedTerms(defaultBrandProfile.avoidedTerms.join('\n'))
    setDefaultCallToAction(defaultBrandProfile.defaultCallToAction ?? '')
    setLanguage(defaultBrandProfile.language)
  }, [defaultBrandProfile])

  const handleSave = async () => {
    if (!name.trim()) {
      setError('ブランドプロフィール名を入力してください。')
      return
    }
    if (!language.trim()) {
      setError('AI提案に使う言語を入力してください。')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await saveDefaultBrandProfile({
        name,
        description,
        audience,
        voiceTraits: normalizeList(voiceTraits),
        values: normalizeList(values),
        preferredTerms: normalizeList(preferredTerms),
        avoidedTerms: normalizeList(avoidedTerms),
        defaultCallToAction,
        language,
      })
      setFeedback('ブランドプロフィールを保存しました。新しいシードも既存のシードも、この内容をコピーせずそのまま再利用できます。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ブランドプロフィールを保存できませんでした。')
      setFeedback('')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="ブランドプロフィール"
        description={`${currentWorkspace?.name ?? 'このワークスペース'}で繰り返し使える、声のトーン・想定読者・表現の境界線です。`}
      />

      {(feedback || error) && <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>{error || feedback}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-5">
              <p className="text-xs font-semibold tracking-[0.05em] text-violet-500">基本情報</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">いつも変わらず伝わってほしいことは？</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">プロフィール名</label><input value={name} onChange={(event) => setName(event.target.value)} placeholder="そら / メイン発信アカウントの声" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">主な言語</label><input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="ja" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium text-gray-700">発信する目的・世界観</label><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} placeholder="なぜ発信するのか、どんな気持ちを届けたいか、ありきたりなマーケティング表現に置き換えてほしくないことなど…" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">主な読者・視聴者</label><textarea value={audience} onChange={(event) => setAudience(event.target.value)} rows={4} placeholder="誰に向けて発信しているか" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">口調の特徴</label><textarea value={voiceTraits} onChange={(event) => setVoiceTraits(event.target.value)} rows={4} placeholder="温かい、正直、落ち着いている、具体的 など" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium text-gray-700">大切にしていること</label><textarea value={values} onChange={(event) => setValues(event.target.value)} rows={5} placeholder={'1行につき1つ\n誇張より誠実さを\n元の文脈を尊重する'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-5">
              <p className="text-xs font-semibold tracking-[0.05em] text-violet-500">表現の境界線</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">あなたの代わりに言ってよいこと・言ってはいけないことは？</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">使いたい表現・言い回し</label><textarea value={preferredTerms} onChange={(event) => setPreferredTerms(event.target.value)} rows={6} placeholder="1行につき1つ" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">避けたい表現</label><textarea value={avoidedTerms} onChange={(event) => setAvoidedTerms(event.target.value)} rows={6} placeholder={'1行につき1つ\n保証します\nバズる\n#fyp'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium text-gray-700">デフォルトのCTA</label><textarea value={defaultCallToAction} onChange={(event) => setDefaultCallToAction(event.target.value)} rows={4} placeholder="やさしく繰り返し使えるCTA。個別のシードで上書きできます。" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
            </div>
          </div>

          <PermissionGate requiredPermission="edit_brand_profile" currentRole={currentMember?.role ?? 'viewer'}>
            <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60">{isSaving ? '保存中…' : 'ブランドプロフィールを保存'}</button>
          </PermissionGate>
        </section>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[2rem] border border-violet-100 bg-violet-50 p-6">
            <p className="text-xs font-semibold tracking-[0.05em] text-violet-500">なぜ分けているのか</p>
            <p className="mt-3 text-sm leading-6 text-violet-900">シードは1つのアイデアにおける事実を保存します。このプロフィールは、あらゆるアイデアや媒体を通じて変わらないあなたの声を保存します。</p>
          </div>
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="text-base font-semibold text-gray-900">PR1の範囲</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-500">
              <li>• ワークスペースごとに保存</li>
              <li>• すべてのシードで再利用</li>
              <li>• まだAI呼び出しなし</li>
              <li>• OAuthやSNSアカウント連携なし</li>
              <li>• 提案の承認はPR2で対応</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
