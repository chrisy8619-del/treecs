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
    if (meError || !me || !['admin', 'superadmin'].includes(me.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }

    const body = await request.json()
    const { action, siteId } = body as { action: string; siteId: string }

    if (!siteId) {
      return NextResponse.json({ error: 'siteId가 필요합니다.' }, { status: 400 })
    }

    if (action === 'approve') {
      const { error } = await supabase
        .from('sites')
        .update({ status: 'active' })
        .eq('id', siteId)
      if (error) return NextResponse.json({ error: `승인 실패: ${error.message}` }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'reject') {
      await supabase.from('planting_records').delete().eq('site_id', siteId)
      const { error } = await supabase.from('sites').delete().eq('id', siteId)
      if (error) return NextResponse.json({ error: `반려 실패: ${error.message}` }, { status: 500 })
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
