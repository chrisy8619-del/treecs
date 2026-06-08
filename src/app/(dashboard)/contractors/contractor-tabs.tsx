'use client'

import { useState } from 'react'
import { BarChart2, List } from 'lucide-react'
import { ContractorStatsTab, type ContractorStat } from './contractor-stats-tab'
import { ContractorListTab } from './contractor-list-tab'

type Organization = { name: string } | null
type Contractor = {
  id: string
  contractor_name: string
  contractor_code: string
  contact_name: string | null
  contact_phone: string | null
  is_active: boolean
  organizations: Organization | Organization[]
}

type Props = {
  contractors: Contractor[]
  stats: ContractorStat[]
  isSuperadmin: boolean
  year: number
}

type TabId = 'stats' | 'list'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'stats', label: '협력사 현황', icon: <BarChart2 className="h-4 w-4" /> },
  { id: 'list', label: '협력사 목록', icon: <List className="h-4 w-4" /> },
]

export function ContractorTabs({ contractors, stats, isSuperadmin, year }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('stats')

  return (
    <div className="space-y-4">
      {/* 탭 버튼 */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'stats' && <ContractorStatsTab stats={stats} year={year} />}
      {activeTab === 'list' && <ContractorListTab contractors={contractors} isSuperadmin={isSuperadmin} />}
    </div>
  )
}
