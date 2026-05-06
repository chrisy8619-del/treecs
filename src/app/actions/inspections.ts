'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type CreateInspectionRoundState = {
  error: string
  success: boolean
}

export async function createInspectionRound(
  state: CreateInspectionRoundState,
  formData: FormData
): Promise<CreateInspectionRoundState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.', success: false }

  const site_id = formData.get('site_id') as string
  const inspection_name = formData.get('inspection_name') as string
  const inspection_date = formData.get('inspection_date') as string
  const season_code = formData.get('season_code') as string
  const inspection_basis_type = formData.get('inspection_basis_type') as string
  const performed_by = formData.get('performed_by') as string
  const notes = formData.get('notes') as string

  if (!site_id || !inspection_date) {
    return { error: '현장과 점검일자는 필수입니다.', success: false }
  }

  // organization_id 조회 (현장 기준)
  const { data: site } = await supabase
    .from('sites')
    .select('organization_id')
    .eq('id', site_id)
    .single()

  if (!site) return { error: '현장 정보를 찾을 수 없습니다.', success: false }

  const { error } = await supabase.from('inspection_rounds').insert({
    organization_id: site.organization_id,
    site_id,
    inspection_name: inspection_name || null,
    inspection_date,
    season_code: season_code || null,
    inspection_basis_type: inspection_basis_type || null,
    performed_by: performed_by || null,
    notes: notes || null,
  })

  if (error) return { error: `등록 실패: ${error.message}`, success: false }

  revalidatePath('/inspections')
  return { error: '', success: true }
}

export async function deleteInspectionRound(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['admin', 'superadmin'].includes(me.role)) return { error: '권한이 없습니다.' }

  const { error } = await supabase.from('inspection_rounds').delete().eq('id', id)
  if (error) return { error: `삭제 실패: ${error.message}` }

  revalidatePath('/inspections')
  return {}
}
