import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient, type SiteOption, type PlantingRow } from './dashboard-client'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 현장 목록 — 승인된(active/closed) 현장만 표시, pending은 설정>현장승인 탭에서 처리
  const { data: sitesRaw } = await supabase
    .from('sites')
    .select('id, site_name, site_code, region, occupancy_date, start_date, organizations(name)')
    .in('status', ['active', 'closed'])
    .order('created_at', { ascending: false })

  const sites: SiteOption[] = (sitesRaw ?? []).map((s) => {
    const org = Array.isArray(s.organizations) ? s.organizations[0] : s.organizations
    return {
      id: s.id,
      site_name: s.site_name,
      site_code: s.site_code,
      region: s.region ?? null,
      occupancy_date: s.occupancy_date ?? null,
      start_date: s.start_date ?? null,
      org_name: (org as { name: string } | null)?.name ?? null,
    }
  })

  return <DashboardClient sites={sites} />
}
