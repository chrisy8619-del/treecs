// 계절 코드 ↔ 한국어 변환 (서버/클라이언트 공용)
export const SEASON_KO_TO_CODE: Record<string, string> = {
  봄: 'spring', 여름: 'summer', 가을: 'fall', 겨울: 'winter',
}

export const SEASON_CODE_TO_KO: Record<string, string> = {
  spring: '봄', summer: '여름', fall: '가을', winter: '겨울',
}

// 계절(수식) P열 → 식재 계절 변환
// 예) P열=봄(조사 계절) → 식재는 한 계절 전인 겨울
const PREV_SEASON: Record<string, string> = {
  spring: 'winter', summer: 'spring', fall: 'summer', winter: 'fall',
}

export function defectSeasonToPlantingSeason(defectSeasonKo: string): string | null {
  const code = SEASON_KO_TO_CODE[defectSeasonKo.trim()]
  if (!code) return null
  return PREV_SEASON[code] ?? null
}
