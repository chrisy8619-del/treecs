# TreeCS 데이터 흐름 가이드 (온보딩용)

> 신규 개발자가 "이 화면의 데이터가 어디서 와서 어디로 가는지"를 코드 없이 파악하기 위한 문서.
> 각 파일 상단 헤더 주석(표준: `CONVENTIONS.md`)과 상호 보완한다.
> 하자율 계산의 수학적 근거는 `charts-computation-reference.md` 참조.

---

## 1. 전체 아키텍처 한눈에

```
[브라우저]
   │
   ▼ 라우트 진입
[page.tsx (서버 컴포넌트, SSR)] ── Supabase 직접 쿼리 (읽기)
   │  props
   ▼
['use client' 컴포넌트] ─┬─ fetch → [app/api/* (route.ts)] ── Supabase (읽기/배치쓰기)
                         └─ 호출  → [app/actions/* (서버 액션)] ── Supabase (쓰기)
                                        │
                                        ▼ 성공 시
                                   revalidatePath(...) → 관련 화면 재렌더
```

- **읽기(초기)**: page.tsx가 SSR에서 Supabase 직접 쿼리 → props로 클라이언트에 주입
- **읽기(지연)**: 클라이언트가 사용자 액션(현장 선택 등) 시 `/api/*` fetch
- **쓰기**: 서버 액션(`app/actions/*`) 또는 배치 API(`/api/upload-excel`) → 성공 시 `revalidatePath`

---

## 2. 대표 흐름 A — 시뮬레이터: 대체수종 담기 → 확정

```
/simulation 진입
│
├─ ① simulation/page.tsx (SSR)
│    Supabase 4개 병렬 쿼리:
│    sites · species_substitutions · planting_records(수종별 평균) · alternative_species_recommendations
│    → 보정(adjustedRate)·정렬 후 props 전달
│
├─ ② dashboard-tabs-client.tsx  ── 탭 분배(요약/대시보드/시뮬레이터)
│
├─ ③ simulation-client.tsx (시뮬레이터 탭)
│    현장 선택 → fetch /api/plantings-by-site (식재목록)
│              → fetch /api/cart-by-site      (기존 담기 내역 복원)
│    대체수종 추천 = lib/substitute-recommender.ruleBasedRecommender
│      1순위 DB맵(species_substitutions) → 2순위 지역·계절표(altRecs) → 3순위 현장 내 저위험 폴백
│
├─ ④ [담기] 클릭 → actions/cart.ts upsertCartItem
│    substitution_carts(draft 확보) + substitution_cart_items(스냅샷 저장)
│    → revalidatePath('/simulation')
│
└─ ⑤ [적용(확정)] → actions/cart.ts confirmCart
     draft → confirmed 전환 → revalidatePath('/simulation') → 화면 갱신
```

## 3. 대표 흐름 B — 엑셀 업로드 (하자율 예측 분석)

```
설정>업로드 탭(settings/upload-tab.tsx) 또는 대시보드(dashboard-client.tsx)
│
├─ ① 클라이언트에서 xlsx 파싱 (행 → JSON)
├─ ② BATCH_SIZE(lib/upload-config) 단위로 반복 POST /api/upload-excel
│    │  (설정 탭의 식재/점검 업로드는 actions/upload.ts 서버 액션 경유)
│    ▼
├─ ③ api/upload-excel/route.ts
│    sites/contractors/species/spec_codes 자동 생성(미존재 시)
│    planting_records insert + upload_logs 기록
│    행별 실패는 errors[]로 수집(전체 중단 없음)
│
└─ ④ 마지막 배치(isLast)에서만 revalidatePath('/analytics','/plantings','/settings','/dashboard')
     응답 { successCount, failCount, errors[] } → 진행률/결과 UI 표시
```

---

## 4. 화면 ↔ 서버 진입점 ↔ 테이블 매핑표

| 화면(라우트) | SSR 쿼리(page.tsx) | 클라이언트 fetch | 쓰기(액션/API) | 주요 테이블 |
|---|---|---|---|---|
| /simulation | sites, species_substitutions, planting_records, alternative_species_recommendations | /api/plantings-by-site, /api/cart-by-site | actions/cart.ts(담기·확정), actions/substitution.ts(맵 업로드) | substitution_carts, substitution_cart_items, species_substitutions |
| /dashboard | sites | /api/plantings-by-site | /api/upload-excel(하자분석) | planting_records, upload_logs |
| /settings(업로드) | — | — | actions/upload.ts(식재·점검), /api/upload-excel(하자분석) | planting_records, inspection_items, sites, species, contractors, spec_codes, upload_logs |
| /analytics 등 | 각 page.tsx 직접 쿼리 | — | — | planting_records, inspection_items |
| 로그인/가입 | — | — | actions/auth.ts | profiles (+ Supabase Auth) |

### revalidatePath 매핑 (쓰기 → 갱신 화면)

| 쓰기 지점 | revalidate 대상 |
|---|---|
| actions/cart.ts (모든 변경) | /simulation |
| actions/substitution.ts | /simulation |
| actions/upload.ts uploadPlantingRecords | /plantings, /settings |
| actions/upload.ts uploadInspectionResults | /inspections, /settings |
| actions/upload.ts uploadDefectAnalysisBatch | /analytics, /plantings, /settings, /dashboard |
| api/upload-excel (isLast) | /analytics, /plantings, /settings, /dashboard |

---

## 5. 회귀 불변 지점 (수정 금지 라인)

하자율·절감 숫자의 원천. 리팩토링(순수 추출)에서 이 계산식이 바뀌면 즉시 롤백 대상.

- `lib/defect-rate.ts` — `adjustedRate` (베이지안 보정, prior 0.15 · strength 30)
- `lib/summary-savings.ts` — 절감 3시나리오 (보수/확장/최대)
- `lib/substitute-recommender.ts` — 추천 3단계 폴백 규칙
- `simulation/page.tsx` — SSR 집계 로직

## 6. 알려진 정리 후보 (동작 영향 없음, 별도 판단)

- `/api/species-defect-avg`, `/api/substitutions` — src 내 호출처 없음 (SSR 직접 쿼리로 대체됨)
- `api/upload-excel/route.ts`의 `safeNum`/`parseUnitPrice`/`excelDateToString` — `actions/upload.ts`와 중복 구현
- `lib/supabase/admin.ts` — 미사용
