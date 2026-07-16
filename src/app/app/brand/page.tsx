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
      setError('Brand Profile name is required.')
      return
    }
    if (!language.trim()) {
      setError('Add the main language for generated proposals.')
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
      setFeedback('Brand Profile saved. New and existing Seeds can reuse it without copying these rules.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this Brand Profile.')
      setFeedback('')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Brand Profile"
        description={`The reusable voice, audience, and boundaries for ${currentWorkspace?.name ?? 'this workspace'}.`}
      />

      {(feedback || error) && <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>{error || feedback}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">Identity</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">What should always stay recognizable?</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Profile name</label><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Sora / Main creator voice" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Main language</label><input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="ja" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium text-gray-700">Purpose and worldview</label><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} placeholder="Why you create, what you want people to feel, and what must not be flattened into generic marketing language…" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Core audience</label><textarea value={audience} onChange={(event) => setAudience(event.target.value)} rows={4} placeholder="Who you are speaking with" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Voice traits</label><textarea value={voiceTraits} onChange={(event) => setVoiceTraits(event.target.value)} rows={4} placeholder="warm, honest, quiet, specific" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium text-gray-700">Values</label><textarea value={values} onChange={(event) => setValues(event.target.value)} rows={5} placeholder={'One value per line\nHonesty over hype\nRespect the original context'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">Language boundaries</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">What may and may not be said for you?</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Preferred words or spellings</label><textarea value={preferredTerms} onChange={(event) => setPreferredTerms(event.target.value)} rows={6} placeholder="One item per line" className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div><label className="mb-2 block text-sm font-medium text-gray-700">Avoided words or claims</label><textarea value={avoidedTerms} onChange={(event) => setAvoidedTerms(event.target.value)} rows={6} placeholder={'One item per line\nGuaranteed\nViral\n#fyp'} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
              <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium text-gray-700">Default call to action</label><textarea value={defaultCallToAction} onChange={(event) => setDefaultCallToAction(event.target.value)} rows={4} placeholder="A gentle reusable action. Individual Seeds can override it." className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-violet-300" /></div>
            </div>
          </div>

          <PermissionGate requiredPermission="edit_brand_profile" currentRole={currentMember?.role ?? 'viewer'}>
            <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60">{isSaving ? 'Saving…' : 'Save Brand Profile'}</button>
          </PermissionGate>
        </section>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[2rem] border border-violet-100 bg-violet-50 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">Why this is separate</p>
            <p className="mt-3 text-sm leading-6 text-violet-900">A Seed stores what is true for one idea. This profile stores what should remain true about your voice across every idea and channel.</p>
          </div>
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="text-base font-semibold text-gray-900">PR1 boundary</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-500">
              <li>• Stored per workspace</li>
              <li>• Reused by every Seed</li>
              <li>• No AI call yet</li>
              <li>• No OAuth or social account setup</li>
              <li>• Suggestions require approval in PR2</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
