'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SettingsFormState = {
  error: string
  success: boolean
  message?: string
}

export async function updateProfile(
  state: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.', success: false }

  const name = formData.get('name') as string
  const department = formData.get('department') as string
  const phone = formData.get('phone') as string

  if (!name) return { error: '이름은 필수입니다.', success: false }

  const { error } = await supabase
    .from('profiles')
    .update({ name, department: department || null, phone: phone || null })
    .eq('id', user.id)

  if (error) return { error: `저장 실패: ${error.message}`, success: false }

  return { error: '', success: true, message: '프로필이 저장되었습니다.' }
}

export async function updatePassword(
  state: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.', success: false }

  const newPassword = formData.get('new_password') as string
  const confirm = formData.get('confirm_password') as string

  if (!newPassword || newPassword.length < 8) {
    return { error: '새 비밀번호는 8자 이상이어야 합니다.', success: false }
  }
  if (newPassword !== confirm) {
    return { error: '비밀번호가 일치하지 않습니다.', success: false }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: `변경 실패: ${error.message}`, success: false }

  return { error: '', success: true, message: '비밀번호가 변경되었습니다.' }
}

export async function approveUser(userId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['admin', 'superadmin'].includes(me.role)) return { error: '권한이 없습니다.' }

  const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', userId)
  if (error) return { error: `승인 실패: ${error.message}` }

  return {}
}

export async function deactivateUser(userId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['admin', 'superadmin'].includes(me.role)) return { error: '권한이 없습니다.' }

  const { error } = await supabase.from('profiles').update({ status: 'inactive' }).eq('id', userId)
  if (error) return { error: `비활성화 실패: ${error.message}` }

  return {}
}

export async function changeUserRole(userId: string, role: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'superadmin') return { error: '권한이 없습니다.' }

  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) return { error: `권한 변경 실패: ${error.message}` }

  return {}
}

export async function approveSite(siteId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['admin', 'superadmin'].includes(me.role)) return { error: '권한이 없습니다.' }

  const { error } = await supabase.from('sites').update({ status: 'active' }).eq('id', siteId)
  if (error) return { error: `승인 실패: ${error.message}` }

  return {}
}

export async function rejectSite(siteId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['admin', 'superadmin'].includes(me.role)) return { error: '권한이 없습니다.' }

  // 반려 시 해당 현장의 planting_records도 함께 삭제
  await supabase.from('planting_records').delete().eq('site_id', siteId)
  const { error } = await supabase.from('sites').delete().eq('id', siteId)
  if (error) return { error: `반려 실패: ${error.message}` }

  return {}
}

export async function saveUploadLog(log: {
  file_name: string
  upload_type: string
  row_count: number
  status: 'success' | 'failed' | 'partial'
  error_message?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('upload_logs').insert({
    uploaded_by: user.id,
    ...log,
  })
}
