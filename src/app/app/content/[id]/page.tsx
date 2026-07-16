import { redirect } from 'next/navigation'

export default async function LegacyContentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/app/seeds/${id}`)
}
