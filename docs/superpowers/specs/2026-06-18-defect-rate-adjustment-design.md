# (수종×지역×계절) 하자율 베이지안 보정 전면 적용 — 설계서

- 작성일: 2026-06-18
- 대상: TreeCS 시뮬레이터/요약 화면의 하자율 집계
- 배경: 사용자가 첨부한 엑셀은 (수종명 × 지역 × 계절) 조합으로 '수종 하자율'을 도출(예: 백목련·충북·여름). 이 로직을 앱의 지도·히트맵·절감카드·식재전략 칩에 반영하되, 소표본 극단값(0%/100%) 문제를 베이지안 보정으로 해결한다.

## 1. 목표와 비목표

### 목표
- (수종×지역×계절) 등 다차원 하자율 집계 전반에 **베이지안 보정**을 일관 적용한다.
- 보정 로직을 **단일 공통 유틸**로 통합해 중복(3곳)을 제거한다.
- 소표본 조합은 보정값을 표시하되 **'표본부족' 배지**로 신뢰도를 드러낸다.

### 비목표 (YAGNI)
- 외부(기후/적합성) 데이터 도입 — 검토 결과 비채택(출처·신뢰성·단위 불일치 리스크).
- 계층적 폴백(상위그룹 prior) — 이번엔 고정 prior 0.15로 단순화. 추후 필요 시 별도 과제.
- 무관한 리팩터링/디자인 변경.

## 2. 확정 결정 사항

| 항목 | 결정 |
|---|---|
| 접근 | 내부 데이터 + 베이지안 보정 (외부 데이터 ❌) |
| prior | 고정 `0.15`, 강도 `30`주 (기존 `calcAdjustedRate`와 동일 상수) |
| 소표본 처리 | 보정값 표시 + '표본부족' 배지 (임계치 30주 미만) |
| 더미 fallback | 실데이터 0건일 때만 유지 (현행 로직 보존) |

## 3. 현황 진단

보정 공식이 3곳에 흩어져 있다:
- `src/app/(dashboard)/species/species-stats-tab.tsx:16~38` — 상수 + `calcAdjustedRate` 정의 (정본)
- `src/app/(dashboard)/simulation/page.tsx:103~111` — `speciesAvgRate`용 인라인 베이지안 (`BAYESIAN_AVG`/`BAYESIAN_SAMPLE`)
- `src/app/(dashboard)/simulation/page.tsx:412` — `seasonStrategyStats` 고위험 판정용 인라인 재선언

보정이 **빠진** 집계(원시 `defectQty/qty` 사용):
- `seasonRegionData` (page.tsx:309~376) — 지역×계절. **소표본 0%/100% 극단값 노출 지점**
- `heatmapData` (page.tsx:197~231) — 수종×계절
- `seasonStrategyStats` 전체 `defectRate` (page.tsx:418) — 계절 전체 단순평균

`summary-content.tsx`의 더미 fallback: `SEASON_REGION_DATA`, `RISK_TOP5`, `CONTRACTOR_TOP10`, `SEASON_META.advice` — 모두 실데이터 없을 때만 쓰는 fallback (유지).

## 4. 설계

### 4.1 공통 보정 유틸 — `src/lib/defect-rate.ts` (신규)

```ts
export const PRIOR_RATE = 0.15        // 전체 평균 하자율(prior)
export const PRIOR_STRENGTH = 30      // 가상 표본 강도
export const MIN_RELIABLE_SAMPLE = 30 // 이 미만이면 '표본부족'

/** 베이지안(라플라스 평활) 보정 하자율. 0~1 */
export function adjustedRate(defectQty: number, totalQty: number): number {
  if (totalQty <= 0) return PRIOR_RATE
  return (defectQty + PRIOR_RATE * PRIOR_STRENGTH) / (totalQty + PRIOR_STRENGTH)
}

/** 원시 표본이 신뢰 임계치 미만인지 */
export function isLowSample(totalQty: number): boolean {
  return totalQty < MIN_RELIABLE_SAMPLE
}
```

- 공식·상수는 기존 `calcAdjustedRate`/`DEFAULT_AVG_DEFECT_RATE(0.15)`/`DEFAULT_SAMPLE_SIZE(30)`와 **수치적으로 동일**.
- `totalQty <= 0` 가드 추가(기존 page.tsx `speciesAvgRate`가 qty=0일 때 `PRIOR_RATE` 반환하던 동작과 일치).

