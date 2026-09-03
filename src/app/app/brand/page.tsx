'use client'

import { useEffect, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import PermissionGate from '@/components/ui/PermissionGate'
import { Button, Card, InlineAlert } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { normalizeBrandList, validateBrandProfile } from '@/lib/presentation/brand-presenter'

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity/updatedAt only
  }, [defaultBrandProfile?.id, defaultBrandProfile?.updatedAt])

  const handleSave = async () => {
    const validation = validateBrandProfile({ name, language })
    if (!validation.ok) {
      setError(validation.error)
      setFeedback('')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await saveDefaultBrandProfile({
        name,
        description,
        audience,
        voiceTraits: normalizeBrandList(voiceTraits),
        values: normalizeBrandList(values),
        preferredTerms: normalizeBrandList(preferredTerms),
        avoidedTerms: normalizeBrandList(avoidedTerms),
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

      {feedback && <div className="mb-5"><InlineAlert tone="success">{feedback}</InlineAlert></div>}
      {error && <div className="mb-5"><InlineAlert tone="error">{error}</InlineAlert></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <section className="space-y-6">
          <Card size="container" padded>
            <div className="mb-5">
              <p className="text-xs font-semibold text-violet-500">基本情報</p>
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
          </Card>

          <Card size="container" padded>
            <div className="mb-5">
              <p className="text-xs font-semibold text-violet-500">表現の境界線</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">あなたの代わりに言ってよいこと・言ってはいけないことは？</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">使いたい表現・言い回し</label><textarea value={preferredTerms} onChange={(event) => setPreferredTerms(event.target.value)} rows={6} placeholder="1行につき1つ" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">避けたい表現</label><textarea value={avoidedTerms} onChange={(event) => setAvoidedTerms(event.target.value)} rows={6} placeholder={'1行につき1つ\n保証します\nバズる\n#fyp'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium text-gray-700">デフォルトのCTA</label><textarea value={defaultCallToAction} onChange={(event) => setDefaultCallToAction(event.target.value)} rows={4} placeholder="やさしく繰り返し使えるCTA。個別のシードで上書きできます。" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
            </div>
          </Card>

          <PermissionGate requiredPermission="edit_brand_profile" currentRole={currentMember?.role ?? 'viewer'}>
            <Button variant="primary" onClick={() => void handleSave()} loading={isSaving}>ブランドプロフィールを保存</Button>
          </PermissionGate>
        </section>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card size="container" tone="selected">
            <p className="text-xs font-semibold text-violet-500">なぜ分けているのか</p>
            <p className="mt-3 text-sm leading-6 text-violet-900">シードは1つのアイデアにおける事実を保存します。このプロフィールは、あらゆるアイデアや媒体を通じて変わらないあなたの声を保存します。</p>
          </Card>
          <Card size="container" padded>
            <h2 className="text-base font-semibold text-gray-900">この設定について</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-500">
              <li>• ワークスペースごとに保存されます</li>
              <li>• すべてのシードで、コピーせずそのまま再利用されます</li>
              <li>• AIの下書き・返信提案の口調や表現の境界線として使われます</li>
              <li>• AIはここで示した「避けたい表現」を尊重し、推測した箇所は承認前に明示します</li>
              <li>• 下書きスタジオで直して承認した内容は Brand Profile を上書きせず、同じ媒体の次回提案の参考例になります</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  )
}
