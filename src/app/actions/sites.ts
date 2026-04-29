'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SiteFormState = {
  error: string
  success: boolean
}

export async function createSite(
  state: SiteFormState,
  formData: FormData
): Promise<SiteFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.', success: false }

  const site_name = formData.get('site_name') as string
  const site_code = formData.get('site_code') as string
  const organization_id = formData.get('organization_id') as string
  const region = formData.get('region') as string
  const address = formData.get('address') as string
  const project_type = formData.get('project_type') as string
  const status = formData.get('status') as string
  const start_date = formData.get('start_date') as string
  const end_date = formData.get('end_date') as string
  const occupancy_date = formData.get('occupancy_date') as string

  if (!site_name || !site_code || !organization_id) {
    return { error: '현장명, 현장코드, 조직은 필수입니다.', success: false }
  }

  const { error } = await supabase.from('sites').insert({
    site_name,
    site_code,
    organization_id,
    region: region || null,
    address: address || null,
    project_type: project_type || null,
    status: status || 'active',
    start_date: start_date || null,
    end_date: end_date || null,
    occupancy_date: occupancy_date || null,
  })

  if (error) return { error: `등록 실패: ${error.message}`, success: false }

  revalidatePath('/sites')
  return { error: '', success: true }
}

export async function updateSiteStatus(id: string, status: string) {
  const supabase = await createClient()
  await supabase.from('sites').update({ status }).eq('id', id)
  revalidatePath('/sites')
}

export async function deleteSite(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return
  await supabase.from('sites').delete().eq('id', id)
  revalidatePath('/sites')
}