### 4.2 기존 정의를 유틸로 위임 (무손실 보존)

- `species-stats-tab.tsx`: `DEFAULT_AVG_DEFECT_RATE`, `DEFAULT_SAMPLE_SIZE`, `calcAdjustedRate`를 `defect-rate.ts`에서 re-export 하도록 변경. `DEFAULT_SAMPLE_SIZE`(=30)와 신규 `MIN_RELIABLE_SAMPLE`(=30)는 값이 같다. 외부 import 경로/시그니처는 그대로 유지 → **이 파일을 import하는 모든 화면의 값 불변**.
- `page.tsx`: `BAYESIAN_AVG`/`BAYESIAN_SAMPLE` 인라인 상수 제거 → `adjustedRate()` 호출로 교체 (`speciesAvgRate` 계산부, `seasonStrategyStats` 고위험 판정부 양쪽).

### 4.3 데이터 레이어 보정 적용 (`page.tsx`)

`RegionData` 타입(`korea-map.tsx`)에 `lowSample: boolean` 필드 추가.

| 집계 | 변경 (마지막 비율 산출 한 줄) |
|---|---|
| `seasonRegionData` (`bucketToRegionData`) | `defect_rate = b.qty>0 ? b.defectQty/b.qty : 0` → `adjustedRate(b.defectQty, b.qty)`, `lowSample: isLowSample(b.qty)` 추가. top_species 정렬도 보정값 기준. |
| `heatmapData` | 계절별/평균 `defectQty/qty` → `adjustedRate(...)` |
| `seasonStrategyStats.defectRate` | `totalDefect/totalQty` → `adjustedRate(totalDefect, totalQty)` |

집계 구조(버킷 누적)는 변경하지 않는다. 비율 산출 지점만 교체.

### 4.4 화면 적용

- **지도(`korea-map.tsx`)**: `regionData[].lowSample === true`인 지역에 작은 회색 '표본부족' 배지/표식. 색상 구간(높음/중간/낮음)은 보정된 `defect_rate` 기준으로 계산되므로 극단값 자동 완화.
- **식재 전략 칩(`summary-content.tsx`)**: `strategyDefectRate`가 보정된 값을 받으므로 추가 작업 없음(출처 일치 확인만).
- **절감 카드(`summary-content.tsx:262~270`)**: `calcAdjustedRate` import를 공통 유틸 경로로 교체. 로직 불변.
- **더미 fallback**: `hasRealRegionData`/`hasSpeciesData` 등 기존 분기 그대로. 실데이터 있으면 보정값, 없으면 더미.

## 5. 데이터 흐름

```
planting_records (실데이터)
  └─ page.tsx 버킷 누적 (지역×계절 / 수종×계절 / 계절)
       └─ defect-rate.ts: adjustedRate() + isLowSample()
            └─ AnalyticsProps (seasonRegionData[].lowSample, heatmapData, seasonStrategyStats)
                 └─ summary-content.tsx / korea-map.tsx (보정값 + 표본부족 배지)
실데이터 0건 → 기존 더미 fallback
```

## 6. 에러/엣지 케이스

- `totalQty <= 0`: `adjustedRate`가 `PRIOR_RATE`(0.15) 반환 — 빈 칸/NaN 방지.
- 매핑 불가 지역(`regionToKey` null): 기존대로 집계 제외(현행 유지).
- 실데이터 0건: 더미 fallback 진입(현행 유지).

## 7. 테스트/검증

1. **회귀(최우선)**: 수종 관리(수목 현황) 탭의 TOP5·리스크 칩 값이 유틸 분리 전후 **완전히 동일**한지 확인. (유틸 분리가 무손실임을 입증)
2. 지도: 소표본 지역에 '표본부족' 배지 노출 + 기존 0%/100% 극단값 사라짐 확인.
3. 빌드·타입체크 통과 (`npm run build` / 타입 검사).
4. 실데이터 0건 환경(로컬 빈 DB)에서 더미 fallback 정상 표시 확인.

## 8. 변경 파일 요약

- 신규: `src/lib/defect-rate.ts`
- 수정: `species-stats-tab.tsx`(re-export), `simulation/page.tsx`(인라인 보정→유틸, 3집계 보정), `simulation/korea-map.tsx`(lowSample 배지 + 타입), `simulation/summary-content.tsx`(import 교체)
