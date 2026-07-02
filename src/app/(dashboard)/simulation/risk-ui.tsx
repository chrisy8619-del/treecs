/**
 * 시뮬레이터 표의 리스크 표시 유틸 + 헤더 도움말 UI (상태 없는 순수 모듈).
 *
 * 호출 주체 : simulation-client.tsx (표 렌더 시 등급 스타일·헤더 셀 구성)
 * 반환/전송 : 스타일 설정 객체/정적 헤더 정의/툴팁 컴포넌트만 제공 (side effect 없음)
 * 의존성   : lucide-react(HelpCircle)
 *
 * ⚠️ simulation-client.tsx에서 동작 동일하게(회귀 무손실) 추출한 것.
 *    riskConfig 임계치(0.20/0.10)는 리스크 등급 판정 기준 — 임의 변경 금지.
 */

import { HelpCircle } from 'lucide-react'

/** 보정 하자율 → 리스크 등급 라벨/색상 클래스 (null이면 '-' 회색) */
export function riskConfig(rate: number | null) {
  if (rate === null) return { label: '-', color: 'text-gray-400', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' }
  if (rate >= 0.20) return { label: '고위험', color: 'text-red-600', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  if (rate >= 0.10) return { label: '중위험', color: 'text-orange-500', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' }
  return { label: '저위험', color: 'text-green-600', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
}

/** 표 헤더 셀 정의 — hint가 있으면 라벨 옆에 도움말(?) 아이콘 + hover 툴팁을 표시한다. */
export type TableHeader = { label: string; hint?: string }

export const TABLE_HEADERS: TableHeader[] = [
  { label: 'No.' },
  { label: '원수종' },
  { label: '수량 (주)' },
  { label: '하자율(현재기준)', hint: '이 현장에서 실제 발생한 하자율입니다. 표본(식재 수량)이 적으면 값이 크게 흔들릴 수 있습니다.' },
  { label: '수목하자율', hint: '전체 현장 데이터로 보정한 평균 하자율입니다. 리스크 등급과 대체 수종 적용은 이 값을 기준으로 판정합니다.' },
  { label: '리스크 등급' },
  { label: '대체 수종 선택' },
  { label: '개선 하자율' },
  { label: '저감 효과' },
  { label: '개선 후 예상 하자수량' },
  { label: '권장 조치' },
  { label: '세부 조치' },
]

/** 어두운 표 헤더(bg-[#1a3a2a]) 위에 흰색 hover 툴팁을 띄우는 도움말 아이콘. */
export function HeaderHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <HelpCircle className="h-3 w-3 text-white/60 hover:text-white cursor-help" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-normal leading-snug text-gray-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white" />
      </span>
    </span>
  )
}
