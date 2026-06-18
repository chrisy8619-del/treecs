# (수종×지역×계절) 하자율 베이지안 보정 전면 적용 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 흩어진 하자율 베이지안 보정 로직을 공통 유틸로 통합하고, 보정이 빠진 (지역×계절)·(수종×계절)·(계절) 집계에 일관 적용하며, 소표본 조합에 '표본부족' 배지를 노출한다.

**Architecture:** 신규 `src/lib/defect-rate.ts`에 보정 순수함수를 두고, 기존 4곳의 중복 정의(species-stats-tab, species-finder-tab, page.tsx 인라인 2곳)를 이 유틸로 위임/교체한다. 데이터 레이어(page.tsx)에서 비율 산출 지점만 보정 호출로 바꾸고, RegionData에 `lowSample` 플래그를 추가해 지도에서 배지를 표시한다. 더미 fallback 분기는 그대로 보존한다.

**Tech Stack:** Next.js 16.2.4 (App Router), React 19, TypeScript 5, Supabase, Recharts. **테스트 프레임워크 없음** — 검증은 `npm run build` + `npm run lint` + 수동 회귀 비교.

## Global Constraints

- prior 상수: `PRIOR_RATE = 0.15`, `PRIOR_STRENGTH = 30` (기존 `DEFAULT_AVG_DEFECT_RATE`/`DEFAULT_SAMPLE_SIZE`와 수치 동일 — 절대 변경 금지).
- 소표본 임계치: `MIN_RELIABLE_SAMPLE = 30` (원시 표본 < 30주 → '표본부족').
- 보정 공식: `(defectQty + 0.15*30) / (totalQty + 30)`, `totalQty <= 0`이면 `0.15` 반환.
- **회귀 무손실 원칙**: 수종 관리(수목 현황) 탭의 TOP5·리스크 칩 값이 변경 전후 완전히 동일해야 한다.
- 더미 fallback(`SEASON_REGION_DATA`, `RISK_TOP5`, `CONTRACTOR_TOP10`, `SEASON_META.advice`)은 실데이터 0건일 때만 사용 — 기존 분기 유지.
- 의존성 추가 금지. 새 라이브러리 설치 없음.
- 주석은 한국어, 식별자는 영어. 기존 코드 스타일 준수.
- 새 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드 확인(AGENTS.md: "This is NOT the Next.js you know").

---

## File Structure

- **Create** `src/lib/defect-rate.ts` — 보정 순수함수 + 상수 (단일 책임: 하자율 보정/신뢰도 판정)
- **Modify** `src/app/(dashboard)/species/species-stats-tab.tsx` — 상수·`calcAdjustedRate`를 유틸에서 re-export
- **Modify** `src/app/(dashboard)/species/species-finder-tab.tsx` — 로컬 `calcAdjustedRate` 제거, 유틸 import
- **Modify** `src/app/(dashboard)/simulation/page.tsx` — 인라인 베이지안 제거 + seasonRegionData/heatmapData/seasonStrategyStats 보정
- **Modify** `src/app/(dashboard)/simulation/korea-map.tsx` — `RegionData.lowSample` 추가 + 배지 렌더
- **Modify** `src/app/(dashboard)/simulation/summary-content.tsx` — import 경로 교체

---

## Task 1: 공통 보정 유틸 생성

**Files:**
- Create: `src/lib/defect-rate.ts`

**Interfaces:**
- Produces:
  - `PRIOR_RATE: number` (= 0.15)
  - `PRIOR_STRENGTH: number` (= 30)
  - `MIN_RELIABLE_SAMPLE: number` (= 30)
  - `adjustedRate(defectQty: number, totalQty: number): number`
  - `isLowSample(totalQty: number): boolean`

- [ ] **Step 1: 유틸 파일 작성**

`src/lib/defect-rate.ts`:

