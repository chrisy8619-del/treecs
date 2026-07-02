/**
 * 시뮬레이터 "AI 분석 요약" 문구 생성 (훅/상태 의존 없는 순수 계산 모듈).
 *
 * 호출 주체 : simulation-client.tsx의 computeAiAnalysis 래퍼(집계값을 모아 호출,
 *             결과를 setAiAnalysis로 반영). AI 분석 생성 버튼·대체수종 변경 시 실행.
 * 반환/전송 : AiAnalysisResult(위험도/추천사유/절감효과/권장조치/계절영향 문구 + 계절통계)
 *             반환만. side effect 없음. siteRows가 비면 null.
 * 의존성   : @/lib/species-knowledge(mapRegion·getRecommendedSubstitutes),
 *             @/lib/season-utils, @/lib/substitute-recommender(후보 타입), ./simulation-types
 *
 * ⚠️ simulation-client.tsx의 computeAiAnalysis에서 동작 동일하게(회귀 무손실) 추출.
 *    LLM 미연동 — 규칙 기반 계산 + 입주계절별 고정 서술문. 문구·계산 규칙 임의 변경 금지.
 */

import { resolveSeasonCode, SEASON_CODE_TO_KO, SEASON_ORDER, KOREAN_SEASONS } from '@/lib/season-utils'
import { getRecommendedSubstitutes, mapRegion } from '@/lib/species-knowledge'
import type { SubstituteCandidate } from '@/lib/substitute-recommender'
import type { SiteOption, PlantingRow } from './simulation-types'

/** AI 분석 요약 결과 (화면 카드 4종 + 계절 차트 데이터) */
export type AiAnalysisResult = {
  riskLevel: string
  recommendReason: string
  effectSummary: string
  actionGuide: string
  seasonalImpact: string
  seasonStats: { season: string; rate: number; qty: number; label: string }[]
}

/** 컴포넌트 집계값 스냅샷 — 계산에 필요한 최소 입력 */
export type AiAnalysisInput = {
  siteRows: PlantingRow[]
  speciesAvgRate: Record<string, number>
  /** 수종명 → 리스크 등급 (컴포넌트의 getSpeciesRisk와 동일 판정) */
  getSpeciesRisk: (name: string | null) => string | null
  /** 원수종명 → 선택된 대체수종명 (장바구니 파생) */
  selectedSubstitutes: Record<string, string>
  subMap: Map<string, SubstituteCandidate[]>
  sites: SiteOption[]
  selectedSiteId: string
  originalWeightedRate: number | null
  improvedWeightedRate: number | null
  originalTotalQty: number
  reductionEffect: number | null
  costReduction: number | null
  riskCounts: { high: number; mid: number; low: number }
}

