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
import { KoreaMap, type RegionData } from './korea-map'
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
}

// 지역별 더미 하자 데이터 (실제 API 연동 전 임시값, AI 예측값 필드 분리)
const DUMMY_REGION_DATA: RegionData[] = [
  { region_key: 'Gyeonggi-do',      label: '경기', defect_rate: 0.132, defect_qty: 4820, planted_qty: 36520, top_species: ['이팝나무', '느티나무'] },
  { region_key: 'Gangwon-do',       label: '강원', defect_rate: 0.167, defect_qty: 1840, planted_qty: 11020, top_species: ['소나무', '자작나무'] },
  { region_key: 'Chungcheongbuk-do',label: '충북', defect_rate: 0.112, defect_qty:  980, planted_qty:  8750, top_species: ['산수유', '매화'] },
  { region_key: 'Chungcheongnam-do',label: '충남', defect_rate: 0.119, defect_qty: 1120, planted_qty:  9410, top_species: ['벚나무', '이팝나무'] },
  { region_key: 'Gyeongsangbuk-do', label: '경북', defect_rate: 0.143, defect_qty: 2210, planted_qty: 15450, top_species: ['은행나무', '소나무'] },
  { region_key: 'Gyeongsangnam-do', label: '경남', defect_rate: 0.138, defect_qty: 1960, planted_qty: 14200, top_species: ['동백나무', '치자나무'] },
  { region_key: 'Jeollabuk-do',     label: '전북', defect_rate: 0.110, defect_qty:  870, planted_qty:  7910, top_species: ['배롱나무', '산수유'] },
  { region_key: 'Jeollanam-do',     label: '전남', defect_rate: 0.108, defect_qty: 1030, planted_qty:  9540, top_species: ['동백나무', '황칠나무'] },
  { region_key: 'Seoul',            label: '서울', defect_rate: 0.128, defect_qty:  640, planted_qty:  5000, top_species: ['느티나무', '은행나무'] },
  { region_key: 'Incheon',          label: '인천', defect_rate: 0.121, defect_qty:  310, planted_qty:  2560, top_species: ['이팝나무', '왕벚나무'] },
  { region_key: 'Daejeon',          label: '대전', defect_rate: 0.115, defect_qty:  220, planted_qty:  1910, top_species: ['벚나무', '감나무'] },
  { region_key: 'Daegu',            label: '대구', defect_rate: 0.135, defect_qty:  480, planted_qty:  3560, top_species: ['은행나무', '배롱나무'] },
  { region_key: 'Gwangju',          label: '광주', defect_rate: 0.109, defect_qty:  240, planted_qty:  2200, top_species: ['왕벚나무', '산딸나무'] },
  { region_key: 'Busan',            label: '부산', defect_rate: 0.127, defect_qty:  590, planted_qty:  4650, top_species: ['동백나무', '치자나무'] },
  { region_key: 'Ulsan',            label: '울산', defect_rate: 0.141, defect_qty:  280, planted_qty:  1980, top_species: ['소나무', '은행나무'] },
  { region_key: 'Jeju',             label: '제주', defect_rate: 0.098, defect_qty:  310, planted_qty:  3160, top_species: ['동백나무', '황칠나무'] },
]

export function AnalyticsContent({
  yearlyData, seasonData, contractorData, siteData, speciesData,
  siteReserveData, totalReserveCost, heatmapData,
  totalPlanted, totalPlantDefect, overallRate,
  hasPlantingAnalysis, geoRegions,
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

          {/* 지역별 하자 위험 지도 */}
          {geoRegions.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#111827]">지역별 하자 위험 지도</h2>
                  <p className="text-xs text-[#9CA3AF] mt-0.5">시도별 예상 하자율 분포 (AI 예측 기준)</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#6B7280]">
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-[#FECACA] border border-[#EF4444]" />높음 ≥15%</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-[#FDE68A] border border-[#F59E0B]" />중간 12~15%</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-[#BBF7D0] border border-[#22C55E]" />낮음 &lt;12%</span>
                </div>
              </div>
              <div className="max-w-xs mx-auto">
                <KoreaMap
                  geoRegions={geoRegions}
                  regionData={DUMMY_REGION_DATA}
                />
              </div>
            </div>
          )}

          {/* 수종별 하자율 테이블 (수종 관리 > 수목 현황과 동일) */}
          {speciesData.length > 0 && (
            <SpeciesStatsTab
              stats={speciesData.map((s) => ({
                speciesNameKo: s.name,
                groupName: null,
                totalQty: s.inspected,
                totalDefectQty: s.defect,
                defectRate: s.defect_rate,
              }))}
            />
          )}

          {/* 협력사별 TOP10 */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="text-sm font-semibold text-[#111827] mb-1">협력사별 하자율 TOP 10</h2>
            {contractorData.length > 0 ? (
              <ContractorDefectChart data={contractorData} />
            ) : (
              <div className="flex h-[260px] items-center justify-center text-sm text-[#9CA3AF]">데이터 없음</div>
            )}
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