```ts
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
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `npm run build`
Expected: 빌드 성공 (새 파일이 아직 어디서도 import되지 않아도 컴파일 통과).

- [ ] **Step 3: 수동 검증 — 공식 동치 확인**

다음 값이 기존 공식과 같은지 손으로 1건 확인:
`adjustedRate(0, 0)` → `0.15`, `adjustedRate(3, 10)` → `(3 + 4.5)/(40) = 0.1875`.
Expected: 위 두 값이 나오는 구현인지 코드로 확인(실행 불필요, 검산).

- [ ] **Step 4: 커밋**

```bash
git add src/lib/defect-rate.ts
git commit -m "feat: 하자율 베이지안 보정 공통 유틸(defect-rate.ts) 추가"
```

---

## Task 2: species-stats-tab을 유틸로 위임 (회귀 무손실)

**Files:**
- Modify: `src/app/(dashboard)/species/species-stats-tab.tsx:16-38`

**Interfaces:**
- Consumes: Task 1의 `PRIOR_RATE`, `PRIOR_STRENGTH`, `adjustedRate`
- Produces: 기존 export 시그니처 유지 — `DEFAULT_AVG_DEFECT_RATE`, `DEFAULT_SAMPLE_SIZE`, `DEFAULT_MIN_PLANTING`, `calcAdjustedRate`, `getFinalRisk`, `SpeciesStatsTab`, 타입들 (소비처: summary-content.tsx, species-finder-tab.tsx, analytics-content.tsx).

- [ ] **Step 1: import 추가 및 상수/함수 위임**

`species-stats-tab.tsx` 상단 import 블록에 추가:

```ts
import { PRIOR_RATE, PRIOR_STRENGTH, adjustedRate } from '@/lib/defect-rate'
```

기존 16~38행을 아래로 교체 (export 이름은 그대로 유지해 소비처 무영향):

```ts
// 보정 상수·공식은 공통 유틸(@/lib/defect-rate)로 일원화됨. 외부 export 이름은 호환을 위해 유지.
export const DEFAULT_AVG_DEFECT_RATE = PRIOR_RATE
export const DEFAULT_SAMPLE_SIZE = PRIOR_STRENGTH
export const DEFAULT_MIN_PLANTING = 210

// ─── 타입 ─────────────────────────────────────────────────────────
export type SpeciesStat = {
  speciesNameKo: string
  groupName: string | null
  totalQty: number
  totalDefectQty: number
  defectRate: number  // 원본 하자율 (0.0 ~ 1.0)
}

export type RiskLevel = '위험' | '주의' | '보통' | '양호' | '표본부족' | '참고'
type FilterValue = '전체' | '위험' | '주의' | '보통' | '양호' | '표본부족'
```

그리고 기존 `calcAdjustedRate` 정의(33~38행)를 위임 형태로 교체:

```ts
export function calcAdjustedRate(defectQty: number, totalQty: number): number {
  return adjustedRate(defectQty, totalQty)
}
```

> 주의: 위 `RiskLevel`/`FilterValue`/`SpeciesStat` 타입 정의는 기존 파일에 이미 있다. 16~38행 교체 시 기존 타입 정의와 중복되지 않도록, **상수 3줄과 `calcAdjustedRate` 본문만** 교체하고 타입 블록은 원본 그대로 둔다. (위 코드 블록은 교체 후 16~38행의 최종 모습을 보인 것이며, 타입은 원본과 동일하다.)

- [ ] **Step 2: 빌드 통과 확인**

Run: `npm run build`
Expected: 성공. `DEFAULT_SAMPLE_SIZE` 등 미해결 참조 에러 없음.

- [ ] **Step 3: lint 통과 확인**

Run: `npm run lint`
Expected: 신규/변경 파일에 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/app/(dashboard)/species/species-stats-tab.tsx
git commit -m "refactor: species-stats-tab 보정 상수·공식을 공통 유틸로 위임"
```

---

## Task 3: species-finder-tab 로컬 중복 제거

**Files:**
- Modify: `src/app/(dashboard)/species/species-finder-tab.tsx:117-120,195`

