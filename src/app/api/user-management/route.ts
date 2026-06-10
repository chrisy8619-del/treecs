import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    return NextResponse.json({ error: '알 수 없는 액션입니다.' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: `서버 오류: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}
