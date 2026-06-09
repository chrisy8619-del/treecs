import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  SiteReserveCostChart,
  type SiteReserveData,
} from '../analytics/charts'
import { SiteAnalysisTable } from '../analytics/site-analysis-table'
import { SpeciesAnalysisTable } from '../analytics/species-analysis-table'

function riskLabel(rate: number) {
  if (rate >= 0.20) return '🔴 고위험'
  if (rate >= 0.10) return '🟡 중위험'
  return '🟢 저위험'
}

export const dynamic = 'force-dynamic'

export default async function RiskAnalysisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: plantingRaw }, { data: itemsRaw }] = await Promise.all([
    supabase
      .from('planting_records')
      .select(`
        site_id,
        quantity_planted,
        expected_defect_rate,
        expected_defect_qty,
        expected_reserve_cost,
        species ( species_name_ko )
      `),
    supabase
      .from('inspection_items')
      .select(`
        site_id,
        quantity_inspected,
        defect_quantity,
        species ( species_name_ko )
      `),
  ])

  const plantings = plantingRaw ?? []
  const items = itemsRaw ?? []

  // 현장별 예비비 집계
  const reserveMap = new Map<string, { name: string; reserve_cost: number; qty: number; defect_qty: number; site_id: string }>()
  for (const p of plantings) {
    const sid = p.site_id as string
    if (!sid || !p.expected_reserve_cost) continue
    const prev = reserveMap.get(sid) ?? { name: sid, reserve_cost: 0, qty: 0, defect_qty: 0, site_id: sid }
    reserveMap.set(sid, {
      ...prev,
      reserve_cost: prev.reserve_cost + (p.expected_reserve_cost ?? 0),
      qty: prev.qty + (p.quantity_planted ?? 0),
      defect_qty: prev.defect_qty + (p.expected_defect_qty ?? 0),
    })
  }
  const reserveSiteIds = [...reserveMap.keys()]
  if (reserveSiteIds.length > 0) {
    const { data: siteNames } = await supabase.from('sites').select('id, site_name').in('id', reserveSiteIds)
    for (const s of siteNames ?? []) {
      const prev = reserveMap.get(s.id)
      if (prev) reserveMap.set(s.id, { ...prev, name: s.site_name })
    }
  }
  const siteReserveData: SiteReserveData[] = [...reserveMap.values()]
    .map((v) => ({
      name: v.name,
      reserve_cost: v.reserve_cost,
      defect_rate: v.qty > 0 ? v.defect_qty / v.qty : 0,
      risk_level: riskLabel(v.qty > 0 ? v.defect_qty / v.qty : 0),
    }))
    .sort((a, b) => b.reserve_cost - a.reserve_cost)

  // 현장별 분석 (점검 기반)
  const siteMap = new Map<string, { name: string; inspected: number; defect: number }>()
  for (const item of items) {
    const sid = item.site_id as string
    if (!sid) continue
    const prev = siteMap.get(sid) ?? { name: sid, inspected: 0, defect: 0 }
    siteMap.set(sid, {
      name: prev.name,
      inspected: prev.inspected + (item.quantity_inspected ?? 0),
      defect: prev.defect + (item.defect_quantity ?? 0),
    })
  }
  const siteIds = [...siteMap.keys()]
  if (siteIds.length > 0) {
    const { data: siteNames } = await supabase.from('sites').select('id, site_name').in('id', siteIds)
    for (const s of siteNames ?? []) {
      const prev = siteMap.get(s.id)
      if (prev) siteMap.set(s.id, { ...prev, name: s.site_name })
    }
  }
  const siteData = [...siteMap.values()]
    .map((v) => ({ name: v.name, defect_rate: v.inspected > 0 ? v.defect / v.inspected : 0, inspected: v.inspected, defect: v.defect }))
    .sort((a, b) => b.defect_rate - a.defect_rate)

  // 수종별 하자율 — planting_records 기반으로 통일 집계
  const spMap = new Map<string, { inspected: number; defect: number }>()
  for (const p of plantings) {
    const sp = Array.isArray(p.species) ? p.species[0] : p.species
    const name = (sp as { species_name_ko?: string } | null)?.species_name_ko ?? '알 수 없음'
    const qty = p.quantity_planted ?? 0
    const defectQty = p.expected_defect_qty ?? Math.round(qty * (p.expected_defect_rate ?? 0))
    const prev = spMap.get(name) ?? { inspected: 0, defect: 0 }
    spMap.set(name, { inspected: prev.inspected + qty, defect: prev.defect + defectQty })
  }
  const speciesData = [...spMap.entries()]
    .map(([name, v]) => ({ name, defect_rate: v.inspected > 0 ? v.defect / v.inspected : 0, inspected: v.inspected, defect: v.defect }))
    .sort((a, b) => b.defect_rate - a.defect_rate)

  const hasData = siteReserveData.length > 0 || siteData.length > 0 || speciesData.length > 0

  return (
    <div className="space-y-0 -m-6">
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
          <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">현장 리스크 분석</h1>
          <p className="text-xs text-green-200 mt-0.5">현장별 예상 하자 관리비용, 리스크 현황 및 수종별 분석입니다.</p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <p className="text-sm">분석할 데이터가 없습니다.</p>
            <p className="text-xs mt-1">설정 &gt; 업로드에서 하자율 예측 분석 엑셀을 업로드하세요.</p>
          </div>
        ) : (
          <>
            {/* 현장별 예비비 + 현장별 리스크 현황 */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    현장별 예상 하자 관리비용
                    <span className="ml-2 text-sm font-normal text-muted-foreground">상위 10개 현장</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {siteReserveData.length > 0 ? (
                    <SiteReserveCostChart data={siteReserveData} />
                  ) : (
                    <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                      하자율 예측 분석 데이터를 업로드하면 표시됩니다.
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    현장별 리스크 현황
                    <span className="ml-2 text-sm font-normal text-muted-foreground">총 {siteReserveData.length}개 현장</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {siteReserveData.length > 0 ? (
                    <div className="divide-y max-h-[280px] overflow-y-auto">
                      {siteReserveData.slice(0, 8).map((site, i) => (
                        <div key={i} className="flex items-center justify-between px-6 py-2.5 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                            <span className="font-medium truncate">{site.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-2">
                            <span className={`font-semibold ${site.defect_rate >= 0.20 ? 'text-red-500' : site.defect_rate >= 0.10 ? 'text-yellow-500' : 'text-green-600'}`}>
                              {(site.defect_rate * 100).toFixed(1)}%
                            </span>
                            <span className="text-orange-600 text-xs">₩{(site.reserve_cost / 1000000).toFixed(1)}M</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${site.defect_rate >= 0.20 ? 'bg-red-100 text-red-700' : site.defect_rate >= 0.10 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                              {site.defect_rate >= 0.20 ? '고위험' : site.defect_rate >= 0.10 ? '중위험' : '저위험'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                      데이터가 없습니다.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 현장별 분석 테이블 */}
            {(siteData.length > 0 || siteReserveData.length > 0) && (
              <SiteAnalysisTable siteData={siteData} siteReserveData={siteReserveData} />
            )}

            {/* 수종별 하자율 테이블 */}
            {speciesData.length > 0 && (
              <SpeciesAnalysisTable data={speciesData} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
