import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsLayout } from './settings-layout'

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

  const [usersResult, logsResult] = await Promise.all([
    isAdmin
      ? supabase
          .from('profiles')
          .select('id, name, email, department, role, status, created_at')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    isAdmin
      ? supabase
          .from('upload_logs')
          .select('id, file_name, upload_type, row_count, status, created_at')
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
  ])

  const users = usersResult.data ?? []
  const uploadLogs = logsResult.data ?? []
  const pendingCount = users.filter((u) => u.status === 'pending').length

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
        pendingCount={pendingCount}
      />
    </div>
  )
}