**Interfaces:**
- Consumes: Task 1의 `adjustedRate`

- [ ] **Step 1: 로컬 calcAdjustedRate 제거 후 유틸 사용**

`species-finder-tab.tsx` 상단 import에 추가:

```ts
import { adjustedRate } from '@/lib/defect-rate'
```

117~120행 부근의 로컬 `calcAdjustedRate` 정의(주석 `// 하자율 기반 보정` 포함 함수)를 삭제한다.

195행의 호출부를 교체:

```ts
const adjustedRate_ = stat ? adjustedRate(defectQty, qty) : DEFAULT_AVG
```

> 변수명 충돌 주의: 195행은 결과를 `adjustedRate`라는 지역 변수에 담고 있다. import한 함수명과 충돌하므로, **지역 변수명을 `adjusted`로 바꾸고** 195행 이하 같은 스코프의 참조(202행 객체 속성 `adjustedRate` 값, 208행 정렬 비교 `a.adjustedRate`/`b.adjustedRate`)를 확인한다. 객체 속성 키 `adjustedRate:`는 유지하고 값만 `adjusted`로:

```ts
const adjusted = stat ? adjustedRate(defectQty, qty) : DEFAULT_AVG
// ...
return {
  // ...
  adjustedRate: adjusted,
  // ...
}
```

(202행이 `adjustedRate,` 단축 속성이면 `adjustedRate: adjusted,`로 변경. 208행 `a.adjustedRate`/`b.adjustedRate`는 객체 속성이므로 그대로 둔다.)

- [ ] **Step 2: 빌드 통과 확인**

Run: `npm run build`
Expected: 성공. `DEFAULT_AVG` 등 기존 참조 유지 확인.

- [ ] **Step 3: lint 통과 확인**

Run: `npm run lint`
Expected: 미사용 변수/중복 선언 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/app/(dashboard)/species/species-finder-tab.tsx
git commit -m "refactor: species-finder-tab 로컬 보정 함수 제거, 공통 유틸 사용"
```

---

## Task 4: page.tsx 인라인 베이지안 제거

**Files:**
- Modify: `src/app/(dashboard)/simulation/page.tsx:101-111,401-414`

**Interfaces:**
- Consumes: Task 1의 `adjustedRate`
- Produces: `speciesAvgRate`(보정값 동일), `seasonStrategyStats`(고위험 판정 동일) — 후속 태스크는 page.tsx의 다른 집계만 만짐.

- [ ] **Step 1: import 추가**

`page.tsx` 상단 import 블록에 추가:

```ts
import { adjustedRate, isLowSample } from '@/lib/defect-rate'
```

- [ ] **Step 2: speciesAvgRate 인라인 보정 교체 (101~111행)**

기존:

```ts
  const BAYESIAN_AVG = 0.15
  const BAYESIAN_SAMPLE = 30
  const speciesAvgRate: Record<string, number> = {}
  for (const [name, v] of aggMap) {
    speciesAvgRate[name] =
      v.qty > 0
        ? (v.defect + BAYESIAN_AVG * BAYESIAN_SAMPLE) / (v.qty + BAYESIAN_SAMPLE)
        : BAYESIAN_AVG
  }
```

교체:

```ts
  const speciesAvgRate: Record<string, number> = {}
  for (const [name, v] of aggMap) {
    speciesAvgRate[name] = adjustedRate(v.defect, v.qty)
  }
```

- [ ] **Step 3: seasonStrategyStats 고위험 판정 인라인 보정 교체 (401~414행)**

`// 베이지안 보정 상수는 위 speciesAvgRate 계산과 동일 ...` 주석과 그 아래 고위험 판정부에서:

```ts
      const adj = (v.defectQty + BAYESIAN_AVG * BAYESIAN_SAMPLE) / (v.qty + BAYESIAN_SAMPLE)
      if (adj >= 0.20) highRisk.push({ name, rate: adj })
```

교체:

