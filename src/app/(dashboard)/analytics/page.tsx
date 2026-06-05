import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  YearlyDefectChart,
  SeasonDefectChart,
  ContractorDefectChart,
  SpeciesDefectChart,
  SiteReserveCostChart,
  type SiteReserveData,
} from './charts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { SiteAnalysisTable } from './site-analysis-table'

// 엑셀 기준 리스크 등급: ≥20% 고위험, ≥10% 중위험, 미만 저위험
function riskBadge(rate: number) {
  if (rate >= 0.20) return <Badge className="bg-red-500 hover:bg-red-500 text-white">고위험</Badge>
  if (rate >= 0.10) return <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white">중위험</Badge>
  return <Badge className="bg-green-500 hover:bg-green-500 text-white">저위험</Badge>
}

function riskLabel(rate: number) {
  if (rate >= 0.20) return '🔴 고위험'
  if (rate >= 0.10) return '🟡 중위험'
  return '🟢 저위험'
}

async function getAnalyticsData() {
  const supabase = await createClient()

  const [yearlyRes, itemsRes, contractorRes, plantingRes] = await Promise.all([
    supabase
      .from('agg_metrics_by_year')
      .select('year, total_quantity, total_defect_quantity, defect_rate')
      .order('year'),
    supabase
      .from('inspection_items')
      .select(`
        site_id,
        quantity_inspected,
        defect_quantity,
        inspection_rounds ( season_code ),
        contractors ( contractor_name ),
        species ( species_name_ko )
      `),
    supabase
      .from('agg_metrics_by_contractor')
      .select('total_quantity, total_defect_quantity, defect_rate, contractors(contractor_name)')
      .order('defect_rate', { ascending: false }),
    // 하자율 예측 데이터: 식재기록 기반 예비비·계절·협력사·연도 분석
    supabase
      .from('planting_records')
      .select(`
        site_id,
        quantity_planted,
        planting_date,
        unit_price,
        expected_defect_rate,
        expected_defect_qty,
        expected_reserve_cost,
        risk_level,
        species ( species_name_ko ),
        contractors ( contractor_name )
      `)
      .not('expected_defect_rate', 'is', null)
      .limit(10000),
  ])

  const items = itemsRes.data ?? []
  const plantings = plantingRes.data ?? []

  // 연도별 — 집계 테이블 우선, 없으면 planting_records 기반으로 집계
  let yearlyData: { year: number; defect_rate: number; total_quantity: number; total_defect_quantity: number }[] = []
  if (yearlyRes.data && yearlyRes.data.length > 0) {
    yearlyData = yearlyRes.data.map((d) => ({
      year: d.year,
      defect_rate: d.defect_rate ?? 0,
      total_quantity: d.total_quantity,
      total_defect_quantity: d.total_defect_quantity,
    }))
  } else if (plantings.length > 0) {
    const yMap = new Map<number, { qty: number; defectQty: number }>()
    for (const p of plantings) {
      if (!p.planting_date) continue
      const year = new Date(p.planting_date).getFullYear()
      const qty = p.quantity_planted ?? 0
      const defectQty = p.expected_defect_qty ?? Math.round(qty * (p.expected_defect_rate ?? 0))
      const prev = yMap.get(year) ?? { qty: 0, defectQty: 0 }
      yMap.set(year, { qty: prev.qty + qty, defectQty: prev.defectQty + defectQty })
    }
    yearlyData = [...yMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, v]) => ({
        year,
        defect_rate: v.qty > 0 ? v.defectQty / v.qty : 0,
        total_quantity: v.qty,
        total_defect_quantity: v.defectQty,
      }))
  }

  // 계절별 — 점검 회차 season_code 우선, 없으면 식재기록 planting_date로 보완
  const seasonMap = new Map<string, { inspected: number; defect: number }>()
  for (const item of items) {
    const round = Array.isArray(item.inspection_rounds) ? item.inspection_rounds[0] : item.inspection_rounds
    const season = round?.season_code
    if (!season) continue
    const prev = seasonMap.get(season) ?? { inspected: 0, defect: 0 }
    seasonMap.set(season, {
      inspected: prev.inspected + (item.quantity_inspected ?? 0),
      defect: prev.defect + (item.defect_quantity ?? 0),
    })
  }

  // 점검 데이터에 계절 없으면 식재기록 기반으로 집계
  if (seasonMap.size === 0 && plantings.length > 0) {
    for (const p of plantings) {
      if (!p.planting_date || !p.expected_defect_rate) continue
      const month = new Date(p.planting_date).getMonth() + 1
      let season = 'winter'
      if (month >= 3 && month <= 5) season = 'spring'
      else if (month >= 6 && month <= 8) season = 'summer'
      else if (month >= 9 && month <= 11) season = 'fall'
      const qty = p.quantity_planted ?? 0
      const defectQty = p.expected_defect_qty ?? Math.round(qty * (p.expected_defect_rate ?? 0))
      const prev = seasonMap.get(season) ?? { inspected: 0, defect: 0 }
      seasonMap.set(season, {
        inspected: prev.inspected + qty,
        defect: prev.defect + defectQty,
      })
    }
  }

  const seasonOrder = ['spring', 'summer', 'fall', 'winter']
  const seasonData = seasonOrder
    .filter((s) => seasonMap.has(s))
    .map((s) => {
      const { inspected, defect } = seasonMap.get(s)!
      return { label: s, defect_rate: inspected > 0 ? defect / inspected : 0 }
    })

  // 협력사별 — 집계 테이블 우선, 없으면 inspection_items, 그것도 없으면 planting_records 기반
  let contractorData: { name: string; defect_rate: number; total_quantity: number }[] = []
  if (contractorRes.data && contractorRes.data.length > 0) {
    contractorData = contractorRes.data.map((d) => {
      const c = Array.isArray(d.contractors) ? d.contractors[0] : d.contractors
      return { name: c?.contractor_name ?? '알 수 없음', defect_rate: d.defect_rate ?? 0, total_quantity: d.total_quantity }
    })
  } else if (items.length > 0) {
    const cMap = new Map<string, { name: string; inspected: number; defect: number }>()
    for (const item of items) {
      const c = Array.isArray(item.contractors) ? item.contractors[0] : item.contractors
      const name = c?.contractor_name ?? '알 수 없음'
      const prev = cMap.get(name) ?? { name, inspected: 0, defect: 0 }
      cMap.set(name, {
        name,
        inspected: prev.inspected + (item.quantity_inspected ?? 0),
        defect: prev.defect + (item.defect_quantity ?? 0),
      })
    }
    contractorData = [...cMap.values()]
      .map((v) => ({ name: v.name, defect_rate: v.inspected > 0 ? v.defect / v.inspected : 0, total_quantity: v.inspected }))
      .sort((a, b) => b.defect_rate - a.defect_rate)
  } else {
    // planting_records 기반 협력사별 집계
    const cMap = new Map<string, { name: string; qty: number; defectQty: number }>()
    for (const p of plantings) {
      const c = Array.isArray(p.contractors) ? p.contractors[0] : p.contractors
      const name = (c as { contractor_name?: string } | null)?.contractor_name ?? '알 수 없음'
      const qty = p.quantity_planted ?? 0
      const defectQty = p.expected_defect_qty ?? Math.round(qty * (p.expected_defect_rate ?? 0))
      const prev = cMap.get(name) ?? { name, qty: 0, defectQty: 0 }
      cMap.set(name, { name, qty: prev.qty + qty, defectQty: prev.defectQty + defectQty })
    }
    contractorData = [...cMap.values()]
      .map((v) => ({ name: v.name, defect_rate: v.qty > 0 ? v.defectQty / v.qty : 0, total_quantity: v.qty }))
      .sort((a, b) => b.defect_rate - a.defect_rate)
  }

  // 현장별 (점검 기반)
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

  // 수종별
  const spMap = new Map<string, { inspected: number; defect: number }>()
  for (const item of items) {
    const sp = Array.isArray(item.species) ? item.species[0] : item.species
    const name = sp?.species_name_ko ?? '알 수 없음'
    const prev = spMap.get(name) ?? { inspected: 0, defect: 0 }
    spMap.set(name, {
      inspected: prev.inspected + (item.quantity_inspected ?? 0),
      defect: prev.defect + (item.defect_quantity ?? 0),
    })
  }
  // 식재기록 기반 수종별도 보완
  for (const p of plantings) {
    const sp = Array.isArray(p.species) ? p.species[0] : p.species
    const name = sp?.species_name_ko ?? '알 수 없음'
    if (spMap.has(name)) continue // 이미 점검 데이터 있으면 스킵
    const qty = p.quantity_planted ?? 0
    const defectQty = p.expected_defect_qty ?? Math.round(qty * (p.expected_defect_rate ?? 0))
    const prev = spMap.get(name) ?? { inspected: 0, defect: 0 }
    spMap.set(name, { inspected: prev.inspected + qty, defect: prev.defect + defectQty })
  }
  const speciesData = [...spMap.entries()]
    .map(([name, v]) => ({ name, defect_rate: v.inspected > 0 ? v.defect / v.inspected : 0, inspected: v.inspected, defect: v.defect }))
    .sort((a, b) => b.defect_rate - a.defect_rate)

  // 현장별 예상 예비비 (식재기록 기반)
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
  // 현장명 조회
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

  // 요약 통계
  const totalInspected = items.reduce((s, i) => s + (i.quantity_inspected ?? 0), 0)
  const totalDefect = items.reduce((s, i) => s + (i.defect_quantity ?? 0), 0)
  const overallRate = totalInspected > 0 ? totalDefect / totalInspected : null
  const highRiskSites = siteData.filter((s) => s.defect_rate >= 0.20).length

  // 예비비 합계
  const totalReserveCost = siteReserveData.reduce((s, v) => s + v.reserve_cost, 0)

  // 리스크 카운트 (식재기록 기반)
  const riskCounts = plantings.reduce(
    (acc, p) => {
      if (p.risk_level === '고위험') acc.high++
      else if (p.risk_level === '중위험') acc.mid++
      else if (p.risk_level === '저위험') acc.low++
      return acc
    },
    { high: 0, mid: 0, low: 0 }
  )

  return {
    yearlyData, seasonData, contractorData, siteData, speciesData,
    siteReserveData, totalReserveCost, riskCounts,
    totalInspected, totalDefect, overallRate, highRiskSites,
    hasPlantingAnalysis: plantings.length > 0,
  }
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const {
    yearlyData, seasonData, contractorData, siteData, speciesData,
    siteReserveData, totalReserveCost, riskCounts,
    totalInspected, totalDefect, overallRate, highRiskSites,
    hasPlantingAnalysis,
  } = await getAnalyticsData()

  const hasData = siteData.length > 0 || yearlyData.length > 0 || hasPlantingAnalysis

  return (
    <div className="space-y-0 -m-6">
      {/* ── 상단 헤더 ── */}
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">대시보드</h1>
          <p className="text-xs text-green-200 mt-0.5">현장별 하자율 통계 및 리스크 분석 현황입니다.</p>
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
          {/* 요약 카드 */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">총 점검 수량</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalInspected > 0 ? totalInspected.toLocaleString() : '-'}</p>
                <p className="text-xs text-muted-foreground">주</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">전체 하자율</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${overallRate !== null && overallRate >= 0.20 ? 'text-red-500' : overallRate !== null && overallRate >= 0.10 ? 'text-yellow-500' : ''}`}>
                  {overallRate !== null ? `${(overallRate * 100).toFixed(1)}%` : '-'}
                </p>
                <p className="text-xs text-muted-foreground">전체 점검 기준</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">고위험 현장</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${highRiskSites > 0 ? 'text-red-500' : ''}`}>
                  {highRiskSites > 0 ? highRiskSites : '-'}
                </p>
                <p className="text-xs text-muted-foreground">하자율 20% 이상</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">총 예상 예비비</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-orange-500">
                  {totalReserveCost > 0 ? `₩${(totalReserveCost / 1000000).toFixed(1)}M` : '-'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalReserveCost > 0 ? `₩${totalReserveCost.toLocaleString()}` : '예측 데이터 없음'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 리스크 요약 배너 (예측 데이터 있을 때) */}
          {hasPlantingAnalysis && (riskCounts.high > 0 || riskCounts.mid > 0) && (
            <div className="flex items-center gap-6 rounded-lg border bg-muted/30 px-5 py-3 text-sm">
              <span className="font-medium text-muted-foreground">리스크 현황</span>
              {riskCounts.high > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  <span className="font-semibold text-red-600">고위험 {riskCounts.high}종</span>
                  <span className="text-muted-foreground">(≥20%)</span>
                </span>
              )}
              {riskCounts.mid > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
                  <span className="font-semibold text-yellow-600">중위험 {riskCounts.mid}종</span>
                  <span className="text-muted-foreground">(10–20%)</span>
                </span>
              )}
              {riskCounts.low > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-semibold text-green-600">저위험 {riskCounts.low}종</span>
                  <span className="text-muted-foreground">(&lt;10%)</span>
                </span>
              )}
            </div>
          )}

          {/* 1행: 계절별 + 수종별 */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  계절별 하자율
                  <span className="ml-2 text-xs font-normal text-muted-foreground">식재시기 기준</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {seasonData.length > 0 ? (
                  <SeasonDefectChart data={seasonData} />
                ) : (
                  <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">수종별 하자율 <span className="text-sm font-normal text-muted-foreground">(상위 15종)</span></CardTitle>
              </CardHeader>
              <CardContent>
                {speciesData.length > 0 ? (
                  <SpeciesDefectChart data={speciesData} />
                ) : (
                  <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 2행: 시공사별 + 연도별 */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">협력사별 하자율</CardTitle>
              </CardHeader>
              <CardContent>
                {contractorData.length > 0 ? (
                  <ContractorDefectChart data={contractorData} />
                ) : (
                  <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">연도별 하자율 추이</CardTitle>
              </CardHeader>
              <CardContent>
                {yearlyData.length > 0 ? (
                  <YearlyDefectChart data={yearlyData} />
                ) : (
                  <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 3행: 현장별 예비비 + 현장별 리스크 현황 */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  현장별 예상 예비비
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

          {/* 현장별 분석 테이블 — 전체 현장 20개씩 페이지네이션 */}
          {(siteData.length > 0 || siteReserveData.length > 0) && (
            <SiteAnalysisTable siteData={siteData} siteReserveData={siteReserveData} />
          )}

          {/* 수종별 테이블 */}
          {speciesData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  수종별 하자율
                  <span className="ml-2 text-sm font-normal text-muted-foreground">총 {speciesData.length}종</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>순위</TableHead>
                      <TableHead>수종명</TableHead>
                      <TableHead className="text-right">수량</TableHead>
                      <TableHead className="text-right">하자 수량</TableHead>
                      <TableHead className="text-right">하자율</TableHead>
                      <TableHead>리스크 등급</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {speciesData.map((sp, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium">{sp.name}</TableCell>
                        <TableCell className="text-right">{sp.inspected.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{sp.defect.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className={sp.defect_rate >= 0.20 ? 'text-red-500' : sp.defect_rate >= 0.10 ? 'text-yellow-500' : ''}>
                            {(sp.defect_rate * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell>{riskBadge(sp.defect_rate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
      </div>
    </div>
  )
}
