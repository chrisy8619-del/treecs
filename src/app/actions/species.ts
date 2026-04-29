'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SpeciesFormState = {
  error: string
  success: boolean
}

export async function createSpecies(
  state: SpeciesFormState,
  formData: FormData
): Promise<SpeciesFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.', success: false }

  const species_name_ko = formData.get('species_name_ko') as string
  const species_code = formData.get('species_code') as string
  const species_name_en = formData.get('species_name_en') as string
  const scientific_name = formData.get('scientific_name') as string
  const species_group_id = formData.get('species_group_id') as string

  if (!species_name_ko || !species_code) {
    return { error: '수종명(한글)과 수종코드는 필수입니다.', success: false }
  }

  const { error } = await supabase.from('species').insert({
    species_name_ko,
    species_code,
    species_name_en: species_name_en || null,
    scientific_name: scientific_name || null,
    species_group_id: species_group_id || null,
    is_active: true,
  })

  if (error) {
    if (error.message.includes('unique')) {
      return { error: '이미 존재하는 수종코드입니다.', success: false }
    }
    return { error: `등록 실패: ${error.message}`, success: false }
  }

  revalidatePath('/species')
  return { error: '', success: true }
}

export async function toggleSpeciesActive(id: string, is_active: boolean) {
  const supabase = await createClient()
  await supabase.from('species').update({ is_active }).eq('id', id)
  revalidatePath('/species')
}

export async function deleteSpecies(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return
  await supabase.from('species').delete().eq('id', id)
  revalidatePath('/species')
}