```ts
      const adj = adjustedRate(v.defectQty, v.qty)
      if (adj >= 0.20) highRisk.push({ name, rate: adj })
```

`BAYESIAN_AVG`/`BAYESIAN_SAMPLE`를 참조하던 주석 줄도 정리(공통 유틸 사용으로 변경됐다는 한 줄 주석으로).

- [ ] **Step 4: 빌드 통과 확인**

Run: `npm run build`
Expected: 성공. `BAYESIAN_AVG`/`BAYESIAN_SAMPLE` 미사용 잔존 참조 없음.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(dashboard)/simulation/page.tsx"
git commit -m "refactor: page.tsx 인라인 베이지안 보정을 공통 유틸로 교체"
```

---

## Task 5: RegionData에 lowSample 추가 + seasonRegionData 보정

**Files:**
- Modify: `src/app/(dashboard)/simulation/korea-map.tsx:5-18`
- Modify: `src/app/(dashboard)/simulation/page.tsx:351-368`

**Interfaces:**
- Consumes: Task 4의 import(`adjustedRate`, `isLowSample`), Task 5의 `RegionData.lowSample`
- Produces: `RegionData.lowSample: boolean`, `seasonRegionData[].defect_rate`(보정값)·`lowSample`

- [ ] **Step 1: RegionData 타입에 lowSample 추가**

`korea-map.tsx`의 `RegionData` 타입(5~18행)에 필드 추가:

```ts
export type RegionData = {
  /** 영문 지역 키 (NAME_1 값) */
  region_key: string
  /** 한국어 표시명 */
  label: string
  /** 하자율 0~1 (베이지안 보정값) */
  defect_rate: number
  /** 예상 하자 수량 */
  defect_qty?: number
  /** 식재 수량 */
  planted_qty?: number
  /** 추천 수종 배열 */
  top_species?: string[]
  /** 원시 표본 부족 여부(보정값 신뢰도 낮음) */
  lowSample?: boolean
}
```

- [ ] **Step 2: bucketToRegionData 보정 적용 (page.tsx 351~368행)**

`bucketToRegionData` 내 반환 객체에서 `defect_rate` 산출과 `top_species` 정렬을 보정값으로, `lowSample` 추가:

```ts
  const bucketToRegionData = (m: Map<string, RegionBucket> | undefined): RegionData[] => {
    if (!m) return []
    return [...m.entries()].map(([regionKey, b]) => {
      const topSpecies = [...b.species.entries()]
        .map(([name, sv]) => ({ name, rate: adjustedRate(sv.defectQty, sv.qty) }))
        .sort((a, b2) => b2.rate - a.rate)
        .slice(0, 2)
        .map((s) => s.name)
      return {
        region_key: regionKey,
        label: REGION_KEY_TO_KO[regionKey] ?? regionKey,
        defect_rate: adjustedRate(b.defectQty, b.qty),
        defect_qty: b.defectQty,
        planted_qty: b.qty,
        top_species: topSpecies,
        lowSample: isLowSample(b.qty),
      }
    })
  }
```

- [ ] **Step 3: 빌드 통과 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(dashboard)/simulation/korea-map.tsx" "src/app/(dashboard)/simulation/page.tsx"
git commit -m "feat: 지역×계절 하자율 보정 + RegionData lowSample 플래그 추가"
```

---

## Task 6: heatmapData·seasonStrategyStats 전체율 보정

**Files:**
- Modify: `src/app/(dashboard)/simulation/page.tsx:217-231,402-421`

**Interfaces:**
- Consumes: Task 4의 `adjustedRate`

- [ ] **Step 1: heatmapData 보정 (217~231행)**

`heatmapData` 생성에서 계절별·평균 비율을 보정값으로:

