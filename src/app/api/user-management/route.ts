import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 임시 비밀번호 생성: 각 문자군(소문자/대문자/숫자/기호)을 최소 1개씩 포함한 12자.
// 혼동되는 문자(0/O, 1/l/I 등)는 제외해 구두 전달 시 오류를 줄인다.
function generateTempPassword(): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%^&*'
  const all = lower + upper + digits + symbols
  const pick = (set: string) => set[randomInt(set.length)]
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)]
  while (chars.length < 12) chars.push(pick(all))
  // Fisher-Yates 셔플로 문자군 위치를 무작위화
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { data: me, error: meError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (meError || !me) {
      return NextResponse.json({ error: '프로필 조회 실패' }, { status: 403 })
    }

    const body = await request.json()
    const { action, userId, role } = body as { action: string; userId: string; role?: string }

    if (!userId) {
      return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 })
    }

    if (action === 'approve' || action === 'reactivate') {
      if (!['admin', 'superadmin'].includes(me.role)) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
      }
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', userId)
      if (error) return NextResponse.json({ error: `승인 실패: ${error.message}` }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'deactivate') {
      if (!['admin', 'superadmin'].includes(me.role)) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
      }
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'inactive' })
        .eq('id', userId)
      if (error) return NextResponse.json({ error: `비활성화 실패: ${error.message}` }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'changeRole') {
      if (me.role !== 'superadmin') {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
      }
      if (!role) return NextResponse.json({ error: 'role이 필요합니다.' }, { status: 400 })
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', userId)
      if (error) return NextResponse.json({ error: `권한 변경 실패: ${error.message}` }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'delete') {
      // 소프트 삭제: status를 'deleted'로 표시 → 로그인 차단(데이터·Auth 계정은 보존)
      if (me.role !== 'superadmin') {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
      }
      if (userId === user.id) {
        return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 })
      }
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'deleted' })
        .eq('id', userId)
      if (error) return NextResponse.json({ error: `삭제 실패: ${error.message}` }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'resetPassword') {
      // 관리자가 대상 사용자 이메일로 비밀번호 재설정 링크를 발송
      if (me.role !== 'superadmin') {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
      }
      const { data: target, error: targetError } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single()
      if (targetError || !target?.email) {
        return NextResponse.json({ error: '대상 사용자 조회 실패' }, { status: 404 })
      }
      // 메일 발송은 Supabase Auth 이메일 설정에 의존.
      // 링크 클릭 시 비밀번호 재설정 전용 페이지로 이동 (요청 origin 기준 → 로컬/운영 모두 대응).
      const redirectTo = `${request.nextUrl.origin}/reset-password`
      const admin = createAdminClient()
      const { error } = await admin.auth.resetPasswordForEmail(target.email, { redirectTo })
      if (error) return NextResponse.json({ error: `재설정 링크 발송 실패: ${error.message}` }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'setTempPassword') {
      // 관리자가 임시 비밀번호를 직접 설정(메일 불필요). 생성된 임시 비밀번호를 응답으로 반환해
      // 관리자가 사용자에게 전달하도록 한다. 사용자는 로그인 후 직접 변경하는 것을 권장.
      if (me.role !== 'superadmin') {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
      }
      const tempPassword = generateTempPassword()
      const admin = createAdminClient()
      const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword })
      if (error) return NextResponse.json({ error: `임시 비밀번호 설정 실패: ${error.message}` }, { status: 500 })
      return NextResponse.json({ success: true, tempPassword })
    }

    return NextResponse.json({ error: '알 수 없는 액션입니다.' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: `서버 오류: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}
