'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Image from 'next/image'
import * as XLSX from 'xlsx'
import {
  RefreshCw, Upload, Settings, Search, Sparkles, ChevronDown,
  TrendingDown, TreePine, Leaf, AlertTriangle, Target,
} from 'lucide-react'
import { uploadSubstitutions } from '@/app/actions/substitution'
import { resolveSeasonCode, SEASON_CODE_TO_KO, SEASON_ORDER } from '@/lib/season-utils'

export type SiteOption = {
  id: string
  site_name: string
  site_code: string
  region: string | null
  occupancy_date: string | null
  org_name: string | null
}

export type PlantingRow = {
  id: string
  species_name: string | null
  quantity_planted: number
  unit_price: number | null
  expected_defect_rate: number | null
  expected_defect_qty: number | null
  expected_reserve_cost: number | null
  risk_level: string | null
  planting_season: string | null
  planting_date: string | null
  contractor_name: string | null
  notes: string | null
}

export type SubstitutionMap = {
  original_species_name: string
  substitute_species_name: string
  improved_defect_rate: number
}

type Props = {
  sites: SiteOption[]
  substitutions: SubstitutionMap[]
  speciesAvgRate: Record<string, number>  // 전체 데이터 기준 수종별 평균 하자율
}

function riskConfig(rate: number | null) {
  if (rate === null) return { label: '-', color: 'text-gray-400', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' }
  if (rate >= 0.20) return { label: '고위험', color: 'text-red-600', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  if (rate >= 0.10) return { label: '중위험', color: 'text-orange-500', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' }
  return { label: '저위험', color: 'text-green-600', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
}

export function SimulationClient({ sites, substitutions, speciesAvgRate }: Props) {
  const subFileInputRef = useRef<HTMLInputElement>(null)

  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id ?? '')
  const [codeInput, setCodeInput] = useState(sites[0]?.site_code ?? '')
  const [nameInput, setNameInput] = useState(sites[0]?.site_name ?? '')
  const [codeDropdownOpen, setCodeDropdownOpen] = useState(false)
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const [siteRows, setSiteRows] = useState<PlantingRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [selectedSubstitutes, setSelectedSubstitutes] = useState<Record<string, string>>({})
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (!selectedSiteId) return
    setLoadingRows(true)
    setSiteRows([])
    setSelectedSubstitutes({})
    fetch(`/api/plantings-by-site?site_id=${selectedSiteId}`)
      .then((r) => r.json())
      .then((data: PlantingRow[]) => {
        const mapped = data.map((r) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const species = Array.isArray((r as any).species) ? (r as any).species[0] : (r as any).species
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const contractor = Array.isArray((r as any).contractors) ? (r as any).contractors[0] : (r as any).contractors
          return {
            ...r,
            species_name: species?.species_name_ko ?? null,
            contractor_name: contractor?.contractor_name ?? null,
          }
        })
        setSiteRows(mapped)
      })
      .catch(() => setSiteRows([]))
      .finally(() => setLoadingRows(false))
  }, [selectedSiteId])

  const codeMatches = useMemo(
    () => sites.filter((s) => s.site_code.toLowerCase().includes(codeInput.toLowerCase())),
    [sites, codeInput]
  )
  const nameMatches = useMemo(
    () => sites.filter((s) => s.site_name.toLowerCase().includes(nameInput.toLowerCase())),
    [sites, nameInput]
  )

  function selectSite(s: SiteOption) {
    setSelectedSiteId(s.id)
    setCodeInput(s.site_code)
    setNameInput(s.site_name)
    setCodeDropdownOpen(false)
    setNameDropdownOpen(false)
  }

  // DB 등록 대체수종 맵
  const dbSubMap = useMemo(() => {
    const map = new Map<string, { name: string; rate: number }[]>()
    for (const s of substitutions) {
      const list = map.get(s.original_species_name) ?? []
      list.push({ name: s.substitute_species_name, rate: s.improved_defect_rate })
      map.set(s.original_species_name, list)
    }
    return map
  }, [substitutions])

  // 현장 내 저위험 수종을 고위험/중위험 수종의 대체 후보로 자동 추천
  const subMap = useMemo(() => {
    const map = new Map<string, { name: string; rate: number; isAuto?: boolean }[]>()

    // DB 등록 데이터 우선 반영 (하자율 낮은 순 상위 3개)
    for (const [k, v] of dbSubMap) {
      const sorted = [...v].sort((a, b) => a.rate - b.rate).slice(0, 3)
      map.set(k, sorted.map((s) => ({ ...s, isAuto: false })))
    }

    // 현장 내 저위험 수종 목록 (하자율 0 초과인 수종만, 중복 제거)
    const lowRiskSpecies = Array.from(
      new Map(
        siteRows
          .filter((r) => r.species_name && r.risk_level === '저위험' && r.expected_defect_rate != null)
          .map((r) => [r.species_name!, { name: r.species_name!, rate: r.expected_defect_rate! }])
      ).values()
    ).sort((a, b) => a.rate - b.rate)  // 하자율 낮은 순

    // 고위험/중위험 수종에 DB 등록 없으면 자동 추천 상위 3개 추가
    for (const r of siteRows) {
      if (!r.species_name) continue
      if (r.risk_level !== '고위험' && r.risk_level !== '중위험') continue
      if (map.has(r.species_name) && map.get(r.species_name)!.length > 0) continue
      const candidates = lowRiskSpecies.filter((s) => s.name !== r.species_name).slice(0, 3)
      if (candidates.length > 0) {
        map.set(r.species_name, candidates.map((s) => ({ ...s, isAuto: true })))
      }
    }

    return map
  }, [dbSubMap, siteRows])

  const tableRows = useMemo(() => {
    return siteRows.map((r) => {
      const speciesName = r.species_name ?? ''
      const substituteName = selectedSubstitutes[speciesName] ?? null
      const substituteOptions = subMap.get(speciesName) ?? []
      const selectedSub = substituteOptions.find((s) => s.name === substituteName)
      const originalRate = r.expected_defect_rate
      const improvedRate = selectedSub?.rate ?? null
      const reduction = originalRate != null && improvedRate != null ? originalRate - improvedRate : null
      const improvedDefectQty = improvedRate != null ? Math.round(r.quantity_planted * improvedRate) : null
      // 개선 후 예상 하자 관리비용: 단가 × 개선 후 하자수량
      const improvedReserveCost = r.unit_price != null && improvedDefectQty != null
        ? r.unit_price * improvedDefectQty
        : null
      return { ...r, speciesName, substituteOptions, selectedSubstituteName: substituteName, improvedRate, reduction, improvedDefectQty, improvedReserveCost }
    })
  }, [siteRows, selectedSubstitutes, subMap])

  const originalTotalQty = siteRows.reduce((s, r) => s + r.quantity_planted, 0)

  const originalWeightedRate = useMemo(() => {
    const withRate = siteRows.filter((r) => r.expected_defect_rate != null)
    const totalQty = withRate.reduce((s, r) => s + r.quantity_planted, 0)
    if (totalQty === 0) return null
    return withRate.reduce((s, r) => s + r.expected_defect_rate! * r.quantity_planted, 0) / totalQty
  }, [siteRows])

  const improvedWeightedRate = useMemo(() => {
    // 분모를 기존과 동일하게 expected_defect_rate가 있는 전체 수량으로 통일
    const rows = tableRows.filter((r) => r.expected_defect_rate != null)
    const totalQty = rows.reduce((s, r) => s + r.quantity_planted, 0)
    if (totalQty === 0) return null
    return rows.reduce((s, r) => {
      // 대체 수종이 선택된 행만 개선율 적용, 나머지는 기존 하자율 유지
      const rate = r.improvedRate != null ? r.improvedRate : r.expected_defect_rate!
      return s + rate * r.quantity_planted
    }, 0) / totalQty
  }, [tableRows])

  const reductionEffect = originalWeightedRate != null && improvedWeightedRate != null
    ? originalWeightedRate - improvedWeightedRate : null

  // 비용 집계
  const originalTotalCost = siteRows.reduce((s, r) => s + (r.expected_reserve_cost ?? 0), 0)
  // 개선 후 비용: 대체 선택된 행은 improvedReserveCost, 나머지는 기존 비용
  const improvedTotalCost = useMemo(() => {
    const hasAnySubstitute = tableRows.some((r) => r.improvedReserveCost != null)
    if (!hasAnySubstitute) return null
    return tableRows.reduce((s, r) => {
      if (r.improvedReserveCost != null) return s + r.improvedReserveCost
      return s + (r.expected_reserve_cost ?? 0)
    }, 0)
  }, [tableRows])
  const costReduction = originalTotalCost > 0 && improvedTotalCost != null
    ? originalTotalCost - improvedTotalCost : null

  // 수종명 기준 중복 제거 후 리스크 집계
  const riskCounts = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of siteRows) {
      const key = r.species_name ?? `__no_name_${r.id}`
      if (!seen.has(key) && r.risk_level) seen.set(key, r.risk_level)
    }
    let high = 0, mid = 0, low = 0
    for (const level of seen.values()) {
      if (level === '고위험') high++
      else if (level === '중위험') mid++
      else if (level === '저위험') low++
    }
    return { high, mid, low }
  }, [siteRows])

  // 수종명 기준 중복 제거 후 대체 추천 가능 수종 수 집계
  const substituteAvailableCount = useMemo(() => {
    const uniqueSpecies = new Set(
      siteRows.map((r) => r.species_name).filter((n): n is string => !!n)
    )
    return [...uniqueSpecies].filter((name) => subMap.has(name)).length
  }, [siteRows, subMap])

  const contractorNames = useMemo(() => {
    const names = siteRows.map((r) => r.contractor_name).filter((n): n is string => !!n)
    return [...new Set(names)]
  }, [siteRows])

  // AI 분석 상태
  const [aiAnalysis, setAiAnalysis] = useState<{
    riskLevel: string
    recommendReason: string
    effectSummary: string
    actionGuide: string
    seasonalImpact: string
    seasonStats: { season: string; rate: number; qty: number; label: string }[]
  } | null>(null)
  const [aiGenerating, setAiGenerating] = useState(false)

  // 대체 수종 선택이 변경될 때마다 AI 분석 자동 업데이트 (최신 집계값 반영)
  useEffect(() => {
    if (!aiAnalysis) return
    computeAiAnalysis()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [improvedWeightedRate, reductionEffect, costReduction])

  function computeAiAnalysis() {
    if (siteRows.length === 0) return

    // 수종명 기준 중복 제거 (동일 수종 여러 행 → 수량 합산, 하자율 수량 가중 평균)
    const speciesAgg = new Map<string, { qty: number; defectSum: number; risk: string | null; season: string | null }>()
    for (const r of siteRows) {
      const key = r.species_name ?? `__no_name_${r.id}`
      const prev = speciesAgg.get(key) ?? { qty: 0, defectSum: 0, risk: r.risk_level, season: r.planting_season }
      speciesAgg.set(key, {
        qty: prev.qty + r.quantity_planted,
        defectSum: prev.defectSum + (r.expected_defect_rate ?? 0) * r.quantity_planted,
        risk: prev.risk ?? r.risk_level,
        season: prev.season ?? r.planting_season,
      })
    }
    const uniqueSpecies = Array.from(speciesAgg.entries()).map(([name, v]) => ({
      name,
      qty: v.qty,
      rate: v.qty > 0 ? v.defectSum / v.qty : 0,
      risk: v.risk,
      season: v.season,
    }))

    // 현재 선택된 대체 수종 반영 후 하자율 계산
    const selectedEntries = Object.entries(selectedSubstitutes).filter(([, v]) => !!v)
    const hasSelection = selectedEntries.length > 0

    // 위험도: 현재 선택 적용 후 가중평균 하자율로 리스크 수준 판정
    const currentRate = improvedWeightedRate ?? originalWeightedRate
    let riskLevel = ''
    if (currentRate == null) {
      riskLevel = '데이터가 부족하여 위험도를 판정할 수 없습니다.'
    } else if (hasSelection) {
      const level = currentRate >= 0.20 ? '고위험' : currentRate >= 0.10 ? '중위험' : '저위험'
      riskLevel = `대체 수종 적용 후 전체 예상 하자율 ${(currentRate * 100).toFixed(2)}% — ${level} 수준입니다.`
    } else {
      const level = currentRate >= 0.20 ? '고위험' : currentRate >= 0.10 ? '중위험' : '저위험'
      riskLevel = `현재 전체 예상 하자율 ${(currentRate * 100).toFixed(2)}% — ${level} 수준입니다.`
    }

    // 추천 사유: 선택된 수종별 개선 근거 또는 미선택 고위험 수종 안내
    let recommendReason = ''
    if (hasSelection) {
      const lines = selectedEntries.map(([origName, subName]) => {
        const origRow = uniqueSpecies.find((s) => s.name === origName)
        const subOpts = subMap.get(origName) ?? []
        const subOpt = subOpts.find((s) => s.name === subName)
        if (!origRow || !subOpt) return null
        const diff = origRow.rate - subOpt.rate
        return `${origName}(${(origRow.rate * 100).toFixed(1)}%) → ${subName}(${(subOpt.rate * 100).toFixed(1)}%): ${(diff * 100).toFixed(1)}%p 개선`
      }).filter((l): l is string => !!l)
      recommendReason = lines.length > 0
        ? lines.join('  /  ')
        : '선택된 대체 수종의 하자율 데이터가 없습니다.'
    } else {
      const highMid = uniqueSpecies.filter((s) => (s.risk === '고위험' || s.risk === '중위험') && subMap.has(s.name))
      if (highMid.length > 0) {
        recommendReason = `${highMid.slice(0, 3).map((s) => s.name).join(', ')} 등 ${highMid.length}종에 대체 수종 후보가 있습니다. 하단 테이블에서 선택하면 실시간 절감 효과를 확인할 수 있습니다.`
      } else {
        recommendReason = '고위험·중위험 수종에 대한 대체 후보가 없습니다. 대체수종 등록 메뉴를 통해 등록하세요.'
      }
    }

    // 예상 절감 효과: 현재 선택 기준 실제 절감율/절감액
    let effectSummary = ''
    if (hasSelection && reductionEffect != null && reductionEffect > 0) {
      const reducedQty = Math.round((originalWeightedRate ?? 0) * originalTotalQty) - Math.round((improvedWeightedRate ?? 0) * originalTotalQty)
      effectSummary = `현재 선택 기준 하자율 ${(reductionEffect * 100).toFixed(2)}%p 절감 (예상 하자수량 ${reducedQty}주 감소)`
      if (costReduction != null && costReduction > 0) {
        effectSummary += ` / 하자 관리비용 ₩${costReduction.toLocaleString()} 절감`
      }
    } else if (hasSelection) {
      effectSummary = '선택된 대체 수종의 하자율이 원수종보다 높거나 동일합니다. 다른 수종을 선택해보세요.'
    } else {
      const highMidSpecies = uniqueSpecies.filter((s) => s.risk === '고위험' || s.risk === '중위험')
      const withSub = highMidSpecies.filter((s) => subMap.has(s.name))
      const totalAllQty = uniqueSpecies.reduce((s, r) => s + r.qty, 0)
      const improvedSum = uniqueSpecies.reduce((s, r) => {
        if (r.risk === '고위험' || r.risk === '중위험') {
          const opts = subMap.get(r.name) ?? []
          if (opts.length > 0) {
            const best = opts.reduce((a, b) => a.rate < b.rate ? a : b)
            return s + best.rate * r.qty
          }
        }
        return s + r.rate * r.qty
      }, 0)
      const avgOriginal = totalAllQty > 0 ? uniqueSpecies.reduce((s, r) => s + r.rate * r.qty, 0) / totalAllQty : 0
      const avgImproved = totalAllQty > 0 ? improvedSum / totalAllQty : null
      const effectPct = avgImproved != null ? ((avgOriginal - avgImproved) * 100).toFixed(1) : null
      if (highMidSpecies.length === 0) {
        effectSummary = '고위험·중위험 수종이 없어 대체 검토가 필요하지 않습니다.'
      } else if (effectPct != null && Number(effectPct) > 0) {
        effectSummary = `최적 대체 수종 일괄 적용 시 전체 평균 하자율 약 ${effectPct}%p 개선 가능 (${withSub.length}/${highMidSpecies.length}종 대체 후보 있음)`
      } else {
        effectSummary = `고위험·중위험 ${highMidSpecies.length}종이 확인됩니다. 대체 수종 등록 후 절감 효과를 분석할 수 있습니다.`
      }
    }

    // 권장 조치: 미선택 고위험 수종 권고
    let actionGuide = ''
    const unselectedHighRisk = uniqueSpecies.filter((s) => {
      if (s.risk !== '고위험' && s.risk !== '중위험') return false
      if (selectedSubstitutes[s.name]) return false
      return true
    })
    if (unselectedHighRisk.length === 0 && hasSelection) {
      actionGuide = '모든 고위험·중위험 수종에 대체 수종이 선택되었습니다. 선택 내용을 검토 후 현장에 적용하세요.'
    } else if (unselectedHighRisk.length > 0) {
      const urgent = unselectedHighRisk.filter((s) => s.risk === '고위험').slice(0, 3)
      const mid = unselectedHighRisk.filter((s) => s.risk === '중위험').slice(0, 2)
      const parts: string[] = []
      if (urgent.length > 0) parts.push(`즉시 교체 검토 필요: ${urgent.map((s) => s.name).join(', ')}`)
      if (mid.length > 0) parts.push(`모니터링 강화: ${mid.map((s) => s.name).join(', ')}`)
      actionGuide = parts.join(' / ')
      if (unselectedHighRisk.length > 5) actionGuide += ` 외 ${unselectedHighRisk.length - 5}종`
    } else {
      const { high: highCount, mid: midCount, low: lowCount } = riskCounts
      const totalSpeciesCount = highCount + midCount + lowCount
      if (highCount === 0 && midCount === 0) {
        actionGuide = `전 수종 저위험(${lowCount}종) — 정기 점검 위주로 관리하십시오.`
      } else {
        actionGuide = `고위험 ${highCount}종·중위험 ${midCount}종에 대한 대체 수종 선택을 권장합니다. 저위험 ${lowCount}종(${totalSpeciesCount > 0 ? (lowCount / totalSpeciesCount * 100).toFixed(0) : 0}%)은 정기 점검으로 유지하십시오.`
      }
    }

    // 식재 시기 영향 분석 (버튼 클릭 시에만 계산)
    const rowsWithSeason = siteRows.map((r) => ({
      ...r,
      resolvedSeason: resolveSeasonCode(
        r.planting_season ? SEASON_CODE_TO_KO[r.planting_season] : null,
        r.planting_date,
      ),
    }))
    const seasonBuckets: Record<string, { qty: number; defectQty: number; species: Map<string, { qty: number; defectQty: number }> }> = {}
    for (const r of rowsWithSeason) {
      if (!r.resolvedSeason || r.expected_defect_rate == null) continue
      const s = r.resolvedSeason
      if (!seasonBuckets[s]) seasonBuckets[s] = { qty: 0, defectQty: 0, species: new Map() }
      const rowDefectQty = r.expected_defect_qty ?? Math.round(r.quantity_planted * r.expected_defect_rate)
      seasonBuckets[s].qty += r.quantity_planted
      seasonBuckets[s].defectQty += rowDefectQty
      const spName = r.species_name ?? '알 수 없음'
      const prev = seasonBuckets[s].species.get(spName) ?? { qty: 0, defectQty: 0 }
      seasonBuckets[s].species.set(spName, { qty: prev.qty + r.quantity_planted, defectQty: prev.defectQty + rowDefectQty })
    }
    const seasonStats = SEASON_ORDER
      .filter((k) => seasonBuckets[k])
      .map((k) => {
        const v = seasonBuckets[k]
        const rate = v.qty > 0 ? v.defectQty / v.qty : 0
        const topSpecies = Array.from(v.species.entries())
          .map(([name, sv]) => ({ name, rate: sv.qty > 0 ? sv.defectQty / sv.qty : 0 }))
          .sort((a, b) => b.rate - a.rate)
          .slice(0, 2)
          .map((s) => s.name)
        return { season: k, label: SEASON_CODE_TO_KO[k] ?? k, rate, qty: v.qty, topSpecies }
      })
    const sortedByRate = [...seasonStats].sort((a, b) => b.rate - a.rate)
    const overallRate = originalTotalQty > 0
      ? siteRows.reduce((s, r) => s + (r.expected_defect_rate ?? 0) * r.quantity_planted, 0) / originalTotalQty
      : 0
    let seasonalImpact: string
    if (seasonStats.length === 0) {
      seasonalImpact = '식재일자 또는 계절(수식) 데이터가 없어 식재 시기별 분석을 수행할 수 없습니다.'
    } else if (sortedByRate.length === 1) {
      const s = sortedByRate[0]
      const diff = ((s.rate - overallRate) * 100).toFixed(1)
      seasonalImpact = `${s.label} 식재 수목의 하자율(${(s.rate * 100).toFixed(1)}%)이 전체 평균(${(overallRate * 100).toFixed(1)}%) 대비 ${Number(diff) >= 0 ? diff + '%p 높게' : Math.abs(Number(diff)) + '%p 낮게'} 나타났습니다.` +
        (s.topSpecies.length > 0 ? ` ${s.topSpecies.join('과 ')}에서 집중적으로 발생했습니다.` : '')
    } else {
      const worst = sortedByRate[0]
      const best = sortedByRate[sortedByRate.length - 1]
      const diff = ((worst.rate - overallRate) * 100).toFixed(1)
      seasonalImpact = `${worst.label} 식재 수목의 하자율이 가장 높으며, 전체 평균 대비 ${diff}%p 높게 나타났습니다.` +
        (worst.topSpecies.length > 0 ? ` ${worst.topSpecies.join('과 ')}에서 집중적으로 발생했습니다.` : '') +
        ` ${best.label} 식재(${(best.rate * 100).toFixed(1)}%) 대비 ${((worst.rate - best.rate) * 100).toFixed(1)}%p 차이로, 식재 시기 조정을 검토하십시오.`
    }

    setAiAnalysis({ riskLevel, recommendReason, effectSummary, actionGuide, seasonalImpact, seasonStats })
  }

  function generateAiAnalysis() {
    if (siteRows.length === 0) return
    setAiGenerating(true)
    setAiAnalysis(null)
    setTimeout(() => {
      computeAiAnalysis()
      setAiGenerating(false)
    }, 800)
  }

  async function handleSubFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setUploadStatus(null)
    try {
      const ab = await file.arrayBuffer()
      const bytes = new Uint8Array(ab)
      let binary = ''
      bytes.forEach((b) => (binary += String.fromCharCode(b)))
      const base64 = btoa(binary)
      const result = await uploadSubstitutions(base64)
      setUploadStatus({
        type: result.success ? 'success' : 'error',
        msg: result.success
          ? `${result.successCount}건 업로드 완료`
          : `업로드 실패: ${result.errors.slice(0, 3).join(', ')}`,
      })
      if (result.success) setTimeout(() => window.location.reload(), 1200)
    } catch {
      setUploadStatus({ type: 'error', msg: '파일 처리 중 오류가 발생했습니다.' })
    } finally {
      setIsUploading(false)
      if (subFileInputRef.current) subFileInputRef.current.value = ''
    }
  }

  function handleExportTemplate() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['원수종명', '대체수종명', '개선하자율(%)'],
      ['서양측백', '느티나무', 15.0],
    ])
    XLSX.utils.book_append_sheet(wb, ws, '대체수종매핑')
    XLSX.writeFile(wb, '대체수종매핑_양식.xlsx')
  }

  return (
    <div className="space-y-0 -m-6">
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">조경 AI플랫폼 대시보드</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateAiAnalysis}
            disabled={aiGenerating || siteRows.length === 0}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Sparkles className={`h-3.5 w-3.5 ${aiGenerating ? 'animate-spin' : ''}`} />
            {aiGenerating ? '분석 중...' : 'AI 분석 생성'}
          </button>
          <button onClick={handleExportTemplate} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors">
            <Upload className="h-3.5 w-3.5" />파일 내보내기
          </button>
          <button onClick={() => window.location.reload()} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />새로고침
          </button>
          <button onClick={() => subFileInputRef.current?.click()} disabled={isUploading}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors disabled:opacity-50">
            <Settings className="h-3.5 w-3.5" />{isUploading ? '업로드 중...' : '대체수종 등록'}
          </button>
          <input ref={subFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleSubFileChange} />
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {uploadStatus && (
          <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center justify-between ${uploadStatus.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            <span>{uploadStatus.msg}</span>
            <button onClick={() => setUploadStatus(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}

        {/* 현장 기본 정보 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">현장 기본 정보</h2>
          <div className="flex gap-4">
            <div className="w-1/2 border rounded-lg overflow-visible bg-white">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-2.5 bg-gray-100 font-medium text-gray-500 w-24 text-xs">현장코드</td>
                    <td className="px-3 py-1.5 relative">
                      <div className="relative">
                        <input type="text" value={codeInput} placeholder="현장코드 입력"
                          onChange={(e) => { setCodeInput(e.target.value); setCodeDropdownOpen(true) }}
                          onFocus={() => setCodeDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setCodeDropdownOpen(false), 150)}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-green-500 focus:bg-white text-gray-700 placeholder-gray-400" />
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300 pointer-events-none" />
                        {codeDropdownOpen && codeMatches.length > 0 && (
                          <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {codeMatches.map((s) => (
                              <button key={s.id} onMouseDown={(e) => { e.preventDefault(); selectSite(s) }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 flex items-center gap-2">
                                <span className="font-mono text-gray-500 w-20 shrink-0">{s.site_code}</span>
                                <span className="text-gray-800">{s.site_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs border-l w-20">협력사</td>
                    <td className="px-4 py-2.5 text-gray-900 text-xs">
                      {contractorNames.length > 0 ? contractorNames.join(' · ') : <span className="text-gray-400">-</span>}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 bg-gray-100 font-medium text-gray-500 text-xs">현장명</td>
                    <td className="px-3 py-1.5 relative" colSpan={3}>
                      <div className="relative">
                        <input type="text" value={nameInput} placeholder="현장명 입력"
                          onChange={(e) => { setNameInput(e.target.value); setNameDropdownOpen(true) }}
                          onFocus={() => setNameDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setNameDropdownOpen(false), 150)}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-green-500 focus:bg-white text-gray-700 placeholder-gray-400" />
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300 pointer-events-none" />
                        {nameDropdownOpen && nameMatches.length > 0 && (
                          <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {nameMatches.map((s) => (
                              <button key={s.id} onMouseDown={(e) => { e.preventDefault(); selectSite(s) }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 flex items-center gap-2">
                                <span className="text-gray-800 font-medium">{s.site_name}</span>
                                <span className="font-mono text-gray-400">{s.site_code}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* KPI 카드 3개 */}
            <div className="flex-1 grid grid-cols-3 gap-3">
              <div className="border rounded-lg bg-white px-4 py-3">
                <div className="text-xs text-gray-500 mb-1">기존 예상 하자율</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-2xl font-bold text-gray-900">
                    {originalWeightedRate != null ? (originalWeightedRate * 100).toFixed(2) + '%' : '-'}
                  </div>
                  {originalWeightedRate != null && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${riskConfig(originalWeightedRate).badge}`}>
                      {riskConfig(originalWeightedRate).label}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  예상 하자수량 {siteRows.reduce((s, r) => s + (r.expected_defect_qty ?? 0), 0)} 주
                </div>
              </div>
              <div className="border rounded-lg bg-white px-4 py-3">
                <div className="text-xs text-gray-500 mb-1">개선 후 예상 하자율 <span className="text-green-600">(대체 적용 시)</span></div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-2xl font-bold text-gray-900">
                    {improvedWeightedRate != null ? (improvedWeightedRate * 100).toFixed(2) + '%' : '-'}
                  </div>
                  {improvedWeightedRate != null && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">개선 후</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  예상 하자수량 {tableRows.reduce((s, r) => s + (r.improvedDefectQty ?? r.expected_defect_qty ?? 0), 0)} 주
                </div>
              </div>
              <div className="border rounded-lg bg-white px-4 py-3">
                <div className="text-xs text-gray-500 mb-1">절감 효과(%)</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {reductionEffect != null && reductionEffect > 0 ? (
                    <>
                      <TrendingDown className="h-5 w-5 text-green-500" />
                      <span className="text-2xl font-bold text-green-600">{(reductionEffect * 100).toFixed(2)}%p</span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-gray-400">-</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {reductionEffect != null && reductionEffect > 0
                    ? `예상 하자수량 ${Math.round((originalWeightedRate ?? 0) * originalTotalQty) - Math.round((improvedWeightedRate ?? 0) * originalTotalQty)} 주 감소`
                    : '대체 수종 선택 시 계산'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 전체 리스크 요약 */}
        <div className="border rounded-lg bg-white px-4 py-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-600">전체 리스크 요약</span>
            <div className="flex items-center gap-1.5 ml-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                고위험 ≥ 20%
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                중위험 10~19%
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                저위험 &lt; 10%
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="border border-red-200 rounded-lg px-4 py-2 text-center">
              <div className="text-xs text-red-500 font-medium">고위험 수종</div>
              <div className="text-xl font-bold text-red-600">{riskCounts.high} <span className="text-sm font-normal">종</span></div>
            </div>
            <div className="border border-orange-200 rounded-lg px-4 py-2 text-center">
              <div className="text-xs text-orange-500 font-medium">중위험 수종</div>
              <div className="text-xl font-bold text-orange-500">{riskCounts.mid} <span className="text-sm font-normal">종</span></div>
            </div>
            <div className="border border-green-200 rounded-lg px-4 py-2 text-center">
              <div className="text-xs text-green-600 font-medium">저위험 수종</div>
              <div className="text-xl font-bold text-green-600">{riskCounts.low} <span className="text-sm font-normal">종</span></div>
            </div>
            <div className="border border-blue-200 rounded-lg px-4 py-2 text-center">
              <div className="text-xs text-blue-600 font-medium">대체 추천 가능 수종</div>
              <div className="text-xl font-bold text-blue-600">{substituteAvailableCount} <span className="text-sm font-normal">종</span></div>
            </div>
          </div>
        </div>

        {/* AI 분석 요약 */}
        <div className="border rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center gap-2">
            <Sparkles className={`h-4 w-4 ${aiAnalysis ? 'text-green-500' : 'text-gray-400'}`} />
            <span className="text-sm font-semibold text-gray-700">AI 분석 요약</span>
            {!aiAnalysis && !aiGenerating && (
              <span className="text-xs text-gray-400 ml-1">(AI 분석 생성 버튼 클릭 후 활성화 — 대체 수종 선택 시 자동 업데이트)</span>
            )}
            {aiGenerating && (
              <span className="text-xs text-blue-500 ml-1 animate-pulse">분석 생성 중...</span>
            )}
            {aiAnalysis && (
              <span className="text-xs text-green-600 ml-1">분석 완료 (대체 수종 변경 시 자동 갱신)</span>
            )}
          </div>
          <div className="grid grid-cols-4 divide-x text-xs">
            {/* 위험도 */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-orange-500' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>위험도</span>
              </div>
              {aiGenerating ? (
                <div className="space-y-1.5">
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                </div>
              ) : aiAnalysis ? (
                <p className="text-gray-700 leading-relaxed">{aiAnalysis.riskLevel}</p>
              ) : (
                <p className="text-gray-400 leading-relaxed">대체 수종 선택 결과를 반영한 현재 위험도를 표시합니다.</p>
              )}
            </div>

            {/* 추천 사유 */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-blue-500' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>추천 사유</span>
              </div>
              {aiGenerating ? (
                <div className="space-y-1.5">
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-3/5" />
                </div>
              ) : aiAnalysis ? (
                <p className="text-gray-700 leading-relaxed">{aiAnalysis.recommendReason}</p>
              ) : (
                <p className="text-gray-400 leading-relaxed">선택된 대체 수종의 하자율 개선 근거를 제시합니다.</p>
              )}
            </div>

            {/* 예상 절감 효과 */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingDown className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-green-500' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>예상 절감 효과</span>
              </div>
              {aiGenerating ? (
                <div className="space-y-1.5">
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                </div>
              ) : aiAnalysis ? (
                <p className="text-gray-700 leading-relaxed">{aiAnalysis.effectSummary}</p>
              ) : (
                <p className="text-gray-400 leading-relaxed">현재 선택 기준 실제 절감율 및 절감액을 안내합니다.</p>
              )}
            </div>

            {/* 권장 조치 */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TreePine className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>권장 조치</span>
              </div>
              {aiGenerating ? (
                <div className="space-y-1.5">
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-3/5" />
                </div>
              ) : aiAnalysis ? (
                <p className="text-gray-700 leading-relaxed">{aiAnalysis.actionGuide}</p>
              ) : (
                <p className="text-gray-400 leading-relaxed">미선택 고위험 수종에 대한 권고 조치를 안내합니다.</p>
              )}
            </div>
          </div>

          {/* 식재 시기 영향 분석 — 하단 확장 영역 */}
          {(aiAnalysis || aiGenerating) && (
            <div className="border-t px-4 py-3 text-xs">
              <div className="flex items-center gap-1.5 mb-2">
                <Leaf className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-green-500' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>식재 시기 영향 분석</span>
              </div>
              {aiGenerating ? (
                <div className="flex gap-8">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                    <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                  </div>
                  <div className="space-y-1.5 w-48">
                    <div className="h-3 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>
              ) : aiAnalysis ? (
                <div className="flex gap-8 items-start">
                  <p className="text-gray-700 leading-relaxed flex-1">{aiAnalysis.seasonalImpact}</p>
                  {aiAnalysis.seasonStats.length > 0 && (
                    <div className="space-y-1.5 w-52 shrink-0">
                      {(() => {
                        const maxRate = Math.max(...aiAnalysis.seasonStats.map((s) => s.rate), 0.001)
                        const ORDER = ['spring', 'summer', 'fall', 'winter']
                        const sorted = [...aiAnalysis.seasonStats].sort(
                          (a, b) => ORDER.indexOf(a.season) - ORDER.indexOf(b.season)
                        )
                        return sorted.map((s) => (
                          <div key={s.season} className="flex items-center gap-2">
                            <span className="w-6 text-gray-500 shrink-0">{s.label}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                              <div
                                className={`h-3 rounded-full transition-all duration-500 ${s.rate === maxRate ? 'bg-red-400' : 'bg-green-400'}`}
                                style={{ width: `${Math.round((s.rate / maxRate) * 100)}%` }}
                              />
                            </div>
                            <span className={`w-10 text-right font-medium shrink-0 ${s.rate === maxRate ? 'text-red-600' : 'text-gray-600'}`}>
                              {(s.rate * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* 시뮬레이션 테이블 */}
        <div className="border rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">수종별 하자율 저감 시뮬레이션</span>
              <span className="text-xs text-gray-400">{loadingRows ? '데이터 불러오는 중...' : `총 ${tableRows.length}종`}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {[{ dot: 'bg-red-500', label: '고위험' }, { dot: 'bg-orange-400', label: '중위험' }, { dot: 'bg-green-500', label: '저위험' }, { dot: 'bg-gray-300', label: '유지 관리' }].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${item.dot}`} />
                  <span className="text-gray-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1a3a2a] text-white">
                  {['No.', '원수종', '수량 (주)', '하자율(현재기준)', '수목하자율', '리스크 등급', '대체 수종 선택', '개선 하자율', '저감 효과', '개선 후 예상 하자수량', '권장 조치', '세부 조치'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-gray-400">
                      {loadingRows ? '데이터 불러오는 중...' : '현장을 선택하면 수목 데이터가 표시됩니다.'}
                    </td>
                  </tr>
                ) : tableRows.map((row, idx) => {
                  const speciesAvgRateVal = row.speciesName && speciesAvgRate[row.speciesName] != null
                    ? speciesAvgRate[row.speciesName] : null
                  const risk = riskConfig(speciesAvgRateVal)
                  const isLowRisk = row.risk_level === '저위험'
                  const hasSubOptions = row.substituteOptions.length > 0
                  const speciesAvgRatePct = speciesAvgRateVal != null
                    ? (speciesAvgRateVal * 100).toFixed(2) + '%' : '-'
                  const originalRatePct = row.expected_defect_rate != null ? (row.expected_defect_rate * 100).toFixed(2) + '%' : '-'
                  const improvedRatePct = row.improvedRate != null ? (row.improvedRate * 100).toFixed(2) + '%' : '-'
                  const reductionPct = row.reduction != null && row.reduction > 0 ? '▼ ' + (row.reduction * 100).toFixed(2) + '%p' : '-'

                  return (
                    <tr key={row.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{row.speciesName || '-'}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.quantity_planted.toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-medium text-gray-700`}>{originalRatePct}</td>
                      <td className={`px-3 py-2 text-right font-medium ${risk.color}`}>{speciesAvgRatePct}</td>
                      <td className="px-3 py-2">
                        {row.expected_defect_rate != null ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${risk.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                            {risk.label}
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-2">
                        {isLowRisk || !hasSubOptions ? (
                          <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded">
                            {isLowRisk ? '유지 관리' : '등록된 대체수종 없음'}
                          </span>
                        ) : (
                          <div className="relative">
                            <select
                              value={row.selectedSubstituteName ?? ''}
                              onChange={(e) => setSelectedSubstitutes((prev) => ({ ...prev, [row.speciesName]: e.target.value }))}
                              className="text-xs border border-dashed border-gray-400 rounded px-2 py-1 pr-6 appearance-none bg-white focus:outline-none focus:border-green-500 min-w-[120px]"
                            >
                              <option value="">대체 수종 선택</option>
                              {row.substituteOptions.map((opt) => (
                                <option key={opt.name} value={opt.name}>
                                  {opt.isAuto ? '▷ ' : ''}{opt.name} ({(opt.rate * 100).toFixed(1)}%){opt.isAuto ? ' *추천' : ''}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-blue-600 font-medium">{improvedRatePct}</td>
                      <td className="px-3 py-2 text-right text-green-600 font-medium">{reductionPct}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {row.improvedDefectQty != null
                          ? `${row.improvedDefectQty} 주 (기존 ${row.expected_defect_qty ?? '-'}주)`
                          : row.expected_defect_qty != null ? `${row.expected_defect_qty} 주` : '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.selectedSubstituteName ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">대체 권장</span>
                        ) : isLowRisk ? (
                          <span className="px-2 py-0.5 rounded text-xs text-gray-400 bg-gray-100">유지 관리</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs text-gray-500 bg-gray-100">대체 수종 선택</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-400">{row.selectedSubstituteName ? '즉시 교체 검토' : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t text-xs text-gray-400 bg-gray-50">
            ※ 개선 하자율은 대체 수종의 기본 하자율을 기반으로 산출됩니다.
          </div>
        </div>
      </div>
    </div>
  )
}