```ts
  const heatmapData: HeatmapData[] = [...heatmapBuckets.entries()]
    .map(([name, seasons]) => {
      const totalQty = Object.values(seasons).reduce((s, v) => s + v.qty, 0)
      const totalDefect = Object.values(seasons).reduce((s, v) => s + v.defectQty, 0)
      const avgRate = adjustedRate(totalDefect, totalQty)
      const seasonRates: Record<string, number | null> = {}
      for (const k of SEASON_ORDER) {
        const b = seasons[k]
        seasonRates[k] = b && b.qty > 0 ? adjustedRate(b.defectQty, b.qty) : null
      }
      return { name, avgRate, inspected: totalQty, ...seasonRates } as HeatmapData
    })
    .filter((d) => d.avgRate > 0)
    .sort((a, b) => b.avgRate - a.avgRate)
    .slice(0, 20)
```

> 주의: `filter((d) => d.avgRate > 0)`는 보정 후엔 항상 참이 된다(보정값은 0보다 큼). 의도는 "데이터 있는 수종만"이므로, 필터를 `totalQty > 0` 기준으로 바꾼다. 위 map 단계에서 `inspected: totalQty`를 담으므로 필터를 `.filter((d) => d.inspected > 0)`로 교체한다.

최종 필터 줄:

```ts
    .filter((d) => d.inspected > 0)
```

- [ ] **Step 2: seasonStrategyStats 전체 defectRate 보정 (416~420행)**

```ts
    seasonStrategyStats[season] = {
      speciesCount: m.size,
      defectRate: adjustedRate(totalDefect, totalQty),
      highRiskSpecies: highRisk.slice(0, 3).map((s) => s.name),
    }
```

- [ ] **Step 3: 빌드 통과 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(dashboard)/simulation/page.tsx"
git commit -m "feat: 수종×계절 히트맵·계절 전체율에 하자율 보정 적용"
```

---

## Task 7: 지도 '표본부족' 배지 렌더

**Files:**
- Modify: `src/app/(dashboard)/simulation/korea-map.tsx:131-180`

**Interfaces:**
- Consumes: Task 5의 `RegionData.lowSample`

- [ ] **Step 1: 라벨/툴팁에 표본부족 표식 추가**

지도 라벨 영역(131~142행 `{data && (...)}` 블록)에서, `data.lowSample`이면 비율 텍스트 옆/아래에 작은 회색 표식을 추가:

```tsx
              {data && (
                <text
                  x={lx}
                  y={ly + 10}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill={textColor}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {(rate * 100).toFixed(1)}%{data.lowSample ? ' *' : ''}
                </text>
              )}
```

툴팁 영역(161~179행)에 표본부족 안내 줄 추가 (`tooltip.region.lowSample`일 때):

```tsx
          {tooltip.region.lowSample && (
            <p className="text-[#9CA3AF] mt-1 text-[10px]">* 표본 부족(보정 추정값)</p>
          )}
```

- [ ] **Step 2: 빌드 + lint 통과 확인**

Run: `npm run build && npm run lint`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(dashboard)/simulation/korea-map.tsx"
git commit -m "feat: 지도 소표본 지역에 표본부족 표식·툴팁 안내 추가"
```

---

## Task 8: summary-content import 경로 교체

**Files:**
- Modify: `src/app/(dashboard)/simulation/summary-content.tsx:12`

**Interfaces:**
- Consumes: Task 2의 `calcAdjustedRate`(species-stats-tab 재노출, 동작 불변)

- [ ] **Step 1: import 정리**

`summary-content.tsx:12`은 현재:

```ts
import { calcAdjustedRate, getFinalRisk, DEFAULT_MIN_PLANTING } from '../species/species-stats-tab'
```

`calcAdjustedRate`만 공통 유틸의 `adjustedRate`로 바꾸고, `getFinalRisk`·`DEFAULT_MIN_PLANTING`은 그대로 species-stats-tab에서 가져온다:

```ts
import { getFinalRisk, DEFAULT_MIN_PLANTING } from '../species/species-stats-tab'
import { adjustedRate } from '@/lib/defect-rate'
```

그리고 본문 두 호출부(203행, 264행)의 `calcAdjustedRate(...)`를 `adjustedRate(...)`로 교체:

