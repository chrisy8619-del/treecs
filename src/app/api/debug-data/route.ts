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

  const siteStats = await Promise.all(
    (sites ?? []).map(async (s) => {
      const { count } = await supabase.from('planting_records').select('*', { count: 'exact', head: true }).eq('site_id', s.id)
      return { site_name: s.site_name, site_code: s.site_code, status: s.status, planting_count: count }
    })
  )

  return NextResponse.json({ siteCount, plantingCount, siteStats })
}
