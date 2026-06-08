'use client'

import { useState } from 'react'
import { List, BarChart2 } from 'lucide-react'
import { SpeciesListTab } from './species-list-tab'
import { SpeciesStatsTab, type SpeciesStat } from './species-stats-tab'

type SpeciesGroup = { group_name: string } | null
type Species = {
  id: string
  species_name_ko: string
  species_name_en: string | null
  species_code: string
  scientific_name: string | null
  is_active: boolean
  species_groups: SpeciesGroup | SpeciesGroup[]
}

type Props = {
  species: Species[]
  stats: SpeciesStat[]
  isSuperadmin: boolean
}

type TabId = 'list' | 'stats'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'list', label: '수종 목록', icon: <List className="h-4 w-4" /> },
  { id: 'stats', label: '수목 현황', icon: <BarChart2 className="h-4 w-4" /> },
]

export function SpeciesTabs({ species, stats, isSuperadmin }: Props) {
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

      {/* 탭 컨텐츠 */}
      {activeTab === 'list' && (
        <SpeciesListTab species={species} isSuperadmin={isSuperadmin} />
      )}
      {activeTab === 'stats' && (
        <SpeciesStatsTab stats={stats} />
      )}
    </div>
  )
}
