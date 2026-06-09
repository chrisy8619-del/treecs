# 대시보드(시뮬레이션) 페이지 설계 — 2026-06-08

## 개요

현장 하자율 예측 및 대체 수종 시뮬레이션 페이지를 신규 추가한다.
URL: `/simulation`, 사이드바 메뉴명: `대시보드`

---

## 라우트 및 파일 구조

```
src/app/(dashboard)/simulation/
  page.tsx               — 서버 컴포넌트 (현장 목록 + 대체수종 매핑 fetch)
  simulation-client.tsx  — 클라이언트 컴포넌트 (인터랙션 전체)
src/app/actions/substitution.ts  — 대체수종 엑셀 업로드 서버 액션
src/app/api/substitutions/route.ts — 대체수종 매핑 조회 API
supabase/migrations/add_species_substitutions.sql
public/logo.png  — 나무 로고 이미지
```

---

## DB 스키마

```sql
CREATE TABLE species_substitutions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  original_species_id   UUID NOT NULL REFERENCES species(id),
  substitute_species_id UUID NOT NULL REFERENCES species(id),
  improved_defect_rate  NUMERIC(6,4) NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, original_species_id, substitute_species_id)
);
```

---

## 엑셀 업로드 포맷 (대체수종 매핑)

| 원수종명 | 대체수종명 | 개선하자율(%) |
|---------|----------|------------|
| 서양측백 | 느티나무  | 15.00      |

- 헤더 1행 고정
- 개선하자율은 % 단위 (15.00 → 0.15로 저장)
- 원수종/대체수종 모두 species 테이블에 없으면 자동 생성

---

## 페이지 구성

### 1. 상단 헤더
- 좌측: 나무 로고(logo.png) + "현장 하자율 예측 및 대체 수종 시뮬레이션"
- 우측 버튼: AI 분석 생성(비활성) / 파일 내보내기 / 새로고침 / 설정

### 2. 현장 기본 정보
- 현장코드·현장명·협력사 카드 (자동완성 드롭다운, 기존 dashboard 방식 동일)
- KPI 3개: 기존 예상 하자율 / 개선 후 하자율(대체 적용 시) / 저감 효과(p 단위)

### 3. 전체 리스크 요약 바
- 고위험 수종 수 / 중위험 수종 수 / 저위험 수종 수 / 대체 추천 가능 수종 수
- 우측: "대체 적용 시 기대 효과" 텍스트 (평균 저감 %p 자동 계산)

### 4. AI 분석 요약 (UI 틀만)
- 4개 박스: 대체 효과 요약 / 우선 대체 대상 수종 / 계절 영향 / 관리 포인트
- "AI 분석 생성" 버튼 클릭 전에는 placeholder 텍스트 표시

### 5. 수종별 하자율 저감 시뮬레이션 테이블
컬럼: No / 원수종 / 수량(주) / 기존 하자율 / 리스크 등급 / 대체 수종 선택(드롭다운) / 개선 하자율 / 저감 효과 / 개선 후 예상 하자수량 / 권장 조치 / 세부 조치

- 대체 수종 드롭다운: species_substitutions에서 해당 원수종의 매핑 목록 표시
- 드롭다운 선택 시 개선 하자율·저감 효과·개선 후 하자수량 즉시 계산
- 저위험 수종은 "유지 관리" 표시 (드롭다운 비활성)
- 리스크 등급별 색상: 고위험=빨강, 중위험=주황, 저위험=초록

---

## 계산 로직

```
저감 효과(%p) = 기존 하자율 - 개선 하자율
개선 후 예상 하자수량 = ROUND(수량 × 개선 하자율)
전체 개선 후 하자율 = Σ(수량 × 개선 하자율) / Σ수량  (대체 선택된 수종만 반영)
전체 저감 효과 = 기존 전체 하자율 - 개선 후 전체 하자율
```

---

## 사이드바

- 기존 `navMain` 배열 맨 앞에 `{ title: '대시보드', href: '/simulation', icon: LayoutDashboard }` 추가
- 기존 `현장 하자율 예측 분석` 항목은 유지

---

## 헤더 로고

- `public/logo.png` 저장
- simulation 페이지 헤더 좌측에 `<Image>` 컴포넌트로 삽입 (32×32)
- analytics 페이지 헤더에도 동일 적용

---

## 추후 연동 (AI)

- "AI 분석 생성" 버튼 클릭 → Claude API 호출
- 입력: 현장 수종 목록, 하자율, 선택된 대체 수종, 계절
- 출력: 4개 박스 텍스트 채움
