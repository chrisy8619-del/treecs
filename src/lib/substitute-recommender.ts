// 대체수종 후보풀·랭킹 산출 경계(인터페이스).
//
// 현재 구현은 규칙 기반(ruleBasedRecommender): DB 등록 매핑 → 지역·계절 참조표 → 현장 내 저위험 폴백.
// 향후 회귀 모델이 도입되면 이 파일의 recommender 함수만 교체하면 되고,
// 이를 소비하는 simulation-client / cart-panel 은 변경할 필요가 없다.
//
// ⚠️ 이 모듈은 기존 simulation-client.tsx 의 subMap/getSpeciesRisk 로직을
//    동작 동일하게(회귀 무손실) 추출한 것이다. 계산 규칙을 임의로 바꾸지 말 것.

// ── 입력 타입 (simulation-client 의존을 피하기 위해 구조적 타입으로 최소 정의) ──

export type SubstituteCandidate = { name: string; rate: number; isAuto?: boolean }

// 현장 식재 행 중 추천에 필요한 최소 필드만 사용한다.
export type RecommenderRow = {
  species_name: string | null
  planting_season: string | null
}

export type RecommenderInput = {
  // DB 등록 대체수종 맵 (원수종명 → 후보들)
  dbSubMap: Map<string, { name: string; rate: number }[]>
  // 지역·계절 기반 대체 수종 추천 맵 (원수종명 → 대체수종명 리스트)
  altRecMap: Map<string, string[]>
  // 현장 식재 행
  siteRows: RecommenderRow[]
  // 전체 데이터 기준 수종별 평균 하자율
  speciesAvgRate: Record<string, number>
}

export type SubstituteRecommender = (
  input: RecommenderInput
) => Map<string, SubstituteCandidate[]>

// 수목하자율 기준 리스크 등급 (speciesAvgRate 값 → 등급)
export function getSpeciesRiskFromRate(
  speciesAvgRate: Record<string, number>,
  name: string | null
): string | null {
  if (!name) return null
  const rate = speciesAvgRate[name]
  if (rate == null) return null
  if (rate >= 0.2) return '고위험'
  if (rate >= 0.1) return '중위험'
  return '저위험'
}

// 규칙 기반 추천: 현재 시스템의 subMap 로직과 동일.
// 1순위: DB 등록 매핑(하자율 낮은 순 3개)
// 2순위: 지역·계절 참조표(DB 등록 없는 수종)
// 3순위: 현장 내 저위험 수종 폴백(위에서도 없는 고/중위험 수종)
export const ruleBasedRecommender: SubstituteRecommender = ({
  dbSubMap,
  altRecMap,
  siteRows,
  speciesAvgRate,
}) => {
  const map = new Map<string, SubstituteCandidate[]>()
  const risk = (name: string | null) => getSpeciesRiskFromRate(speciesAvgRate, name)

  // 1순위: DB 등록 데이터 (하자율 낮은 순 상위 3개)
  for (const [k, v] of dbSubMap) {
    const sorted = [...v].sort((a, b) => a.rate - b.rate).slice(0, 3)
    map.set(k, sorted.map((s) => ({ ...s, isAuto: false })))
  }

  // 2순위: 지역·계절 기반 데이터 (DB 등록 없는 수종에 적용)
  for (const [speciesName, altCandidates] of altRecMap) {
    if (map.has(speciesName) && map.get(speciesName)!.length > 0) continue
    const candidates = altCandidates
      .filter((name) => name !== speciesName)
      .map((name) => ({
        name,
        rate: speciesAvgRate[name] ?? 0,
        isAuto: true,
      }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3)
    if (candidates.length > 0) map.set(speciesName, candidates)
  }

  // 3순위: 현장 내 저위험 수종 자동 추천 (위에서도 없는 경우)
  const lowRiskSpecies = Array.from(
    new Map(
      siteRows
        .filter((r) => r.species_name && risk(r.species_name) === '저위험')
        .map((r) => {
          const rate = speciesAvgRate[r.species_name!] ?? 0
          return [r.species_name!, { name: r.species_name!, rate }]
        })
    ).values()
  ).sort((a, b) => a.rate - b.rate)

  for (const r of siteRows) {
    if (!r.species_name) continue
    const rk = risk(r.species_name)
    if (rk !== '고위험' && rk !== '중위험') continue
    if (map.has(r.species_name) && map.get(r.species_name)!.length > 0) continue
    const candidates = lowRiskSpecies.filter((s) => s.name !== r.species_name).slice(0, 3)
    if (candidates.length > 0) {
      map.set(r.species_name, candidates.map((s) => ({ ...s, isAuto: true })))
    }
  }

  return map
}
