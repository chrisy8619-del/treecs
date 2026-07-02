# 코드 문서화 표준 (treecs)

> 이 문서는 리팩토링 과정에서 확정한 **파일/함수 문서화 규칙**이다.
> 목적: 코드리뷰 지적 "이게 어디로 호출/전송하는지 상세히 안 적혀 있다"를 정면 해결.
> 기준 레퍼런스: `src/lib/defect-rate.ts`, `src/lib/summary-savings.ts` (이미 이 스타일을 따름).
> 언어: **한국어 주석** (전역 CLAUDE.md 규칙). 식별자는 영어.

---

## 1. 파일 상단 헤더 주석

모든 **비자명 모듈**(액션/페이지/거대 컴포넌트/도메인 유틸)은 파일 최상단에 헤더를 둔다.
단순 재export나 shadcn 생성물(`components/ui/*`)은 예외.

### 템플릿

```ts
/**
 * [파일 역할] 한 문장 요약.
 *
 * 호출 주체 : 누가 이 파일을 import/렌더/호출하는가 (파일 경로 명시)
 * 반환/전송 : 무엇을 반환하거나 어디로 전송하는가
 *             - 서버액션: 어느 테이블에 write, revalidatePath 대상 경로
 *             - 클라이언트: 부모에게 올리는 콜백 / fetch 대상 API 경로
 * 의존성   : 핵심 의존 모듈 (@/lib/*, actions/*, api/*)
 * 데이터흐름: (해당 시) page.tsx SSR → 이 파일 → 액션 → revalidate
 */
```

- **호출 주체 / 반환·전송** 두 항목이 이 표준의 핵심 (코드리뷰 지적 대응).
- 짧은 유틸은 `defect-rate.ts`처럼 `//` 3줄 요약으로 대체 가능. 요점은 "왜/전제/함정".

### 예시 (액션)

```ts
'use server'
/**
 * 시뮬레이터 장바구니(대체수종 선택) 서버 액션.
 *
 * 호출 주체 : simulation-client.tsx (담기/삭제/확정 버튼)
 * 반환/전송 : cart_items·cart_sessions 테이블 write.
 *             성공 시 revalidatePath('/simulation')로 최신 카트 재렌더.
 * 의존성   : @/lib/supabase/server, ./cart-types
 * 데이터흐름: simulation-client → upsertCartItem/confirmCart → Supabase → revalidate
 */
```

---

## 2. JSDoc 규칙

- 모든 `export` 함수/컴포넌트에 JSDoc.
- `@param`은 **자명하지 않은 인자에만** (한국어 설명). 자명한 것은 생략(노이즈 방지).
- 서버 액션: `@returns`에 성공/실패 형태 + side effect(어느 `revalidatePath`) 명시.
- 컴포넌트 Props: `type Props`의 각 필드에 인라인 주석 (기존 `speciesAvgRate` 스타일 유지).

```ts
/**
 * 수종별 식재 집계와 개선율 맵으로 3개 절감 시나리오를 계산한다.
 * @param speciesData 전체 현장 수종 합산 ({ name, inspected, defect }).
 * @param improvedRateMap 원수종명 → 최선(최저) 개선 하자율.
 * @returns 보수/확장/최대 시나리오별 절감 결과.
 */
```

---

## 3. 인라인 주석 규칙

- **비자명 로직에만** `//` 인라인. 자명한 코드에 주석 금지.
- 주석은 **"무엇"이 아니라 "왜/전제/함정"**을 적는다.
  - ✅ `// 보정 후 avgRate는 항상 0보다 크므로 0-나눗셈 불가`
  - ❌ `// avgRate를 계산한다` (코드가 이미 말함)
- 타입 필드 인라인 주석은 권장 (`summary-savings.ts`의 `ScenarioResult` 참고).

---

## 4. 적용 우선순위

1. `actions/*` — 호출 주체/반환·전송/revalidate 필수 (리뷰 지적 핵심)
2. `app/**/page.tsx`, 거대 client 컴포넌트 — 데이터 흐름 헤더
3. `api/**/route.ts` — 요청 형태/응답 형태/호출처
4. `lib/*` — JSDoc 빠진 곳 보강

## 5. 하지 말 것

- 자명한 코드 주석으로 도배 (노이즈)
- 주석과 코드 불일치 방치 (리팩토링 시 주석도 함께 갱신)
- `components/ui/*`(shadcn 생성물) 헤더 추가 — 업스트림 관리 대상이라 건드리지 않음
