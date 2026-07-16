import { redirect } from 'next/navigation'

export default function LegacyNewContentRoute() {
  redirect('/app/seeds/new')
}
