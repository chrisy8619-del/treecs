import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardTabsClient } from './dashboard-tabs-client'
import { type SiteOption, type SubstitutionMap, type AltSpeciesRec } from './simulation-client'
import { type AnalyticsProps } from './analytics-content'
import { resolveSeasonCode, safeNumZero, SEASON_ORDER, SEASON_CODE_TO_KO } from '@/lib/season-utils'
import type { SiteReserveData, HeatmapData } from '../analytics/charts'

export const dynamic = 'force-dynamic'

function riskLabel(rate: number) {
  if (rate >= 0.20) return '🔴 고위험'
  if (rate >= 0.10) return '🟡 중위험'
  return '🟢 저위험'
}

export default async function SimulationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── 시뮬레이터 탭 데이터 ──
  const [{ data: sitesRaw }, { data: subsRaw }, { data: plantingAvgRaw }, { data: altRecsRaw }] = await Promise.all([
    supabase
      .from('sites')
      .select('id, site_name, site_code, region, occupancy_date, organizations(name)')
      .in('status', ['active', 'closed'])
      .order('created_at', { ascending: false }),
    supabase
      .from('species_substitutions')
      .select(`
        original_species_id,
        substitute_species_id,
        improved_defect_rate,
        original:original_species_id ( species_name_ko ),
        substitute:substitute_species_id ( species_name_ko )
      `),
    supabase
      .from('planting_records')
      .select('quantity_planted, expected_defect_qty, species ( species_name_ko )')
      .not('expected_defect_qty', 'is', null),
    supabase
      .from('alternative_species_recommendations')
      .select('species_name, region, season, substitute1, substitute2, substitute3'),
  ])

  const sitesAll: SiteOption[] = (sitesRaw ?? []).map((s) => {
    const org = Array.isArray(s.organizations) ? s.organizations[0] : s.organizations
    return {
      id: s.id,
      site_name: s.site_name,
      site_code: s.site_code,
      region: s.region ?? null,
      occupancy_date: s.occupancy_date ?? null,
      org_name: (org as { name: string } | null)?.name ?? null,
    }
  })
  const manChonIdx = sitesAll.findIndex((s) => s.site_name.includes('만촌'))
  const sites: SiteOption[] = manChonIdx > 0
    ? [sitesAll[manChonIdx], ...sitesAll.filter((_, i) => i !== manChonIdx)]
    : sitesAll

  const substitutions: SubstitutionMap[] = (subsRaw ?? []).map((s) => {
    const original = Array.isArray(s.original) ? s.original[0] : s.original
    const substitute = Array.isArray(s.substitute) ? s.substitute[0] : s.substitute
    return {
      original_species_name: (original as { species_name_ko: string } | null)?.species_name_ko ?? '',
      substitute_species_name: (substitute as { species_name_ko: string } | null)?.species_name_ko ?? '',
      improved_defect_rate: Number(s.improved_defect_rate),
    }
  }).filter((s) => s.original_species_name && s.substitute_species_name)

  const aggMap = new Map<string, { qty: number; defect: number }>()
  for (const row of plantingAvgRaw ?? []) {
    const speciesArr = row.species
    const species = Array.isArray(speciesArr) ? speciesArr[0] : speciesArr
    const name = (species as { species_name_ko: string } | null)?.species_name_ko
    if (!name) continue
    const prev = aggMap.get(name) ?? { qty: 0, defect: 0 }
    aggMap.set(name, {
      qty: prev.qty + (row.quantity_planted ?? 0),
      defect: prev.defect + (row.expected_defect_qty ?? 0),
    })
  }
  const speciesAvgRate: Record<string, number> = {}
  for (const [name, v] of aggMap) {
    speciesAvgRate[name] = v.qty > 0 ? v.defect / v.qty : 0
  }

  const altRecs: AltSpeciesRec[] = (altRecsRaw ?? []).map((r) => ({
    species_name: r.species_name,
    region: r.region,
    season: r.season,
    substitute1: r.substitute1 ?? null,
    substitute2: r.substitute2 ?? null,
    substitute3: r.substitute3 ?? null,
  }))

  // ── 대시보드 탭 (analytics) 데이터 ──
  const [yearlyRes, itemsRes, contractorRes, plantingRes, plantingSummaryRes] = await Promise.all([
    supabase.rpc('get_yearly_defect'),
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
    supabase.rpc('get_planting_summary'),
  ])

  const items = itemsRes.data ?? []
  const plantings = plantingRes.data ?? []

  type YearlyRpcRow = { year: number; total_quantity: number; total_defect_quantity: number; defect_rate: number }
  const currentYear = new Date().getFullYear()
  const yearlyData = ((yearlyRes.data as YearlyRpcRow[] | null) ?? [])
    .filter((d) => d.year >= 2022 && d.year <= currentYear)
    .sort((a, b) => a.year - b.year)
    .map((d) => ({ year: d.year, defect_rate: d.defect_rate ?? 0, total_quantity: d.total_quantity, total_defect_quantity: d.total_defect_quantity }))

  const seasonMap = new Map<string, { qty: number; defectQty: number }>()
  for (const item of items) {
    const round = Array.isArray(item.inspection_rounds) ? item.inspection_rounds[0] : item.inspection_rounds
    const season = round?.season_code
    if (!season) continue
    const prev = seasonMap.get(season) ?? { qty: 0, defectQty: 0 }
    seasonMap.set(season, { qty: prev.qty + (item.quantity_inspected ?? 0), defectQty: prev.defectQty + (item.defect_quantity ?? 0) })
  }
  if (seasonMap.size === 0 && plantings.length > 0) {
    for (const p of plantings) {
      const seasonKo = (p as unknown as Record<string, string | null>)['planting_season']
        ? SEASON_CODE_TO_KO[(p as unknown as Record<string, string>)['planting_season']]
        : null
      const season = resolveSeasonCode(seasonKo, p.planting_date)
      if (!season) continue
      const qty = safeNumZero(p.quantity_planted)
      const rate = p.expected_defect_rate ?? 0
      const defectQty = safeNumZero(p.expected_defect_qty) || Math.round(qty * rate)
      const prev = seasonMap.get(season) ?? { qty: 0, defectQty: 0 }
      seasonMap.set(season, { qty: prev.qty + qty, defectQty: prev.defectQty + defectQty })
    }
  }
  const seasonData = SEASON_ORDER
    .filter((s) => seasonMap.has(s))
    .map((s) => { const { qty, defectQty } = seasonMap.get(s)!; return { label: s, defect_rate: qty > 0 ? defectQty / qty : 0 } })

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
    const rate = p.expected_defect_rate != null ? p.expected_defect_rate : null
    if (rate === null) continue
    const defectQty = safeNumZero(p.expected_defect_qty) || Math.round(qty * rate)
    if (!heatmapBuckets.has(spName)) heatmapBuckets.set(spName, {})
    const spBuckets = heatmapBuckets.get(spName)!
    if (!spBuckets[season]) spBuckets[season] = { qty: 0, defectQty: 0 }
    spBuckets[season].qty += qty
    spBuckets[season].defectQty += defectQty
  }
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
      return { name, avgRate, inspected: totalQty, ...seasonRates } as HeatmapData
    })
    .filter((d) => d.avgRate > 0)
    .sort((a, b) => b.avgRate - a.avgRate)
    .slice(0, 20)

  let contractorData: { name: string; defect_rate: number; total_quantity: number }[] = []
  if (contractorRes.data && contractorRes.data.length > 0) {
    contractorData = contractorRes.data.map((d) => {
      const c = Array.isArray(d.contractors) ? d.contractors[0] : d.contractors
      return { name: c?.contractor_name ?? '알 수 없음', defect_rate: d.defect_rate ?? 0, total_quantity: d.total_quantity }
    })
  } else {
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

  const siteMap = new Map<string, { name: string; inspected: number; defect: number }>()
  for (const item of items) {
    const sid = item.site_id as string
    if (!sid) continue
    const prev = siteMap.get(sid) ?? { name: sid, inspected: 0, defect: 0 }
    siteMap.set(sid, { name: prev.name, inspected: prev.inspected + (item.quantity_inspected ?? 0), defect: prev.defect + (item.defect_quantity ?? 0) })
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

  const spMap = new Map<string, { inspected: number; defect: number }>()
  for (const p of plantings) {
    const sp = Array.isArray(p.species) ? p.species[0] : p.species
    const name = sp?.species_name_ko ?? '알 수 없음'
    const qty = p.quantity_planted ?? 0
    const defectQty = p.expected_defect_qty ?? Math.round(qty * (p.expected_defect_rate ?? 0))
    const prev = spMap.get(name) ?? { inspected: 0, defect: 0 }
    spMap.set(name, { inspected: prev.inspected + qty, defect: prev.defect + defectQty })
  }
  const speciesDataAnalytics = [...spMap.entries()]
    .map(([name, v]) => ({ name, defect_rate: v.inspected > 0 ? v.defect / v.inspected : 0, inspected: v.inspected, defect: v.defect }))
    .sort((a, b) => b.defect_rate - a.defect_rate)

  const reserveMap = new Map<string, { name: string; reserve_cost: number; qty: number; defect_qty: number; site_id: string }>()
  for (const p of plantings) {
    const sid = p.site_id as string
    if (!sid || !p.expected_reserve_cost) continue
    const prev = reserveMap.get(sid) ?? { name: sid, reserve_cost: 0, qty: 0, defect_qty: 0, site_id: sid }
    reserveMap.set(sid, { ...prev, reserve_cost: prev.reserve_cost + (p.expected_reserve_cost ?? 0), qty: prev.qty + (p.quantity_planted ?? 0), defect_qty: prev.defect_qty + (p.expected_defect_qty ?? 0) })
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
    .map((v) => ({ name: v.name, reserve_cost: v.reserve_cost, defect_rate: v.qty > 0 ? v.defect_qty / v.qty : 0, risk_level: riskLabel(v.qty > 0 ? v.defect_qty / v.qty : 0) }))
    .sort((a, b) => b.reserve_cost - a.reserve_cost)

  const summary = plantingSummaryRes.data as { total_planted: number; total_defect: number; high_risk_species: number; mid_risk_species: number; low_risk_species: number } | null
  const totalPlanted = summary?.total_planted ?? plantings.reduce((s, p) => s + (p.quantity_planted ?? 0), 0)
  const totalPlantDefect = summary?.total_defect ?? plantings.reduce((s, p) => {
    const qty = p.quantity_planted ?? 0
    return s + (p.expected_defect_qty ?? Math.round(qty * (p.expected_defect_rate ?? 0)))
  }, 0)
  const overallRate = totalPlanted > 0 ? totalPlantDefect / totalPlanted : null
  const totalReserveCost = siteReserveData.reduce((s, v) => s + v.reserve_cost, 0)

  const analytics: AnalyticsProps = {
    yearlyData, seasonData, contractorData, siteData,
    speciesData: speciesDataAnalytics,
    siteReserveData, totalReserveCost, heatmapData,
    totalPlanted, totalPlantDefect, overallRate,
    hasPlantingAnalysis: plantings.length > 0,
  }

  return (
    <DashboardTabsClient
      sites={sites}
      substitutions={substitutions}
      speciesAvgRate={speciesAvgRate}
      altRecs={altRecs}
      analytics={analytics}
    />
  )
}
