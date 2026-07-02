# 리팩토링 검증 기준선 (T0.2)

> refactor 브랜치 작업 중 이 기준선을 **악화시키면 커밋 금지**.
> 캡처 시점: refactor 브랜치 분기 직후 (main 기준 상태)
> 패키지 매니저: **pnpm** (pnpm-lock.yaml, npm 아님 — `npm install` 사용 금지)

## 정적 검증 기준선

| 검사 | 명령 | 기준선 결과 |
|------|------|------------|
| 타입체크 | `npx tsc --noEmit` | **에러 0** (exit 0, clean) |
| 린트 | `pnpm lint` | **26 problems (10 errors, 16 warnings)** |
| 빌드 | `pnpm build` | **성공** (19 라우트 생성) |

### 린트 기존 문제 규칙별 집계 (이미 존재하던 것 — 신규 유입 금지 기준)
- `react-hooks/set-state-in-effect` : 9 (errors 주범)
- `@typescript-eslint/no-unused-vars` : 15 (warnings 주범)
- `react-hooks/exhaustive-deps` : 1
- `react-hooks/static-components` : 1

> 위 에러/워닝은 **기존 코드에 이미 있던 것**. 리팩토링으로 이 숫자가 늘면 안 됨.
> (여유가 되면 unused-vars 워닝 일부는 정리 가능하나 필수 아님.)

## 회귀 골든값 (T0.3) — 채워넣기 TODO

Vercel preview 배포 후 아래 값을 main과 대조. **실행 시점에 사용자와 함께 캡처 필요.**

- [ ] 시뮬레이터 '만촌' 현장: 기존 하자율 __ / 개선 후 하자율 __ / 절감효과 __% / 리스크 카운트(고__ 중__ 저__)
- [ ] 대시보드: 전체 하자율 __ / 상위 수종 하자율 표
- [ ] 업로드: 하자율 예측 엑셀 1개 → 성공 __ / 실패 __ 건
- [ ] defect-rate 소표본 수종 보정 하자율 1~2개: __
