'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(state: { error: string }, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: '이메일과 비밀번호를 입력해주세요.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
  }

  // 가입 승인 상태 확인
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .single()

    if (profile?.status === 'pending') {
      await supabase.auth.signOut()
      redirect('/auth/pending')
    }
    if (profile?.status === 'inactive') {
      await supabase.auth.signOut()
      return { error: '비활성화된 계정입니다. 관리자에게 문의하세요.' }
    }
  }

  redirect('/simulation')
}

export async function signup(state: { error: string }, formData: FormData) {
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const department = formData.get('department') as string
  const phone = formData.get('phone') as string
  const password = formData.get('password') as string
  const passwordConfirm = formData.get('password_confirm') as string

  if (!name || !email || !department || !password) {
    return { error: '이름, 이메일, 부서, 비밀번호는 필수입니다.' }
  }
  if (password.length < 8) {
    return { error: '비밀번호는 8자 이상이어야 합니다.' }
  }
  if (password !== passwordConfirm) {
    return { error: '비밀번호가 일치하지 않습니다.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, department, phone },
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: '이미 등록된 이메일입니다.' }
    }
    return { error: `가입 실패: ${error.message}` }
  }

  // profiles 트리거가 자동 생성하지만 department/phone은 별도 업데이트
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('profiles').update({ department, phone: phone || null }).eq('id', user.id)
    await supabase.auth.signOut()
  }

  redirect('/auth/pending')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
