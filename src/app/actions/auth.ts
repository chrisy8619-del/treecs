'use server'
/**
 * 인증 서버 액션(로그인/가입/로그아웃).
 *
 * 호출 주체 : login 폼(app/(auth)/login), signup 폼(app/(auth)/signup),
 *             헤더/사이드바의 로그아웃 버튼.
 * 반환/전송 : Supabase Auth(signInWithPassword/signUp/signOut) 호출 + profiles 조회·갱신.
 *             폼 액션은 useActionState용 { error } 반환 또는 redirect로 이동:
 *             - login  : 승인 상태에 따라 /auth/pending 또는 /simulation
 *             - signup : /auth/pending (관리자 승인 대기)
 *             - logout : /login
 * 의존성   : @/lib/supabase/server, next/navigation(redirect)
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/** 로그인. 승인대기/비활성/삭제 계정은 로그아웃 후 안내. 성공 시 /simulation으로 이동. */
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
    if (profile?.status === 'deleted') {
      await supabase.auth.signOut()
      return { error: '삭제된 계정입니다. 관리자에게 문의하세요.' }
    }
  }

  redirect('/simulation')
}

/** 회원가입. 필수값·비밀번호(8자↑, 일치) 검증 후 signUp. 가입 즉시 로그아웃하고 승인 대기(/auth/pending). */
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

/** 로그아웃. 세션 종료 후 /login으로 이동. */
export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
