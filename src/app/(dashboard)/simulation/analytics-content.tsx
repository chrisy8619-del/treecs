import {
  YearlyDefectChart,
  SeasonDefectChart,
  ContractorDefectChart,
  SpeciesSeasonHeatmap,
  type SiteReserveData,
  type HeatmapData,
} from '../analytics/charts'
import { SiteAnalysisTable } from '../analytics/site-analysis-table'
import { SpeciesStatsTab } from '../species/species-stats-tab'
import type { RegionData } from './korea-map'
import { Leaf, TrendingDown, AlertTriangle, Calculator } from 'lucide-react'

type GeoRegion = {
  name_en: string
  name_ko: string
  d: string
  cx: number
  cy: number
}

export type AnalyticsProps = {
  yearlyData: { year: number; defect_rate: number; total_quantity: number; total_defect_quantity: number }[]
  seasonData: { label: string; defect_rate: number }[]
  contractorData: { name: string; defect_rate: number; total_quantity: number }[]
  siteData: { name: string; defect_rate: number; inspected: number; defect: number }[]
  speciesData: { name: string; defect_rate: number; inspected: number; defect: number }[]
  siteReserveData: SiteReserveData[]
  totalReserveCost: number
  heatmapData: HeatmapData[]
  totalPlanted: number
  totalPlantDefect: number
  overallRate: number | null
  hasPlantingAnalysis: boolean
  /** 서버에서 파싱한 한국 지도 SVG path 데이터 */
  geoRegions: GeoRegion[]
  /** 계절(식재계절) × 지역 실데이터 집계. 키: spring/summer/fall/winter/all */
  seasonRegionData: Record<string, RegionData[]>
}

