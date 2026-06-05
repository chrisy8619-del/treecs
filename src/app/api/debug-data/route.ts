import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  // 현장 수
  const { count: siteCount } = await supabase.from('sites').select('*', { count: 'exact', head: true })

  // planting_records 총 수
  const { count: plantingCount } = await supabase.from('planting_records').select('*', { count: 'exact', head: true })

  // 현장별 planting_records 수 (상위 10개)
  const { data: sites } = await supabase.from('sites').select('id, site_name, site_code, status').in('status', ['active', 'closed']).limit(10)

  // 모든 현장의 planting_count 확인
  const { data: allSites } = await supabase.from('sites').select('id, site_name, site_code, status').in('status', ['active', 'closed'])

  const siteStats = await Promise.all(
    (allSites ?? []).map(async (s) => {
      const { count } = await supabase.from('planting_records').select('*', { count: 'exact', head: true }).eq('site_id', s.id)
      return { site_name: s.site_name, site_code: s.site_code, status: s.status, planting_count: count }
    })
  )

  // planting_count 0인 현장만 추출
  const emptySites = siteStats.filter(s => (s.planting_count ?? 0) === 0)

  return NextResponse.json({ siteCount, plantingCount, emptySites, totalSiteStats: siteStats.length })
}
