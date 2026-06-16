// 계절 코드 ↔ 한국어 변환 (서버/클라이언트 공용)
export const SEASON_KO_TO_CODE: Record<string, string> = {
  봄: 'spring', 여름: 'summer', 가을: 'fall', 겨울: 'winter',
}

export const SEASON_CODE_TO_KO: Record<string, string> = {
  spring: '봄', summer: '여름', fall: '가을', winter: '겨울',
}

export const SEASON_ORDER = ['spring', 'summer', 'fall', 'winter'] as const
export type SeasonCode = typeof SEASON_ORDER[number]

export const KOREAN_SEASONS = new Set(['봄', '여름', '가을', '겨울'])

// 계절(수식) P열(입주시기 계절) → 식재 계절 변환
// 예) P열=봄(입주시기 계절) → 식재는 한 계절 전인 겨울
const PREV_SEASON: Record<string, string> = {
  spring: 'winter', summer: 'spring', fall: 'summer', winter: 'fall',
}

// 입력값(입주시기 계절)을 한 계절 전 식재 계절로 변환
export function defectSeasonToPlantingSeason(occupancySeasonKo: string): string | null {
  const code = SEASON_KO_TO_CODE[occupancySeasonKo.trim()]
  if (!code) return null
  return PREV_SEASON[code] ?? null
}

/**
 * 계절 결정 우선순위:
 * 1) excelSeasonKo (이미 식재 계절로 변환된 한국어 값) → 계절 코드 직접 사용
 *    ※ '계절(수식)' 컬럼 원본(입주시기 계절)은 defectSeasonToPlantingSeason으로
 *      식재 계절 변환 후 전달되어야 함
 * 2) plantingDateStr ('식재시기' 컬럼 날짜 문자열) → 월 기준 자동 계산
 *    봄: 3~5월 / 여름: 6~8월 / 가을: 9~11월 / 겨울: 12~2월
 */
export function resolveSeasonCode(
  excelSeasonKo: string | null | undefined,
  plantingDateStr: string | null | undefined,
): string | null {
  // 1) 계절(수식) 컬럼 우선
  if (excelSeasonKo) {
    const trimmed = String(excelSeasonKo).trim()
    const code = SEASON_KO_TO_CODE[trimmed]
    if (code) return code
  }
  // 2) 식재시기 날짜 기반 자동 계산
  if (plantingDateStr) {
    const d = new Date(String(plantingDateStr))
    if (!isNaN(d.getTime())) {
      const m = d.getMonth() + 1
      if (m >= 3 && m <= 5) return 'spring'
      if (m >= 6 && m <= 8) return 'summer'
      if (m >= 9 && m <= 11) return 'fall'
      return 'winter'
    }
  }
  return null
}

/** 숫자 안전 변환 — 빈값·'-'·null → 0 */
export function safeNumZero(v: unknown): number {
  if (v == null || v === '' || v === '-') return 0
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

/** 리스크 등급 자동 계산 (컬럼 값 없을 때 폴백) */
export function calcRiskLevel(defectRate: number): string {
  if (defectRate >= 0.20) return '고위험'
  if (defectRate >= 0.10) return '중위험'
  return '저위험'
}
