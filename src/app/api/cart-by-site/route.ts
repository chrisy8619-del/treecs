/**
 * 현장별 활성(draft) 장바구니 조회 API. GET /api/cart-by-site?site_id=...
 *
 * 호출 주체 : simulation-client.tsx (현장 선택 시 기존 담기 내역 복원용 지연 조회)
 * 반환/전송 : { cart: Cart | null } JSON — substitution_carts(draft) + 항목 배열.
 *             카트 없으면 { cart: null } (생성은 담기 시점에 actions/cart.ts가 수행).
 * 의존성   : @/lib/supabase/server, @/app/actions/cart-types
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Cart, CartItem } from '@/app/actions/cart-types'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('site_id')
  if (!siteId) return NextResponse.json({ cart: null }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ cart: null }, { status: 401 })

  const { data: cart } = await supabase
    .from('substitution_carts')
    .select('id, site_id, status, title')
    .eq('site_id', siteId)
    .eq('status', 'draft')
    .maybeSingle()

  if (!cart) return NextResponse.json({ cart: null })

  const { data: items } = await supabase
    .from('substitution_cart_items')
    .select(
      'id, original_species_name, substitute_species_name, quantity, unit_price, original_rate, improved_rate, candidate_rank, source, reduction_rate, improved_defect_qty, improved_reserve_cost'
    )
    .eq('cart_id', cart.id)
    .order('created_at', { ascending: true })

  const mapped: CartItem[] = (items ?? []).map((row) => ({
    id: row.id,
    originalSpeciesName: row.original_species_name,
    substituteSpeciesName: row.substitute_species_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    originalRate: row.original_rate,
    improvedRate: row.improved_rate,
    candidateRank: row.candidate_rank,
    source: (row.source as CartItem['source']) ?? 'auto',
    reductionRate: row.reduction_rate,
    improvedDefectQty: row.improved_defect_qty,
    improvedReserveCost: row.improved_reserve_cost,
  }))

  const result: Cart = {
    id: cart.id,
    siteId: cart.site_id,
    status: cart.status,
    title: cart.title,
    items: mapped,
  }
  return NextResponse.json({ cart: result })
}
