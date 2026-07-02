/**
 * 수종별 평균 하자율(원시율) 집계 API. GET /api/species-defect-avg
 *
 * 호출 주체 : ⚠️ 현재 src 내 fetch 호출처 없음 — simulation/page.tsx가 SSR에서
 *             동일 집계를 Supabase 직접 쿼리로 수행하도록 대체된 것으로 보임.
 *             외부/과거 호환용으로 유지 중. 정리(삭제) 검토 후보.
 * 반환/전송 : { [species_name_ko]: rate } JSON. 미인증 401, 실패 500.
 * 의존성   : @/lib/supabase/server
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// 전체 planting_records 기준 수종별 집계
// SUM(expected_defect_qty) / SUM(quantity_planted) per species_name_ko
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({}, { status: 401 })

  const { data, error } = await supabase
    .from('planting_records')
    .select(`
      quantity_planted,
      expected_defect_qty,
      species ( species_name_ko )
    `)
    .not('expected_defect_qty', 'is', null)

  if (error || !data) return NextResponse.json({}, { status: 500 })

  // 수종명 기준 집계
  const agg = new Map<string, { totalQty: number; totalDefectQty: number }>()
  for (const row of data) {
    const speciesArr = row.species
    const species = Array.isArray(speciesArr) ? speciesArr[0] : speciesArr
    const name = (species as { species_name_ko: string } | null)?.species_name_ko
    if (!name) continue
    const prev = agg.get(name) ?? { totalQty: 0, totalDefectQty: 0 }
    agg.set(name, {
      totalQty: prev.totalQty + (row.quantity_planted ?? 0),
      totalDefectQty: prev.totalDefectQty + (row.expected_defect_qty ?? 0),
    })
  }

  // { [species_name_ko]: rate }
  const result: Record<string, number> = {}
  for (const [name, v] of agg) {
    if (v.totalQty > 0) result[name] = v.totalDefectQty / v.totalQty
  }

  return NextResponse.json(result)
}
