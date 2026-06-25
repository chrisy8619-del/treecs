'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type InspectionItemState = {
  error: string
  success: boolean
}

export async function upsertInspectionItem(
  state: InspectionItemState,
  formData: FormData
): Promise<InspectionItemState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.', success: false }

  const inspection_round_id = formData.get('inspection_round_id') as string
  const planting_record_id = formData.get('planting_record_id') as string
  const site_id = formData.get('site_id') as string
  const contractor_id = formData.get('contractor_id') as string
  const species_id = formData.get('species_id') as string
  const spec_code_id = formData.get('spec_code_id') as string
  const quantity_inspected = Number(formData.get('quantity_inspected'))
  const defect_quantity = Number(formData.get('defect_quantity') ?? 0)
  const notes = formData.get('notes') as string

  if (!inspection_round_id || !site_id || !contractor_id || !species_id || !spec_code_id) {
    return { error: '필수 항목이 누락되었습니다.', success: false }
  }
  if (quantity_inspected < 0) {
    return { error: '점검수량은 0 이상이어야 합니다.', success: false }
  }
  if (defect_quantity < 0 || defect_quantity > quantity_inspected) {
    return { error: '하자수량은 0 이상, 점검수량 이하여야 합니다.', success: false }
  }

  const { error } = await supabase.from('inspection_items').upsert(
    {
      inspection_round_id,
      planting_record_id: planting_record_id || null,
      site_id,
      contractor_id,
      species_id,
      spec_code_id,
      quantity_inspected,
      defect_quantity,
      notes: notes || null,
    },
    {
      onConflict: 'inspection_round_id,planting_record_id,species_id,spec_code_id',
      ignoreDuplicates: false,
    }
  )

  if (error) return { error: `저장 실패: ${error.message}`, success: false }

  revalidatePath(`/inspections/${inspection_round_id}`)
  return { error: '', success: true }
}

export async function deleteInspectionItem(id: string, roundId: string) {
  const supabase = await createClient()
  await supabase.from('inspection_items').delete().eq('id', id)
  revalidatePath(`/inspections/${roundId}`)
}
