// 하자율 베이지안(라플라스 평활) 보정 공통 유틸.
// 소표본 수종/지역/계절 조합의 하자율 과대·과소 추정을 완화한다.
// 기존 species-stats-tab.tsx의 calcAdjustedRate(prior 0.15·30주)와 수치적으로 동일하다.

/** 전체 평균 하자율(prior). 보정 시 표본을 이 값으로 끌어당긴다. */
export const PRIOR_RATE = 0.15

/** prior 강도(가상 표본 주수). 클수록 소표본이 PRIOR_RATE에 더 가까워진다. */
export const PRIOR_STRENGTH = 30

/** 원시 표본이 이 주수 미만이면 '표본부족'으로 간주한다. */
export const MIN_RELIABLE_SAMPLE = 30

/**
 * 베이지안 보정 하자율(0~1).
 * @param defectQty 하자 수량
 * @param totalQty  식재/점검 수량. 0 이하면 prior(PRIOR_RATE)를 반환한다.
 */
export function adjustedRate(defectQty: number, totalQty: number): number {
  if (totalQty <= 0) return PRIOR_RATE
  return (defectQty + PRIOR_RATE * PRIOR_STRENGTH) / (totalQty + PRIOR_STRENGTH)
}

/** 원시 표본이 신뢰 임계치(MIN_RELIABLE_SAMPLE) 미만인지 여부. */
export function isLowSample(totalQty: number): boolean {
  return totalQty < MIN_RELIABLE_SAMPLE
}
