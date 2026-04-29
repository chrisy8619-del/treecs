'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type ContractorFormState = {
  error: string
  success: boolean
}

export async function createContractor(
  state: ContractorFormState,
  formData: FormData
): Promise<ContractorFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.', success: false }

  const organization_id = formData.get('organization_id') as string
  const contractor_name = formData.get('contractor_name') as string
  const contractor_code = formData.get('contractor_code') as string
  const contact_name = formData.get('contact_name') as string
  const contact_phone = formData.get('contact_phone') as string

  if (!organization_id || !contractor_name || !contractor_code) {
    return { error: '조직, 시공사명, 시공사코드는 필수입니다.', success: false }
  }

  const { error } = await supabase.from('contractors').insert({
    organization_id,
    contractor_name,
    contractor_code,
    contact_name: contact_name || null,
    contact_phone: contact_phone || null,
    is_active: true,
  })

  if (error) return { error: `등록 실패: ${error.message}`, success: false }

  revalidatePath('/contractors')
  return { error: '', success: true }
}

export async function toggleContractorActive(id: string, is_active: boolean) {
  const supabase = await createClient()
  await supabase.from('contractors').update({ is_active }).eq('id', id)
  revalidatePath('/contractors')
}

export async function deleteContractor(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return
  await supabase.from('contractors').delete().eq('id', id)
  revalidatePath('/contractors')
}
