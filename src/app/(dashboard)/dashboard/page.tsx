/**
 * 대시보드 화면의 SSR 진입점(서버 컴포넌트).
 *
 * 호출 주체 : /dashboard 라우트 진입 시 Next.js가 렌더. force-dynamic.
 * 반환/전송 : 미인증 시 /login redirect. 승인된(active/closed) 현장 목록만 조회해
 *             SiteOption[]으로 변환 후 DashboardClient에 props로 전달.
 *             (식재/하자 데이터는 클라이언트가 현장 선택 시 별도 조회)
 * 의존성   : @/lib/supabase/server, ./dashboard-client
 * 데이터흐름: [이 파일: sites 조회] → DashboardClient → (현장 선택) 상세 데이터 fetch
 */
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
