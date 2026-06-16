'use client'

import { useState } from 'react'
import Image from 'next/image'
import { BarChart2, List } from 'lucide-react'
import { ContractorStatsTab, type ContractorStat } from './contractor-stats-tab'
import { ContractorListTab } from './contractor-list-tab'
import { CreateContractorDialog } from './create-contractor-dialog'

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

type OrgOption = { id: string; name: string; code: string }

type Props = {
  contractors: Contractor[]
  stats: ContractorStat[]
  isSuperadmin: boolean
  year: number
  organizations: OrgOption[]
  yearlyData?: { year: number; defect_rate: number }[]
}

type TabId = 'stats' | 'list'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'stats', label: '협력사 현황', icon: <BarChart2 className="h-4 w-4" /> },
  { id: 'list', label: '협력사 목록', icon: <List className="h-4 w-4" /> },
]

export function ContractorTabs({ contractors, stats, isSuperadmin, year, organizations, yearlyData }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('stats')

  return (
    <div className="space-y-0 -m-6">
      {/* 상단 헤더 */}
      <div className="bg-[#14532D] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">협력사 관리</h1>
            <p className="text-xs text-green-200 mt-0.5">시공사 현황 및 하자율 기반 등급 분석을 관리합니다.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* 탭 버튼 */}
          <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-[#14532D]'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          <CreateContractorDialog organizations={organizations} />
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="px-6 py-6 space-y-6 bg-[#F8FAF9] min-h-screen">
        {activeTab === 'stats' && <ContractorStatsTab stats={stats} year={year} yearlyData={yearlyData} />}
        {activeTab === 'list' && <ContractorListTab contractors={contractors} isSuperadmin={isSuperadmin} />}
      </div>
    </div>
  )
}
