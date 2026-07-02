// 엑셀 날짜 값 → 'YYYY-MM-DD' 문자열 변환 공통 유틸 (서버 전용 아님, 순수 함수).
// actions/upload.ts와 api/upload-excel/route.ts에 중복 구현돼 있던 것을 통합했다
// (두 구현은 동작 동일 — actions 버전 기준). 'use server' 파일은 동기 함수를
// export할 수 없으므로 별도 모듈로 분리한다.

/**
 * 엑셀 날짜 → YYYY-MM-DD 변환 (모든 입력 형식을 일관되게 처리).
 * 지원 형식: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, YYYY.MM, YYYY년 MM월, 엑셀 시리얼.
 * @returns 인식 불가 형식이면 null.
 */
export function excelDateToString(val: unknown): string | null {
  if (val == null || val === '') return null

  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return null
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, '-')
    // YYYY.MM.DD
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) return s.replace(/\./g, '-')
    // YYYY.MM 또는 YYYY/MM (연월만)
    if (/^\d{4}[./]\d{2}$/.test(s)) {
      const [y, m] = s.split(/[./]/)
      return `${y}-${m.padStart(2, '0')}-01`
    }
    // YYYY년 MM월 또는 YYYY년MM월
    const yearMonth = s.match(/^(\d{4})년\s*(\d{1,2})월/)
    if (yearMonth) return `${yearMonth[1]}-${yearMonth[2].padStart(2, '0')}-01`
    // YYYY-MM (연월만)
    if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`
    // 그 외 문자열 → Date 파싱
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return null
  }

  if (typeof val === 'number') {
    // YYYY.MM 숫자 형태 (예: 2022.12)
    if (val > 1900 && val < 2200 && String(val).includes('.')) {
      const [y, m] = String(val).split('.')
      return `${y}-${m.padStart(2, '0')}-01`
    }
    // 엑셀 날짜 시리얼 (1900.01.01 기준)
    if (val > 25569) {
      const ms = (val - 25569) * 86400 * 1000
      const d = new Date(ms)
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
  }

  return null
}
