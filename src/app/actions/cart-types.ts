// 대체수종 장바구니 관련 공유 타입.
// 'use server' 파일(cart.ts)은 async 함수만 export 가능하므로 타입은 별도 모듈로 분리한다.

export type CartItemSource = 'db' | 'altrec' | 'auto' | 'finder'

// 담기/교체 시 클라이언트가 전달하는 입력 단위 = "대체 결정"
export type CartItemInput = {
  originalSpeciesName: string
  substituteSpeciesName: string
  quantity: number | null
  unitPrice: number | null
  originalRate: number | null
  improvedRate: number | null
  candidateRank: number | null
  source: CartItemSource
}

// DB에 저장된 항목(트리거 파생값 포함)
export type CartItem = CartItemInput & {
  id: string
  reductionRate: number | null
  improvedDefectQty: number | null
  improvedReserveCost: number | null
}

// 카트 상태
export type CartStatus = 'draft' | 'confirmed'

export type Cart = {
  id: string
  siteId: string
  status: CartStatus
  title: string | null
  items: CartItem[]
}

// 서버 액션 공통 반환 — 성공 시 갱신된 전체 카트(낙관적 업데이트 롤백 기준)
export type CartActionResult =
  | { success: true; cart: Cart }
  | { success: false; error: string }