```ts
// 203행
      const adjustedRate_v = adjustedRate(s.defect, s.inspected)
```

> 변수명 충돌 주의: 203행은 결과를 `const adjustedRate = ...`에 담는다. import한 함수명과 충돌하므로 지역 변수명을 `adjRate`로 바꾸고, 204행의 사용처(`getFinalRisk(s.inspected, adjustedRate)`와 객체 속성 `adjustedRate`)를 맞춘다:

```ts
      const adjRate = adjustedRate(s.defect, s.inspected)
      return { ...s, adjustedRate: adjRate, finalRisk: getFinalRisk(s.inspected, adjRate) }
```

264행도 동일하게 지역 변수 `adjustedRate`를 `adjRate`로:

```ts
    const adjRate = adjustedRate(s.defect, s.inspected)
    // 이하 adjustedRate 참조(266행 applyReplacement 조건)를 adjRate로 교체
    const applyReplacement = adjRate >= HIGH_RISK_THRESHOLD && improved != null && improved < currentRate
```

- [ ] **Step 2: 빌드 + lint 통과 확인**

Run: `npm run build && npm run lint`
Expected: 성공. 미사용 import/중복 선언 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(dashboard)/simulation/summary-content.tsx"
git commit -m "refactor: summary-content 보정 함수를 공통 유틸로 교체"
```

---

## Task 9: 회귀·통합 수동 검증

**Files:** (코드 변경 없음 — 검증 전용)

- [ ] **Step 1: 전체 빌드·lint**

Run: `npm run build && npm run lint`
Expected: 둘 다 성공.

- [ ] **Step 2: 회귀 검증 (최우선) — 수종 관리 화면 값 불변**

운영(`landscapingcs.vercel.app`) 또는 운영 DB 키로 띄운 로컬에서:
- 수종 관리(수목 현황) 탭의 **리스크 칩 종수**(위험/주의/보통/양호)와 **TOP5 수종·하자율**을 확인.
- 변경 전 기준값(메모리 [[treecs-session-2026-06-17]]: 목백합 50.2% 1위, 오죽 제외)과 **동일한지** 대조.
Expected: 완전히 동일. 다르면 Task 2의 위임이 무손실이 아님 → 원인 추적.

- [ ] **Step 3: 보정 효과 검증 — 지도 극단값 완화 + 배지**

요약 화면 지도에서 계절 탭 전환하며:
- 소표본 지역(이전 0%/100% 극단값 지점)에 `*` 표식 + 툴팁 '표본 부족' 안내 노출 확인.
- 보정으로 0%/100% 극단값이 사라졌는지 확인.
Expected: 소표본 지역 배지 표시, 극단값 완화.

- [ ] **Step 4: 더미 fallback 보존 확인**

로컬 빈 DB(실데이터 0건)에서 요약 화면 진입 → 지도/TOP5/협력사가 기존 더미값으로 정상 표시되는지 확인.
Expected: 빈 화면 없이 더미 fallback 표시.

- [ ] **Step 5: 최종 커밋(검증 메모) — 필요 시**

검증 중 미세 수정이 있었다면 커밋. 없으면 생략.

---

## Self-Review 결과

- **Spec 커버리지:** §4.1 유틸(Task1), §4.2 위임(Task2,3,4,8), §4.3 데이터보정(Task4,5,6), §4.4 화면·배지(Task5,7), 더미 fallback 보존(Task9 Step4), 회귀(Task9 Step2) — 전 항목 태스크 매핑 완료. spec엔 없던 `species-finder-tab.tsx` 4번째 중복을 Task3로 추가.
- **Placeholder:** 없음. 모든 코드 단계에 실제 코드 포함.
- **타입 일관성:** `adjustedRate`/`isLowSample`/`RegionData.lowSample` 이름이 전 태스크에서 일치. 지역 변수 충돌(`adjustedRate`)은 Task3/8에서 `adjusted`/`adjRate`로 명시 회피.
