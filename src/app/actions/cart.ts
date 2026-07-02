'use server'
/**
 * 시뮬레이터 장바구니(대체수종 선택) 서버 액션.
 *
 * 호출 주체 : simulation-client.tsx (담기·일괄담기·삭제·비우기·확정 버튼)
 * 반환/전송 : cart_sessions·cart_items 테이블 write. 모든 변경 액션은
 *             성공 시 revalidatePath('/simulation')로 최신 카트를 재렌더한다.
 *             반환은 CartActionResult({ success, cart?, error? }).
 * 의존성   : @/lib/supabase/server(서버 클라이언트), ./cart-types(공유 타입)
 * 데이터흐름: simulation-client → upsertCartItem/confirmCart 등 → Supabase → revalidate('/simulation')
 *
 * 내부 헬퍼(resolveOrg/resolveSpeciesId 등)는 'use server' 제약상 비-export.
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type {
  Cart,
  CartItem,
  CartItemInput,
  CartActionResult,
} from './cart-types'

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼 (모두 비-export — 'use server' 제약)
// ─────────────────────────────────────────────────────────────

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

// 인증 + 조직 해석 (substitution.ts:19-32 패턴)
async function resolveOrg(
  supabase: SupabaseServer
): Promise<{ userId: string; orgId: string } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()

  let orgId = profile?.organization_id
  if (!orgId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .maybeSingle()
    orgId = org?.id
  }
  if (!orgId) return null
  return { userId: user.id, orgId }
}

// 수종명 → id 매핑. 미존재 시 AUTO 생성 (substitution.ts:67-77 패턴)
async function resolveSpeciesId(
  supabase: SupabaseServer,
  name: string
): Promise<string | null> {
  if (!name) return null
  const { data: existing } = await supabase
    .from('species')
    .select('id')
    .eq('species_name_ko', name)
    .maybeSingle()
  if (existing?.id) return existing.id

  const code = `AUTO_${name.slice(0, 4).replace(/\s/g, '_')}_${Date.now() % 10000}`
  const { data: created } = await supabase
    .from('species')
    .insert({ species_name_ko: name, species_code: code })
    .select('id')
    .single()
  return created?.id ?? null
}

// DB row → CartItem 매핑
type CartItemRow = {
  id: string
  original_species_name: string
  substitute_species_name: string
  quantity: number | null
  unit_price: number | null
  original_rate: number | null
  improved_rate: number | null
  candidate_rank: number | null
  source: string | null
  reduction_rate: number | null
  improved_defect_qty: number | null
  improved_reserve_cost: number | null
}

function mapItem(row: CartItemRow): CartItem {
  return {
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
  }
}

// 현장의 활성(draft) 카트 id 확보 — 없으면 생성
async function ensureCartId(
  supabase: SupabaseServer,
  orgId: string,
  userId: string,
  siteId: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('substitution_carts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('site_id', siteId)
    .eq('status', 'draft')
    .maybeSingle()
  if (existing?.id) return existing.id

  const { data: created } = await supabase
    .from('substitution_carts')
    .insert({
      organization_id: orgId,
      site_id: siteId,
      status: 'draft',
      created_by: userId,
    })
    .select('id')
    .single()
  return created?.id ?? null
}

// 카트 + 항목 전체 조회 → Cart 반환
async function loadCart(
  supabase: SupabaseServer,
  cartId: string
): Promise<Cart | null> {
  const { data: cart } = await supabase
    .from('substitution_carts')
    .select('id, site_id, status, title')
    .eq('id', cartId)
    .maybeSingle()
  if (!cart) return null

  const { data: items } = await supabase
    .from('substitution_cart_items')
    .select(
      'id, original_species_name, substitute_species_name, quantity, unit_price, original_rate, improved_rate, candidate_rank, source, reduction_rate, improved_defect_qty, improved_reserve_cost'
    )
    .eq('cart_id', cartId)
    .order('created_at', { ascending: true })

  return {
    id: cart.id,
    siteId: cart.site_id,
    status: cart.status,
    title: cart.title,
    items: (items ?? []).map(mapItem),
  }
}

// ─────────────────────────────────────────────────────────────
// 서버 액션 (export — 모두 async)
// ─────────────────────────────────────────────────────────────

// 현장 활성 카트 확보 후 반환 (없으면 생성)
export async function getOrCreateCart(siteId: string): Promise<CartActionResult> {
  if (!siteId) return { success: false, error: '현장 정보가 필요합니다.' }
  const supabase = await createClient()
  const org = await resolveOrg(supabase)
  if (!org) return { success: false, error: '인증 또는 조직 정보가 없습니다.' }

  const cartId = await ensureCartId(supabase, org.orgId, org.userId, siteId)
  if (!cartId) return { success: false, error: '장바구니 생성에 실패했습니다.' }

  const cart = await loadCart(supabase, cartId)
  if (!cart) return { success: false, error: '장바구니 조회에 실패했습니다.' }
  return { success: true, cart }
}

// 항목 담기/교체 (원수종당 upsert)
export async function upsertCartItem(
  siteId: string,
  item: CartItemInput
): Promise<CartActionResult> {
  if (!siteId) return { success: false, error: '현장 정보가 필요합니다.' }
  if (!item.originalSpeciesName || !item.substituteSpeciesName) {
    return { success: false, error: '원수종·대체수종이 필요합니다.' }
  }
  const supabase = await createClient()
  const org = await resolveOrg(supabase)
  if (!org) return { success: false, error: '인증 또는 조직 정보가 없습니다.' }

  const cartId = await ensureCartId(supabase, org.orgId, org.userId, siteId)
  if (!cartId) return { success: false, error: '장바구니 생성에 실패했습니다.' }

  const originalId = await resolveSpeciesId(supabase, item.originalSpeciesName)
  const substituteId = await resolveSpeciesId(supabase, item.substituteSpeciesName)

  const { error } = await supabase
    .from('substitution_cart_items')
    .upsert(
      {
        cart_id: cartId,
        original_species_id: originalId,
        original_species_name: item.originalSpeciesName,
        substitute_species_id: substituteId,
        substitute_species_name: item.substituteSpeciesName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        original_rate: item.originalRate,
        improved_rate: item.improvedRate,
        candidate_rank: item.candidateRank,
        source: item.source,
      },
      { onConflict: 'cart_id,original_species_name' }
    )
  if (error) return { success: false, error: error.message }

  const cart = await loadCart(supabase, cartId)
  if (!cart) return { success: false, error: '장바구니 조회에 실패했습니다.' }
  revalidatePath('/simulation')
  return { success: true, cart }
}

// 여러 항목 일괄 담기 (handleBulkApply 대응)
export async function bulkUpsertCartItems(
  siteId: string,
  items: CartItemInput[]
): Promise<CartActionResult> {
  if (!siteId) return { success: false, error: '현장 정보가 필요합니다.' }
  const supabase = await createClient()
  const org = await resolveOrg(supabase)
  if (!org) return { success: false, error: '인증 또는 조직 정보가 없습니다.' }

  const cartId = await ensureCartId(supabase, org.orgId, org.userId, siteId)
  if (!cartId) return { success: false, error: '장바구니 생성에 실패했습니다.' }

  const valid = items.filter((i) => i.originalSpeciesName && i.substituteSpeciesName)
  if (valid.length > 0) {
    // 수종 id는 항목별로 해석 (순차 — 소량이므로 충분)
    const rows = []
    for (const item of valid) {
      const originalId = await resolveSpeciesId(supabase, item.originalSpeciesName)
      const substituteId = await resolveSpeciesId(supabase, item.substituteSpeciesName)
      rows.push({
        cart_id: cartId,
        original_species_id: originalId,
        original_species_name: item.originalSpeciesName,
        substitute_species_id: substituteId,
        substitute_species_name: item.substituteSpeciesName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        original_rate: item.originalRate,
        improved_rate: item.improvedRate,
        candidate_rank: item.candidateRank,
        source: item.source,
      })
    }
    const { error } = await supabase
      .from('substitution_cart_items')
      .upsert(rows, { onConflict: 'cart_id,original_species_name' })
    if (error) return { success: false, error: error.message }
  }

  const cart = await loadCart(supabase, cartId)
  if (!cart) return { success: false, error: '장바구니 조회에 실패했습니다.' }
  revalidatePath('/simulation')
  return { success: true, cart }
}

// 항목 제거 (원수종명 기준)
export async function removeCartItem(
  siteId: string,
  originalSpeciesName: string
): Promise<CartActionResult> {
  if (!siteId) return { success: false, error: '현장 정보가 필요합니다.' }
  const supabase = await createClient()
  const org = await resolveOrg(supabase)
  if (!org) return { success: false, error: '인증 또는 조직 정보가 없습니다.' }

  const cartId = await ensureCartId(supabase, org.orgId, org.userId, siteId)
  if (!cartId) return { success: false, error: '장바구니 생성에 실패했습니다.' }

  const { error } = await supabase
    .from('substitution_cart_items')
    .delete()
    .eq('cart_id', cartId)
    .eq('original_species_name', originalSpeciesName)
  if (error) return { success: false, error: error.message }

  const cart = await loadCart(supabase, cartId)
  if (!cart) return { success: false, error: '장바구니 조회에 실패했습니다.' }
  revalidatePath('/simulation')
  return { success: true, cart }
}

// 카트 비우기
export async function clearCart(siteId: string): Promise<CartActionResult> {
  if (!siteId) return { success: false, error: '현장 정보가 필요합니다.' }
  const supabase = await createClient()
  const org = await resolveOrg(supabase)
  if (!org) return { success: false, error: '인증 또는 조직 정보가 없습니다.' }

  const cartId = await ensureCartId(supabase, org.orgId, org.userId, siteId)
  if (!cartId) return { success: false, error: '장바구니 생성에 실패했습니다.' }

  const { error } = await supabase
    .from('substitution_cart_items')
    .delete()
    .eq('cart_id', cartId)
  if (error) return { success: false, error: error.message }

  const cart = await loadCart(supabase, cartId)
  if (!cart) return { success: false, error: '장바구니 조회에 실패했습니다.' }
  revalidatePath('/simulation')
  return { success: true, cart }
}

// 카트 확정 (draft → confirmed, 이력화)
export async function confirmCart(siteId: string): Promise<CartActionResult> {
  if (!siteId) return { success: false, error: '현장 정보가 필요합니다.' }
  const supabase = await createClient()
  const org = await resolveOrg(supabase)
  if (!org) return { success: false, error: '인증 또는 조직 정보가 없습니다.' }

  const { data: cart } = await supabase
    .from('substitution_carts')
    .select('id')
    .eq('organization_id', org.orgId)
    .eq('site_id', siteId)
    .eq('status', 'draft')
    .maybeSingle()
  if (!cart?.id) return { success: false, error: '확정할 장바구니가 없습니다.' }

  const { error } = await supabase
    .from('substitution_carts')
    .update({ status: 'confirmed' })
    .eq('id', cart.id)
  if (error) return { success: false, error: error.message }

  const loaded = await loadCart(supabase, cart.id)
  if (!loaded) return { success: false, error: '장바구니 조회에 실패했습니다.' }
  revalidatePath('/simulation')
  return { success: true, cart: loaded }
}