/** 입주 시기별 고정 분석 문구 */
const SEASONAL_IMPACT_BY_OCCUPANCY: Record<string, string> = {
  winter: `① 겨울 입주 현장 (가을 식재 시행)\n\n가을철 식재 후 입주 시점이 동절기에 해당하는 현장의 경우, 수목의 활착이 완료되기 이전에 혹한 및 동결 환경에 노출됨으로써 동해(凍害) 피해 발생 가능성이 현저히 높아진다. 이에 따라 내한성(耐寒性)이 취약한 수종—블루엔젤, 대왕참나무 등 동해 민감종—의 가을 식재는 지양하는 것이 바람직하며, 해당 수종은 내한성이 확보된 대체 수종으로 우선 적용하여 동절기 하자를 사전에 억제하는 식재 계획을 수립하였다.`,
  fall: `② 가을 입주 현장 (여름 식재 시행)\n\n가을 입주 현장에서 하절기 식재가 시행된 경우, 고온 다습한 환경과 강한 일사(日射)로 인해 수분 증산량이 급격히 증가하여 건조 피해 및 열해(熱害) 발생 위험이 높다. 이를 방지하기 위해 식재 직후부터 입주 시점까지 정기적인 관수(灌水) 및 토양 수분 유지 관리를 병행하되, 근본적인 하자 저감을 위해 내건성(耐乾性) 및 내열성(耐熱性)이 우수한 수종을 대체 식재 수종으로 우선 선정·적용하는 방향으로 식재 계획을 조정하였다.`,
  summer: `③ 여름 입주 현장 (봄 식재 시행)\n\n봄철 식재 후 여름 입주가 이루어지는 현장은 식재 시점의 온도 조건이 비교적 온화하여 활착에 유리한 환경을 형성한다. 다만, 수목의 생육 안정성을 장기적으로 확보하기 위해서는 해당 지역의 기후 특성과 계절적 생육 조건에 부합하는 적합 수종 선정이 필수적이다. 이에 지역 생태 환경 및 봄철 식재 적정 수종 기준을 검토하여 현장 여건에 최적화된 대체 수종을 선별·적용함으로써 식재 품질의 균일성을 확보하는 계획을 반영하였다.`,
  spring: `④ 봄 입주 현장 (동절기 식재 시행)\n\n봄철 입주를 목표로 동절기에 식재가 시행되는 경우, 저온으로 인한 수목 고사(枯死) 위험을 최소화하기 위해 볏짚 피복, 수간 보온재 감기, 방풍망 설치 등 동해 방지를 위한 보온 조치를 의무적으로 병행하여야 한다. 아울러 동절기 저온 환경에서도 뿌리 활착 능력이 우수하고 내한성이 강한 수종을 대체 식재 수종으로 우선 도입함으로써, 혹한기 식재에 따른 하자 발생률을 효과적으로 저감하는 식재 계획을 수립하였다.`,
}

/** 식재 계절 = 입주 계절의 한 계절 전 (가을 식재 → 겨울 입주 등) */
const OCCUPANCY_TO_PLANTING_SEASON: Record<string, string> = {
  spring: 'winter', summer: 'spring', fall: 'summer', winter: 'fall',
}

/**
 * 현재 시뮬레이터 상태 스냅샷으로 AI 분석 요약을 계산한다.
 * @returns siteRows가 비어 있으면 null(호출부는 setAiAnalysis 생략).
 */
