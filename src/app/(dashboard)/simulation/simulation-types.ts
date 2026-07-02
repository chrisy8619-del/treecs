/**
 * 시뮬레이터 화면 공유 타입 정의.
 *
 * 호출 주체 : simulation/page.tsx(SSR 변환 결과 타입), simulation-client.tsx,
 *             dashboard-tabs-client.tsx (props 경계 타입으로 공유)
 * 반환/전송 : 타입만 export (런타임 코드 없음)
 *
 * 분리 이유: 'use client' 거대 파일(simulation-client)이 타입 공급원을 겸하던 결합을
 *            해소. cart-types.ts 선례와 동일한 컨벤션.
 */

/** 현장 선택 드롭다운 옵션 (page.tsx SSR에서 sites 쿼리 결과를 변환) */
export type SiteOption = {
  id: string
  site_name: string
  site_code: string
  region: string | null
  occupancy_date: string | null
  org_name: string | null
}

/** 현장별 식재 행 (/api/plantings-by-site 응답을 화면용으로 매핑) */
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

/** DB 등록 대체수종 매핑 (species_substitutions 조인 결과) */
export type SubstitutionMap = {
  original_species_name: string
  substitute_species_name: string
  improved_defect_rate: number
}

/** 지역·계절 기반 대체수종 참조표 행 (alternative_species_recommendations) */
export type AltSpeciesRec = {
  species_name: string
  region: string
  season: string
  substitute1: string | null
  substitute2: string | null
  substitute3: string | null
}
