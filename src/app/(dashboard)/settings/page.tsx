import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsLayout } from './settings-layout'
import type { PendingSite } from './site-approval-tab'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email, department, phone, role')
    .eq('id', user.id)
    .single()

  const safeProfile = profile ?? {
    name: null,
    email: user.email ?? '',
    department: null,
    phone: null,
    role: 'user',
  }

  const isAdmin = ['admin', 'superadmin'].includes(safeProfile.role)

  let users: { id: string; name: string | null; email: string; department: string | null; role: string; status: string; created_at: string }[] = []
  let uploadLogs: { id: string; file_name: string; upload_type: string | null; row_count: number | null; status: string; created_at: string }[] = []
  let rawPendingSites: { id: string; site_name: string; site_code: string; region: string | null; occupancy_date: string | null; start_date: string | null; created_at: string }[] = []

  if (isAdmin) {
    const [usersResult, logsResult, pendingSitesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, name, email, department, role, status, created_at')
        .neq('status', 'deleted') // 소프트 삭제된 계정은 목록에서 숨김
        .order('created_at', { ascending: false }),
      supabase
        .from('upload_logs')
        .select('id, file_name, upload_type, row_count, status, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('sites')
        .select('id, site_name, site_code, region, occupancy_date, start_date, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])
    users = usersResult.data ?? []
    uploadLogs = logsResult.data ?? []
    rawPendingSites = pendingSitesResult.data ?? []
  }

  const pendingUserCount = users.filter((u) => u.status === 'pending').length

  // pendingSites 조립: planting_records 카운트 없이 0으로 처리
  const pendingSites: PendingSite[] = rawPendingSites.map((s) => ({
    id: s.id,
    site_name: s.site_name,
    site_code: s.site_code,
    region: s.region ?? null,
    occupancy_date: s.occupancy_date ?? null,
    start_date: s.start_date ?? null,
    created_at: s.created_at,
    planting_count: 0,
  }))

  // planting_records 카운트 조회 (실패해도 무시)
  if (rawPendingSites.length > 0) {
    const siteIds = rawPendingSites.map((s) => s.id)
    const { data: plantingCountsData } = await supabase
      .from('planting_records')
      .select('site_id')
      .in('site_id', siteIds)

    if (plantingCountsData) {
      const countMap = new Map<string, number>()
      for (const p of plantingCountsData) {
        if (p.site_id) {
          countMap.set(p.site_id, (countMap.get(p.site_id) ?? 0) + 1)
        }
      }
      for (const site of pendingSites) {
        site.planting_count = countMap.get(site.id) ?? 0
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">설정</h2>
        <p className="text-muted-foreground">계정 및 시스템 설정을 관리합니다.</p>
      </div>

      <SettingsLayout
        profile={safeProfile}
        users={users}
        uploadLogs={uploadLogs}
        pendingCount={pendingUserCount}
        pendingSites={pendingSites}
      />
    </div>
  )
}
