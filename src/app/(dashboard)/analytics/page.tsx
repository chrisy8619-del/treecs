import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  YearlyDefectChart,
  SeasonDefectChart,
  ContractorDefectChart,
  SpeciesDefectChart,
  SiteReserveCostChart,
  SpeciesSeasonHeatmap,
  type SiteReserveData,
  type HeatmapData,
} from './charts'
import { SiteAnalysisTable } from './site-analysis-table'
import { SpeciesAnalysisTable } from './species-analysis-table'
import { resolveSeasonCode, safeNumZero, calcRiskLevel, SEASON_ORDER, SEASON_CODE_TO_KO } from '@/lib/season-utils'

function riskLabel(rate: number) {
  if (rate >= 0.20) return '🔴 고위험'
  if (rate >= 0.10) return '🟡 중위험'
  return '🟢 저위험'
}

async function getAnalyticsData() {
  const supabase = await createClient()

  const [yearlyRes, itemsRes, contractorRes, plantingRes, plantingSummaryRes] = await Promise.all([
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
    // 하자율 예측 데이터: 식재기록 기반 예비비·계절·협력사·연도 분석 (최대 1000행)
    supabase
      .from('planting_records')
      .select(`
        site_id,
        quantity_planted,
        planting_date,
        planting_season,
        unit_price,
        expected_defect_rate,
        expected_defect_qty,
        expected_reserve_cost,
        risk_level,
        species ( species_name_ko ),
        contractors ( contractor_name )
      `),
    // 총 식재 수량·하자수량 전체 집계 (DB 집계 함수 사용으로 row limit 우회)
    supabase.rpc('get_planting_summary'),
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

  // 계절별 — 점검 회차 season_code 우선, 없으면 식재기록 기반
  const seasonMap = new Map<string, { qty: number; defectQty: number }>()
  for (const item of items) {
    const round = Array.isArray(item.inspection_rounds) ? item.inspection_rounds[0] : item.inspection_rounds
    const season = round?.season_code
    if (!season) continue
    const prev = seasonMap.get(season) ?? { qty: 0, defectQty: 0 }
    seasonMap.set(season, {
      qty: prev.qty + (item.quantity_inspected ?? 0),
      defectQty: prev.defectQty + (item.defect_quantity ?? 0),
    })
  }

  // 식재기록 기반 계절 집계
  // 우선순위: planting_season(계절(수식)) → planting_date(식재시기) 자동 계산
  if (seasonMap.size === 0 && plantings.length > 0) {
    let countTotal = 0, countDate = 0, countSeasonCol = 0, countAuto = 0
    for (const p of plantings) {
      countTotal++
      const seasonKo = (p as unknown as Record<string, string | null>)['planting_season']
        ? SEASON_CODE_TO_KO[(p as unknown as Record<string, string>)['planting_season']]
        : null
      if ((p as unknown as Record<string, string | null>)['planting_season']) countSeasonCol++
      if (p.planting_date) countDate++
      const season = resolveSeasonCode(seasonKo, p.planting_date)
      if (season && !(p as unknown as Record<string, string | null>)['planting_season']) countAuto++
      if (!season) continue
      const qty = safeNumZero(p.quantity_planted)
      const rate = p.expected_defect_rate ?? 0
      const defectQty = safeNumZero(p.expected_defect_qty) || Math.round(qty * rate)
      const prev = seasonMap.get(season) ?? { qty: 0, defectQty: 0 }
      seasonMap.set(season, { qty: prev.qty + qty, defectQty: prev.defectQty + defectQty })
    }
    console.log('[분석/계절] 전체row:', countTotal, '식재시기:', countDate, '계절(수식):', countSeasonCol, '자동계산:', countAuto)
    console.log('[분석/계절] 계절별집계:', Object.fromEntries(
      [...seasonMap.entries()].map(([k, v]) => [SEASON_CODE_TO_KO[k] ?? k, { qty: v.qty, defectQty: v.defectQty, rate: v.qty > 0 ? (v.defectQty / v.qty * 100).toFixed(1) + '%' : '-' }])
    ))
  }

  const seasonData = SEASON_ORDER
    .filter((s) => seasonMap.has(s))
    .map((s) => {
      const { qty, defectQty } = seasonMap.get(s)!
      return { label: s, defect_rate: qty > 0 ? defectQty / qty : 0 }
    })

  // 수종별 계절 히트맵 데이터
  // 행: 수종명 / 열: 봄·여름·가을·겨울 / 값: 해당 수종+계절 하자율
  type SpSeasonBucket = { qty: number; defectQty: number }
  const heatmapBuckets = new Map<string, Record<string, SpSeasonBucket>>()
  for (const p of plantings) {
    const sp = Array.isArray(p.species) ? p.species[0] : p.species
    const spName = (sp as { species_name_ko?: string } | null)?.species_name_ko ?? '알 수 없음'
    const seasonKo = (p as unknown as Record<string, string | null>)['planting_season']
      ? SEASON_CODE_TO_KO[(p as unknown as Record<string, string>)['planting_season']]
      : null
    const season = resolveSeasonCode(seasonKo, p.planting_date)
    if (!season) continue
    const qty = safeNumZero(p.quantity_planted)
    const rate = p.expected_defect_rate != null ? p.expected_defect_rate
      : null
    if (rate === null) continue
    const defectQty = safeNumZero(p.expected_defect_qty) || Math.round(qty * rate)
    if (!heatmapBuckets.has(spName)) heatmapBuckets.set(spName, {})
    const spBuckets = heatmapBuckets.get(spName)!
    if (!spBuckets[season]) spBuckets[season] = { qty: 0, defectQty: 0 }
    spBuckets[season].qty += qty
    spBuckets[season].defectQty += defectQty
  }

  // 히트맵: 하자율 있는 수종 중 최대 20종 (전체 평균 하자율 높은 순)
  const heatmapData: HeatmapData[] = [...heatmapBuckets.entries()]
    .map(([name, seasons]) => {
      const totalQty = Object.values(seasons).reduce((s, v) => s + v.qty, 0)
      const totalDefect = Object.values(seasons).reduce((s, v) => s + v.defectQty, 0)
      const avgRate = totalQty > 0 ? totalDefect / totalQty : 0
      const seasonRates: Record<string, number | null> = {}
      for (const k of SEASON_ORDER) {
        const b = seasons[k]
        seasonRates[k] = b && b.qty > 0 ? b.defectQty / b.qty : null
      }
      return { name, avgRate, ...seasonRates } as HeatmapData
    })
    .filter((d) => d.avgRate > 0)
    .sort((a, b) => b.avgRate - a.avgRate)
    .slice(0, 20)

  console.log('[분석/히트맵] 수종 수:', heatmapData.length)

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

  // 요약 통계 — DB 집계 함수 기반 (row limit 우회)
  const summary = plantingSummaryRes.data as {
    total_planted: number
    total_defect: number
    high_risk_species: number
    mid_risk_species: number
    low_risk_species: number
  } | null
  const totalPlanted = summary?.total_planted ?? plantings.reduce((s, p) => s + (p.quantity_planted ?? 0), 0)
  const totalPlantDefect = summary?.total_defect ?? plantings.reduce((s, p) => {
    const qty = p.quantity_planted ?? 0
    const defect = p.expected_defect_qty ?? Math.round(qty * (p.expected_defect_rate ?? 0))
    return s + defect
  }, 0)
  const overallRate = totalPlanted > 0 ? totalPlantDefect / totalPlanted : null

  // 예비비 합계
  const totalReserveCost = siteReserveData.reduce((s, v) => s + v.reserve_cost, 0)

  // 리스크 카운트 — DB 집계 함수 우선, 없으면 1000행 기준 폴백
  const riskCounts = summary
    ? { high: summary.high_risk_species, mid: summary.mid_risk_species, low: summary.low_risk_species }
    : plantings.reduce(
        (acc, p) => {
          const level = p.risk_level ?? (p.expected_defect_rate != null ? calcRiskLevel(p.expected_defect_rate) : null)
          if (level === '고위험') acc.high++
          else if (level === '중위험') acc.mid++
          else if (level === '저위험') acc.low++
          return acc
        },
        { high: 0, mid: 0, low: 0 }
      )

  return {
    yearlyData, seasonData, contractorData, siteData, speciesData,
    siteReserveData, totalReserveCost, riskCounts, heatmapData,
    totalPlanted, overallRate,
    hasPlantingAnalysis: plantings.length > 0,
  }
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const {
    yearlyData, seasonData, contractorData, siteData, speciesData,
    siteReserveData, totalReserveCost, riskCounts, heatmapData,
    totalPlanted, overallRate,
    hasPlantingAnalysis,
  } = await getAnalyticsData()

  const hasData = siteData.length > 0 || yearlyData.length > 0 || hasPlantingAnalysis
  const highRiskSpeciesCount = speciesData.filter((s) => s.defect_rate >= 0.20).length

  return (
    <div className="space-y-0 -m-6">
      {/* ── 상단 헤더 ── */}
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">분석</h1>
            <p className="text-xs text-green-200 mt-0.5">현장별 하자율 통계 및 리스크 분석 현황입니다.</p>
          </div>
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
                <CardTitle className="text-sm font-medium text-muted-foreground">총 식재 수량</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalPlanted > 0 ? totalPlanted.toLocaleString() : '-'}</p>
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
                <p className="text-xs text-muted-foreground">전체 식재 기준</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">고위험 수종</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${highRiskSpeciesCount > 0 ? 'text-red-500' : ''}`}>
                  {highRiskSpeciesCount > 0 ? highRiskSpeciesCount.toLocaleString() : '-'}
                </p>
                <p className="text-xs text-muted-foreground">하자율 20% 이상</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">예상 하자 관리비용</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-orange-500">
                  {totalReserveCost > 0 ? `₩${totalReserveCost.toLocaleString()}` : '-'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalReserveCost > 0 ? '원' : '예측 데이터 없음'}
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
                  <span className="ml-2 text-xs font-normal text-muted-foreground">입주시기 기준</span>
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

          {/* 수종별 계절 히트맵 */}
          {heatmapData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  수종별 계절 하자율 히트맵
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    입주시기 기준 · 상위 {heatmapData.length}종
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SpeciesSeasonHeatmap data={heatmapData} />
              </CardContent>
            </Card>
          )}

          {/* 3행: 현장별 예비비 + 현장별 리스크 현황 */}
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

          {/* 현장별 분석 테이블 — 전체 현장 20개씩 페이지네이션 */}
          {(siteData.length > 0 || siteReserveData.length > 0) && (
            <SiteAnalysisTable siteData={siteData} siteReserveData={siteReserveData} />
          )}

          {/* 수종별 테이블 */}
          {speciesData.length > 0 && (
            <SpeciesAnalysisTable data={speciesData} />
          )}
        </>
      )}
      </div>
    </div>
  )
}
