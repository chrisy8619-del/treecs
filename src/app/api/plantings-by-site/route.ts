/**
 * 현장별 식재 기록 조회 API. GET /api/plantings-by-site?site_id=...
 *
 * 호출 주체 : simulation-client.tsx, dashboard-client.tsx (현장 선택 시 지연 조회)
 * 반환/전송 : planting_records + 조인(contractors/species/spec_codes) 배열 JSON.
 *             site_id 누락 400, 미인증 401, 쿼리 실패 500 — 모두 빈 배열 반환.
 * 의존성   : @/lib/supabase/server
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('site_id')
  if (!siteId) return NextResponse.json([], { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data, error } = await supabase
    .from('planting_records')
    .select(`
      id,
      site_id,
      quantity_planted,
      unit_price,
      expected_defect_rate,
      expected_defect_qty,
      expected_reserve_cost,
      risk_level,
      planting_season,
      planting_date,
      notes,
      contractors ( contractor_name ),
      species ( species_name_ko ),
      spec_codes ( height_m, width_m, rootball_r, caliper )
    `)
    .eq('site_id', siteId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
