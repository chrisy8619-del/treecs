'use client'

import { useState } from 'react'
import { ProfileTab } from './profile-tab'
import { PasswordTab } from './password-tab'
import { UsersTab } from './users-tab'
import { UploadTab } from './upload-tab'
import { Badge } from '@/components/ui/badge'
import {
  UserIcon,
  LockIcon,
  UsersIcon,
  UploadIcon,
  SettingsIcon,
} from 'lucide-react'

type Profile = {
  name: string | null
  email: string
  department: string | null
  phone: string | null
  role: string
}

type UserProfile = {
  id: string
  name: string | null
  email: string
  department: string | null
  role: string
  status: string
  created_at: string
}

type UploadLog = {
  id: string
  file_name: string
  upload_type: string | null
  row_count: number | null
  status: string
  created_at: string
}

type Props = {
  profile: Profile
  users: UserProfile[]
  uploadLogs: UploadLog[]
  pendingCount: number
}

type TabId = 'profile' | 'password' | 'users' | 'upload' | 'system'

export function SettingsLayout({ profile, users, uploadLogs, pendingCount }: Props) {
  const isAdmin = ['admin', 'superadmin'].includes(profile.role)
  const isSuperAdmin = profile.role === 'superadmin'

  const tabs: { id: TabId; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'profile', label: '내 정보', icon: <UserIcon className="h-4 w-4" />, show: true },
    { id: 'password', label: '비밀번호 변경', icon: <LockIcon className="h-4 w-4" />, show: true },
    { id: 'users', label: '사용자 관리', icon: <UsersIcon className="h-4 w-4" />, show: isAdmin },
    { id: 'upload', label: '엑셀 업로드', icon: <UploadIcon className="h-4 w-4" />, show: isAdmin },
    { id: 'system', label: '시스템 설정', icon: <SettingsIcon className="h-4 w-4" />, show: isSuperAdmin },
  ]

  const visibleTabs = tabs.filter((t) => t.show)
  const [activeTab, setActiveTab] = useState<TabId>(visibleTabs[0].id)

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* 사이드 탭 메뉴 */}
      <nav className="w-48 shrink-0 space-y-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.icon}
            <span className="flex-1 text-left">{tab.label}</span>
            {tab.id === 'users' && pendingCount > 0 && (
              <Badge
                className={`h-5 px-1.5 text-xs ${
                  activeTab === tab.id
                    ? 'bg-primary-foreground text-primary'
                    : ''
                }`}
              >
                {pendingCount}
              </Badge>
            )}
          </button>
        ))}
      </nav>

      {/* 콘텐츠 영역 */}
      <div className="flex-1 min-w-0">
        {activeTab === 'profile' && <ProfileTab profile={profile} />}
        {activeTab === 'password' && <PasswordTab />}
        {activeTab === 'users' && isAdmin && (
          <UsersTab users={users} myRole={profile.role} />
        )}
        {activeTab === 'upload' && isAdmin && (
          <UploadTab logs={uploadLogs} />
        )}
        {activeTab === 'system' && isSuperAdmin && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <SettingsIcon className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">시스템 설정</p>
            <p className="text-xs mt-1">준비 중입니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
