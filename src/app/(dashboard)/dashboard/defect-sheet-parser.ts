/**
 * 하자율 예측 분석 엑셀 시트 파서 (클라이언트 측 파싱 전용 순수 함수).
 *
 * 호출 주체 : dashboard-client.tsx (엑셀 업로드 시 시트 → DefectAnalysisRow[] 변환)
 * 반환/전송 : 파싱 결과만 반환. 전송은 호출부가 /api/upload-excel POST로 수행.
 * 의존성   : xlsx(sheet_to_json), @/app/actions/upload-types(DefectAnalysisRow)
 *
 * ⚠️ dashboard-client.tsx에서 동작 동일하게(회귀 무손실) 추출한 것. 컬럼 매핑은
 *    업로드 양식과 결합되어 있으므로 양식 변경 시 함께 수정할 것.
 */

import * as XLSX from 'xlsx'
import type { DefectAnalysisRow } from '@/app/actions/upload-types'

/** 숫자 안전 변환 — 빈값·비수치 → undefined */
export function safeNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

/** 단가 문자열 파싱 ("6,000,000" → 6000000, "단가없음" 등 문자 포함 → null) */
export function parseUnitPrice(v: unknown): number | null {
  if (v == null || v === '') return null
  const s = String(v).replace(/,/g, '').trim()
  if (!s || /[가-힣a-zA-Z]/.test(s)) return null
  const n = Number(s)
  return isNaN(n) || n <= 0 ? null : n
}

/**
 * 하자율 예측 분석 시트 파싱 (flat 테이블 구조: 1행 헤더, 2행~ 데이터).
 * 컬럼 순서: 날짜(A), 현장코드(B), 현장명(C), 준공일(D), 식재시기(E), 협력사(F),
 *            수종명(G), 수고 H(m)(H), 수관폭 W(m)(I), 흉고직경 B(cm)(J), 근원직경 R(cm)(K),
 *            수량(L), 하자수량(M), 지역(N), 단가(O), 계절(수식)(P), 규격(Q),
 *            리스크등급(R), 권장조치(S), 세부조치(T), 예상 예비비(d)(U)
 */
export function parseDefectSheet(sheet: XLSX.WorkSheet): {
  rows: DefectAnalysisRow[]
} {
  const rawAll: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null })

  // 컬럼명 앞뒤 공백 제거 후 재매핑 (원데이터 컬럼명에 공백이 있을 수 있음)
  const raw = rawAll.map((r) => {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      cleaned[k.trim()] = typeof v === 'string' ? v.trim() : v
    }
    return cleaned
  })

  const rows: DefectAnalysisRow[] = raw
    .filter((r) => r['현장명'] || r['현장코드'] || r['수종명'])
    .map((r) => ({
      날짜: r['날짜'] as string | number | undefined ?? undefined,
      현장코드: r['현장코드'] != null ? String(r['현장코드']).trim() : undefined,
      현장명: r['현장명'] != null ? String(r['현장명']).trim() : undefined,
      준공일: r['준공일'] as string | number | undefined ?? undefined,
      식재시기: r['식재시기'] as string | number | undefined ?? undefined,
      협력사: r['협력사'] != null ? String(r['협력사']).trim() : undefined,
      수종명: r['수종명'] != null ? String(r['수종명']).trim() : undefined,
      '수고 H(m)': safeNum(r['수고 H(m)']),
      '수관폭 W(m)': safeNum(r['수관폭 W(m)']),
      '흉고직경 B(cm)': safeNum(r['흉고직경 B(cm)']),
      '근원직경 R(cm)': safeNum(r['근원직경 R(cm)']),
      수량: safeNum(r['수량']),
      하자수량: safeNum(r['하자수량']),
      지역: r['지역'] != null ? String(r['지역']).trim() : undefined,
      단가: parseUnitPrice(r['단가']) ?? undefined,
      '계절(수식)': r['계절(수식)'] != null ? String(r['계절(수식)']).trim() : undefined,
      규격: r['규격'] != null ? String(r['규격']).trim() : undefined,
      리스크등급: r['리스크등급'] != null ? String(r['리스크등급']).trim() : undefined,
      권장조치: r['권장조치'] != null ? String(r['권장조치']).trim() : undefined,
      세부조치: r['세부조치'] != null ? String(r['세부조치']).trim() : undefined,
      '예상 예비비(₩)': safeNum(r['예상 예비비(₩)']),
      '예상 예비비(d)': safeNum(r['예상 예비비(d)']),
    }))

  return { rows }
}
