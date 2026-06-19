// 요약 페이지 "하자수량 변화(절감 효과)" 카드의 시나리오별 계산 유틸.
// 대체 수종 일괄 적용 가정 하에 보수/확장/최대 3개 시나리오의 절감분을 산출한다.
//
// 과대 산정 방지 원칙: 대체 전(baseline)·후 하자량을 모두 베이지안 보정율(adjustedRate)로
// 통일한다. 고위험 '판정'과 하자량 '차감'을 같은 기준으로 맞춰, 소표본 극단 원시율
// (예: 단일 현장 96.67%)이 절감분을 비현실적으로 부풀리는 문제를 제거한다.

import { adjustedRate } from '@/lib/defect-rate'

/** 절감 시나리오 키: 보수(고위험만) / 확장(고위험+중위험) / 최대(추천 전체). */
export type ScenarioKey = 'conservative' | 'extended' | 'max'

export type ScenarioResult = {
  /** 대체 전 보정 하자량 합 = Σ round(inspected × adjRate). 세 시나리오 공통. */
  baselineDefect: number
  /** 대체 적용 후 보정 하자량 합. */
  improvedDefect: number
  /** 절감 수량 = baselineDefect − improvedDefect (음수 방지). */
  savedQty: number
  /** 절감률(%) = savedQty / baselineDefect × 100. */
  savingPct: number
  /** 실제 대체가 적용된 대상 수종 수. */
  targetSpeciesCount: number
  /** 대상 수종의 식재(점검) 수량 합. */
  targetPlantedQty: number
}

export type ScenarioSet = Record<ScenarioKey, ScenarioResult>

type SpeciesRow = { name: string; inspected: number; defect: number }
type Sub = { original_species_name: string; improved_defect_rate: number }

/** 고위험 임계치(보정율). */
const HIGH = 0.20
/** 중위험 임계치(보정율). */
const MID = 0.10

/**
 * 수종별 식재 집계와 대체쌍 목록으로 3개 절감 시나리오를 계산한다.
 * @param speciesData 전체 현장 수종 합산 ({ name, inspected, defect }).
 * @param substitutions species_substitutions(원수종→대체수종, 개선 하자율) 목록.
 */
export function computeSavingsScenarios(
  speciesData: SpeciesRow[],
  substitutions: Sub[],
): ScenarioSet {
  // 원수종별 최선(최저) 개선 하자율 맵
  const best = new Map<string, number>()
  for (const s of substitutions) {
    const cur = best.get(s.original_species_name)
    if (cur == null || s.improved_defect_rate < cur) {
      best.set(s.original_species_name, s.improved_defect_rate)
    }
  }

  // baseline: 전 수종 보정율 기준 하자량 합 (시나리오 공통)
  let baselineDefect = 0
  const rows = speciesData.map((s) => {
    const adj = adjustedRate(s.defect, s.inspected)
    baselineDefect += Math.round(s.inspected * adj)
    return { inspected: s.inspected, adj, improved: best.get(s.name) ?? null }
  })

  // 시나리오 자격(eligible)에 따라 대체 적용 후 하자량을 산출
  const calc = (eligible: (adj: number) => boolean): ScenarioResult => {
    let improvedDefect = 0
    let cnt = 0
    let qty = 0
    for (const r of rows) {
      // 대체 적용 조건: 시나리오 자격 + 개선율 존재 + 개선율이 보정율보다 낮음
      const apply = eligible(r.adj) && r.improved != null && r.improved < r.adj
      const rate = apply ? r.improved! : r.adj
      improvedDefect += Math.round(r.inspected * rate)
      if (apply) {
        cnt += 1
        qty += r.inspected
      }
    }
    const saved = Math.max(0, baselineDefect - improvedDefect)
    return {
      baselineDefect,
      improvedDefect,
      savedQty: saved,
      savingPct: baselineDefect > 0 ? (saved / baselineDefect) * 100 : 0,
      targetSpeciesCount: cnt,
      targetPlantedQty: qty,
    }
  }

  return {
    conservative: calc((adj) => adj >= HIGH),       // 고위험만
    extended: calc((adj) => adj >= MID),            // 고위험 + 중위험
    max: calc(() => true),                          // 추천(improved 존재) 전체
  }
}
