/**
 * 대체수종 매핑 전체 조회 API. GET /api/substitutions
 *
 * 호출 주체 : ⚠️ 현재 src 내 fetch 호출처 없음 — simulation/page.tsx가 SSR에서
 *             species_substitutions를 직접 쿼리하도록 대체된 것으로 보임.
 *             외부/과거 호환용으로 유지 중. 정리(삭제) 검토 후보.
 * 반환/전송 : species_substitutions + 원/대체 수종명 조인 배열 JSON. 미인증 401, 실패 500.
 * 의존성   : @/lib/supabase/server
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data, error } = await supabase
    .from('species_substitutions')
    .select(`
      id,
      original_species_id,
      substitute_species_id,
      improved_defect_rate,
      original:original_species_id ( species_name_ko ),
      substitute:substitute_species_id ( species_name_ko )
    `)

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
