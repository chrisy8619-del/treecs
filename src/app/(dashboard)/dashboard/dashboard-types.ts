/**
 * 대시보드 화면 공유 타입 정의.
 *
 * 호출 주체 : dashboard/page.tsx(SSR 변환 결과 타입), dashboard-client.tsx
 * 반환/전송 : 타입만 export (런타임 코드 없음)
 *
 * 분리 이유: 'use client' 거대 파일(dashboard-client)이 타입 공급원을 겸하던 결합을
 *            해소. simulation-types.ts와 동일한 컨벤션.
 */

/** 현장 선택 옵션 (page.tsx SSR에서 sites 쿼리 결과를 변환) */
export type SiteOption = {
  id: string
  site_name: string
  site_code: string
  region: string | null
  occupancy_date: string | null
  start_date: string | null
  org_name: string | null
}

/** 현장별 식재 행 (/api/plantings-by-site 응답 + 화면용 평탄화 필드) */
export type PlantingRow = {
  id: string
  site_id: string
  quantity_planted: number
  unit_price: number | null
  expected_defect_rate: number | null
  expected_defect_qty: number | null
  expected_reserve_cost: number | null
  risk_level: string | null
  planting_season: string | null
  notes: string | null
  contractor_name: string | null
  species_name: string | null
  height_m: number | null
  width_m: number | null
  rootball_r: number | null
  caliper: number | null
  // API 응답 원본 (조인 필드)
  contractors?: { contractor_name: string } | { contractor_name: string }[] | null
  species?: { species_name_ko: string } | { species_name_ko: string }[] | null
  spec_codes?: { height_m?: number; width_m?: number; rootball_r?: number; caliper?: number } | { height_m?: number; width_m?: number; rootball_r?: number; caliper?: number }[] | null
}
