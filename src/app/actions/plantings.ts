'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type CreatePlantingState = {
  error: string
  success: boolean
}

export async function createPlantingRecord(
  state: CreatePlantingState,
  formData: FormData
): Promise<CreatePlantingState> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.', success: false }

  const site_id = formData.get('site_id') as string
  const contractor_id = formData.get('contractor_id') as string
  const species_id = formData.get('species_id') as string
  const spec_code_id = formData.get('spec_code_id') as string
  const quantity_planted = Number(formData.get('quantity_planted'))
  const planting_date = formData.get('planting_date') as string
  const occupancy_basis_date = formData.get('occupancy_basis_date') as string
  const notes = formData.get('notes') as string

  if (!site_id || !contractor_id || !species_id || !spec_code_id || !quantity_planted) {
    return { error: '현장, 시공사, 수종, 규격, 수량은 필수입니다.', success: false }
  }
  if (quantity_planted <= 0) {
    return { error: '수량은 1 이상이어야 합니다.', success: false }
  }

  const { data: site } = await supabase
    .from('sites')
    .select('organization_id')
    .eq('id', site_id)
    .single()

  if (!site) return { error: '현장 정보를 찾을 수 없습니다.', success: false }

  const { error } = await supabase.from('planting_records').insert({
    organization_id: site.organization_id,
    site_id,
    contractor_id,
    species_id,
    spec_code_id,
    quantity_planted,
    planting_date: planting_date || null,
    occupancy_basis_date: occupancy_basis_date || null,
    notes: notes || null,
    source_type: 'form',
  })

  if (error) return { error: `등록 실패: ${error.message}`, success: false }

  revalidatePath('/plantings')
  return { error: '', success: true }
}

export async function deletePlantingRecord(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['admin', 'superadmin'].includes(me.role)) return { error: '권한이 없습니다.' }

  const { error } = await supabase.from('planting_records').delete().eq('id', id)
  if (error) return { error: `삭제 실패: ${error.message}` }

  revalidatePath('/plantings')
  return {}
}