export function buildAiAnalysis(input: AiAnalysisInput): AiAnalysisResult | null {
  const {
    siteRows, speciesAvgRate, getSpeciesRisk, selectedSubstitutes, subMap,
    sites, selectedSiteId, originalWeightedRate, improvedWeightedRate,
    originalTotalQty, reductionEffect, costReduction, riskCounts,
  } = input

  if (siteRows.length === 0) return null

  // 수종명 기준 중복 제거 (수량 합산, 하자율은 수목하자율 기준)
  const speciesAgg = new Map<string, { qty: number; season: string | null }>()
  for (const r of siteRows) {
    const key = r.species_name ?? `__no_name_${r.id}`
    const prev = speciesAgg.get(key) ?? { qty: 0, season: r.planting_season }
    speciesAgg.set(key, {
      qty: prev.qty + r.quantity_planted,
      season: prev.season ?? r.planting_season,
    })
  }
  const uniqueSpecies = Array.from(speciesAgg.entries()).map(([name, v]) => {
    const avgRate = speciesAvgRate[name]
    const risk = getSpeciesRisk(name)
    return {
      name,
      qty: v.qty,
      rate: avgRate != null ? avgRate : 0,
      risk,
      season: v.season,
    }
  })

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

  // 현장 지역 정보
  const currentSite = sites.find((s) => s.id === selectedSiteId)
  const siteRegion = mapRegion(currentSite?.region)

  // 추천 사유: 선택된 수종별 개선 근거 또는 미선택 고위험 수종 + 지식DB 추천
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
    const highMidAll = uniqueSpecies.filter((s) => s.risk === '고위험' || s.risk === '중위험')

    // 지식DB 기반 추천: 고위험/중위험 수종별로 최대 3종 추천
    const knowledgeLines = highMidAll.slice(0, 3).map((s) => {
      const recs = getRecommendedSubstitutes(s.name, siteRegion, 3)
      if (recs.length === 0) return null
      const recNames = recs.map((r) => r.name).join(' · ')
      return `${s.name}: ${recNames} 추천`
    }).filter((l): l is string => !!l)

    if (highMid.length > 0 || knowledgeLines.length > 0) {
      const parts: string[] = []
      if (highMid.length > 0) {
        parts.push(`${highMid.slice(0, 3).map((s) => s.name).join(', ')} 등 ${highMid.length}종에 등록된 대체 수종 후보 있음`)
      }
      if (knowledgeLines.length > 0) {
        parts.push(...knowledgeLines)
      }
      recommendReason = parts.join('  /  ')
    } else if (highMidAll.length > 0) {
      // 대체 후보는 없지만 고위험/중위험 수종은 있는 경우
      const knowledgeFallback = highMidAll.slice(0, 3).map((s) => {
        const recs = getRecommendedSubstitutes(s.name, siteRegion, 3)
        if (recs.length === 0) return null
        return `${s.name}: ${recs.map((r) => r.name).join(' · ')} 추천 (지역: ${siteRegion})`
      }).filter((l): l is string => !!l)
      recommendReason = knowledgeFallback.length > 0
        ? knowledgeFallback.join('  /  ')
        : '고위험·중위험 수종에 대한 대체 후보가 없습니다. 대체수종 등록 메뉴를 통해 등록하세요.'
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
      // DB에 영어 코드('spring') 또는 한국어('봄') 모두 처리
      r.planting_season
        ? (SEASON_CODE_TO_KO[r.planting_season] ?? (KOREAN_SEASONS.has(r.planting_season) ? r.planting_season : null))
        : null,
      r.planting_date,
    ),
  }))
  const seasonBuckets: Record<string, { qty: number; defectQty: number; species: Map<string, { qty: number; defectQty: number }> }> = {}
  for (const r of rowsWithSeason) {
    if (!r.resolvedSeason) continue
    // expected_defect_rate 없으면 수목하자율(speciesAvgRate) 폴백
    const effectiveRate = r.expected_defect_rate ?? (r.species_name ? speciesAvgRate[r.species_name] : null)
    if (effectiveRate == null) continue
    const s = r.resolvedSeason
    if (!seasonBuckets[s]) seasonBuckets[s] = { qty: 0, defectQty: 0, species: new Map() }
    const rowDefectQty = r.expected_defect_qty ?? Math.round(r.quantity_planted * effectiveRate)
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

  // 선택 현장의 입주일로 입주 계절 판별
  const selectedSite = sites.find((s) => s.id === selectedSiteId)
  const occupancyDate = selectedSite?.occupancy_date ? new Date(selectedSite.occupancy_date) : null
  let occupancySeason: string | null = null
  if (occupancyDate && !isNaN(occupancyDate.getTime())) {
    const m = occupancyDate.getMonth() + 1
    if (m >= 3 && m <= 5) occupancySeason = 'spring'
    else if (m >= 6 && m <= 8) occupancySeason = 'summer'
    else if (m >= 9 && m <= 11) occupancySeason = 'fall'
    else occupancySeason = 'winter'
  }

  let seasonalImpact: string
  if (occupancySeason && SEASONAL_IMPACT_BY_OCCUPANCY[occupancySeason]) {
    // 입주시기에 해당하는 계절 분석 한 가지만 표시
    seasonalImpact = SEASONAL_IMPACT_BY_OCCUPANCY[occupancySeason]
  } else {
    // 입주일이 없는 현장: 분석 불가 안내 (4계절 일괄 표시하지 않음)
    seasonalImpact = '현장 입주일(준공일) 데이터가 없어 입주시기 기준 식재 시기 분석을 수행할 수 없습니다. 현장 정보에 입주일을 등록해주세요.'
  }

  // 막대 차트도 입주시기에 대응하는 식재 계절 하나만 표시
  const plantingSeasonForOccupancy = occupancySeason
    ? OCCUPANCY_TO_PLANTING_SEASON[occupancySeason]
    : null
  const filteredSeasonStats = plantingSeasonForOccupancy
    ? seasonStats.filter((s) => s.season === plantingSeasonForOccupancy)
    : []

  return { riskLevel, recommendReason, effectSummary, actionGuide, seasonalImpact, seasonStats: filteredSeasonStats }
}
