'use client'

import { useState } from 'react'
import Image from 'next/image'
import { LayoutDashboard, BarChart3, FileText } from 'lucide-react'
import { SimulationClient, type SiteOption, type SubstitutionMap, type AltSpeciesRec } from './simulation-client'
import type { AnalyticsProps } from './analytics-content'
import { AnalyticsContent } from './analytics-content'
import { SummaryContent } from './summary-content'

type Props = {
  sites: SiteOption[]
  substitutions: SubstitutionMap[]
  speciesAvgRate: Record<string, number>
  altRecs: AltSpeciesRec[]
  analytics: AnalyticsProps
}

type TabKey = 'summary' | 'dashboard' | 'simulator'

export function DashboardTabsClient({ sites, substitutions, speciesAvgRate, altRecs, analytics }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('summary')

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'summary',   label: '요약',      icon: <FileText className="h-4 w-4" /> },
    { key: 'dashboard', label: '대시보드',   icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'simulator', label: '시뮬레이터', icon: <LayoutDashboard className="h-4 w-4" /> },
  ]

  return (
    <div className="space-y-0 -m-6">
      {/* 상단 헤더 */}
      <div className="bg-[#14532D] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">대시보드</h1>
            <p className="text-xs text-green-200 mt-0.5">하자율 분석 현황 및 수종별 저감 시뮬레이션</p>
          </div>
        </div>

        {/* 탭 버튼 */}
        <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-[#14532D]'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'summary' && (
        <SummaryContent
          geoRegions={analytics.geoRegions}
          totalPlanted={analytics.totalPlanted}
          totalPlantDefect={analytics.totalPlantDefect}
          overallRate={analytics.overallRate}
          totalReserveCost={analytics.totalReserveCost}
          yearlyData={analytics.yearlyData}
          speciesData={analytics.speciesData}
          contractorData={analytics.contractorData}
          seasonData={analytics.seasonData}
        />
      )}
      {activeTab === 'dashboard' && (
        <AnalyticsContent {...analytics} />
      )}
      {activeTab === 'simulator' && (
        <SimulationClient
          sites={sites}
          substitutions={substitutions}
          speciesAvgRate={speciesAvgRate}
          altRecs={altRecs}
          hideHeader
        />
      )}
    </div>
  )
}
