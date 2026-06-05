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

  // 만촌자이르네 현장 ID 확인
  const { data: manch } = await supabase.from('sites').select('id, site_name, site_code, status').ilike('site_name', '%만촌%')

  // 만촌 site_id로 planting_records 조회
  const manchRecords = await Promise.all(
    (manch ?? []).map(async (s) => {
      const { count } = await supabase.from('planting_records').select('*', { count: 'exact', head: true }).eq('site_id', s.id)
      return { id: s.id, site_name: s.site_name, site_code: s.site_code, status: s.status, planting_count: count }
    })
  )

  // 대시보드 sites 쿼리 (status active/closed)에서 상위 5개
  const { data: dashSites } = await supabase
    .from('sites')
    .select('id, site_name, site_code, status')
    .in('status', ['active', 'closed'])
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({ siteCount, plantingCount, manchRecords, dashSites })
}
