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
