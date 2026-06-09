'use client'

import { useState } from 'react'
import Image from 'next/image'
import { List, BarChart2, MapPin } from 'lucide-react'
import { SpeciesListTab } from './species-list-tab'
import { SpeciesStatsTab, type SpeciesStat } from './species-stats-tab'
import { SpeciesFinderTab, type AltSpeciesRec, type SpeciesStatForFinder } from './species-finder-tab'
import { CreateSpeciesDialog } from './create-species-dialog'

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

type Group = { id: string; group_name: string; group_code: string }

type Props = {
  species: Species[]
  stats: SpeciesStat[]
  isSuperadmin: boolean
  altRecs: AltSpeciesRec[]
  speciesStatsForFinder: SpeciesStatForFinder[]
  groups: Group[]
}

type TabId = 'stats' | 'finder' | 'list'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'stats', label: '수목 현황', icon: <BarChart2 className="h-4 w-4" /> },
  { id: 'finder', label: '맞춤 수종 찾기', icon: <MapPin className="h-4 w-4" /> },
  { id: 'list', label: '수종 목록', icon: <List className="h-4 w-4" /> },
]

export function SpeciesTabs({ species, stats, isSuperadmin, altRecs, speciesStatsForFinder, groups }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('stats')

  return (
    <div className="space-y-0 -m-6">
      {/* 상단 헤더 */}
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">수종 관리</h1>
            <p className="text-xs text-green-200 mt-0.5">수목 수종 마스터 데이터 및 리스크 현황을 관리합니다.</p>
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
                    ? 'bg-white text-[#1a3a2a]'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
          {isSuperadmin && <CreateSpeciesDialog groups={groups} />}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="px-6 py-5 space-y-6">
        {activeTab === 'stats' && <SpeciesStatsTab stats={stats} />}
        {activeTab === 'finder' && <SpeciesFinderTab altRecs={altRecs} speciesStats={speciesStatsForFinder} />}
        {activeTab === 'list' && <SpeciesListTab species={species} isSuperadmin={isSuperadmin} />}
      </div>
    </div>
  )
}