export function AnalyticsContent({
  yearlyData, seasonData, contractorData, siteData, speciesData,
  siteReserveData, totalReserveCost, heatmapData,
  totalPlanted, totalPlantDefect, overallRate,
  hasPlantingAnalysis,
}: AnalyticsProps) {
  const hasData = siteData.length > 0 || yearlyData.length > 0 || hasPlantingAnalysis

  const riskHigh = speciesData.filter((s) => s.defect_rate >= 0.20).length
  const riskMid  = speciesData.filter((s) => s.defect_rate >= 0.10 && s.defect_rate < 0.20).length
  const riskLow  = speciesData.filter((s) => s.defect_rate < 0.10).length

  return (
    <div className="px-6 py-6 space-y-6 bg-[#F8FAF9] min-h-screen">
      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-24 text-[#9CA3AF]">
          <p className="text-sm">분석할 데이터가 없습니다.</p>
          <p className="text-xs mt-1">설정 &gt; 업로드에서 하자율 예측 분석 엑셀을 업로드하세요.</p>
        </div>
      ) : (
        <>
          {/* KPI 카드 4개 */}
          <div className="grid gap-4 md:grid-cols-4">
            <div className="bg-white rounded-2xl border border-[#E5E7EB] px-5 py-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-full bg-[#DCFCE7] flex items-center justify-center shrink-0">
                <Leaf className="w-5 h-5 text-[#14532D]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#6B7280] font-medium mb-0.5">총 식재 수량</p>
                <p className="text-2xl font-bold text-[#111827] leading-none">
                  {totalPlanted > 0 ? totalPlanted.toLocaleString() : '-'}
                  <span className="text-sm font-normal text-[#6B7280] ml-1">주</span>
                </p>
                <p className="text-xs text-[#9CA3AF] mt-1">분석 기준 전체 데이터</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E7EB] px-5 py-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-full bg-[#FEF3C7] flex items-center justify-center shrink-0">
                <TrendingDown className="w-5 h-5 text-[#D97706]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#6B7280] font-medium mb-0.5">전체 하자율</p>
                <p className={`text-2xl font-bold leading-none ${overallRate !== null && overallRate >= 0.20 ? 'text-[#EF4444]' : overallRate !== null && overallRate >= 0.10 ? 'text-[#F59E0B]' : 'text-[#111827]'}`}>
                  {overallRate !== null ? `${(overallRate * 100).toFixed(1)}%` : '-'}
                </p>
                <p className="text-xs text-[#9CA3AF] mt-1">전체 식재 기준</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E7EB] px-5 py-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-full bg-[#FEE2E2] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#6B7280] font-medium mb-0.5">예상 하자 수량</p>
                <p className="text-2xl font-bold text-[#EF4444] leading-none">
                  {totalPlantDefect > 0 ? totalPlantDefect.toLocaleString() : '-'}
                  <span className="text-sm font-normal text-[#6B7280] ml-1">주</span>
                </p>
                <p className="text-xs text-[#9CA3AF] mt-1">하자 수량 (점검 기준)</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E7EB] px-5 py-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className="w-11 h-11 rounded-full bg-[#ECFDF5] flex items-center justify-center shrink-0">
                <Calculator className="w-5 h-5 text-[#166534]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-[#6B7280] font-medium mb-0.5">예상 하자 저감 비용</p>
                <p className="text-xl font-bold text-[#D97706] leading-none truncate">
                  {totalReserveCost > 0 ? `₩${totalReserveCost.toLocaleString()}` : '-'}
                </p>
                <p className="text-xs text-[#9CA3AF] mt-1">조달청 단가 기준</p>
              </div>
            </div>
          </div>

          {/* 리스크 현황 Chip */}
          {speciesData.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-[#E5E7EB] px-5 py-3">
              <span className="text-sm font-semibold text-[#374151] mr-2">리스크 현황</span>
              {riskHigh > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEE2E2] text-[#DC2626] text-xs font-semibold">
                  🔴 고위험 {riskHigh}종 <span className="font-normal text-[#EF4444]">(≥20%)</span>
                </span>
              )}
              {riskMid > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF3C7] text-[#D97706] text-xs font-semibold">
                  🟠 중위험 {riskMid}종 <span className="font-normal text-[#F59E0B]">(10–20%)</span>
                </span>
              )}
              {riskLow > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCFCE7] text-[#166534] text-xs font-semibold">
                  🟢 저위험 {riskLow}종 <span className="font-normal text-[#22C55E]">(&lt;10%)</span>
                </span>
              )}
            </div>
          )}

          {/* 1행: 연도별 + 계절별 */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
              <h2 className="text-sm font-semibold text-[#111827] mb-4">연도별 하자율 추이</h2>
              {yearlyData.length > 0 ? (
                <YearlyDefectChart data={yearlyData} />
              ) : (
                <div className="flex h-[240px] items-center justify-center text-sm text-[#9CA3AF]">데이터 없음</div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
              <h2 className="text-sm font-semibold text-[#111827] mb-4">
                계절별 하자율
                <span className="ml-2 text-xs font-normal text-[#9CA3AF]">입주시기 기준</span>
              </h2>
              {seasonData.length > 0 ? (
                <SeasonDefectChart data={seasonData} />
              ) : (
                <div className="flex h-[240px] items-center justify-center text-sm text-[#9CA3AF]">데이터 없음</div>
              )}
            </div>
          </div>

          {/* 2열: 수목 현황 + 협력사별 TOP10 — 동일 높이(600px), 내용 길면 내부 스크롤 */}
          <div className="grid gap-6 md:grid-cols-2 items-stretch">
            {/* 수목 현황 */}
            {speciesData.length > 0 && (
              <div className="flex flex-col min-h-0 h-[600px] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
                <SpeciesStatsTab
                  stats={speciesData.map((s) => ({
                    speciesNameKo: s.name,
                    groupName: null,
                    totalQty: s.inspected,
                    totalDefectQty: s.defect,
                    defectRate: s.defect_rate,
                  }))}
                />
              </div>
            )}

            {/* 협력사별 TOP10 */}
            <div className="flex flex-col h-[600px] overflow-hidden bg-white rounded-2xl border border-[#E5E7EB] p-5">
              <h2 className="text-sm font-semibold text-[#111827] mb-1 shrink-0">협력사별 하자율 TOP 10</h2>
              {contractorData.length > 0 ? (
                <div className="flex-1 overflow-y-auto min-h-0">
                  <ContractorDefectChart data={contractorData} />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-[#9CA3AF]">데이터 없음</div>
              )}
            </div>
          </div>

          {/* 수종별 계절 히트맵 */}
          {heatmapData.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#111827]">수종별 계절 하자율 히트맵</h2>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">계절별 하자율 분포를 한눈에 확인할 수 있습니다.</p>
                </div>
                <span className="text-xs text-[#9CA3AF]">입주시기 기준 · 상위 {heatmapData.length}종</span>
              </div>
              <SpeciesSeasonHeatmap data={heatmapData} />
            </div>
          )}

          {/* 현장별 분석 테이블 */}
          {siteData.length > 0 && (
            <SiteAnalysisTable siteData={siteData} siteReserveData={siteReserveData} />
          )}

        </>
      )}
    </div>
  )
}
