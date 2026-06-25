// 'use server' 파일(upload.ts)은 async 함수만 export할 수 있으므로,
// 외부에서 공유되는 타입은 이 일반 모듈로 분리한다.

export type UploadResult = {
  success: boolean
  totalRows: number
  successCount: number
  failCount: number
  errors: string[]
}

// 하자율 예측 분석 엑셀 행 타입 (새 flat 테이블 구조 기준)
// 컬럼: 날짜, 현장코드, 현장명, 준공일, 식재시기, 협력사, 수종명,
//        수고 H(m), 수관폭 W(m), 흉고직경 B(cm), 근원직경 R(cm),
//        수량, 하자수량, 지역, 단가, 계절(수식), 규격, 리스크등급, 권장조치, 세부조치, 예상 예비비(d)
export type DefectAnalysisRow = {
  날짜?: string | number
  현장코드?: string
  현장명?: string
  준공일?: string | number
  식재시기?: string | number
  협력사?: string
  수종명?: string
  '수고 H(m)'?: number
  '수관폭 W(m)'?: number
  '흉고직경 B(cm)'?: number
  '근원직경 R(cm)'?: number
  수량?: number
  하자수량?: number           // 실제 하자수량 (하자율은 하자수량/수량으로 계산)
  지역?: string
  단가?: number
  '계절(수식)'?: string
  규격?: string
  리스크등급?: string
  권장조치?: string
  세부조치?: string
  '예상 예비비(₩)'?: number  // 새 양식 표기
  '예상 예비비(d)'?: number  // 구버전 호환
}
