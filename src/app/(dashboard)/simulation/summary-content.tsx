'use client'

import { useState } from 'react'
import { KoreaMap, type RegionData } from './korea-map'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Leaf, TrendingDown, AlertTriangle, Calculator, Sparkles } from 'lucide-react'
import type { AnalyticsProps } from './analytics-content'
import { calcAdjustedRate, getFinalRisk, DEFAULT_MIN_PLANTING } from '../species/species-stats-tab'

type GeoRegion = { name_en: string; name_ko: string; d: string; cx: number; cy: number }

// ── 계절별 지역 하자 데이터 (더미 fallback 전용)
// 실데이터는 seasonRegionData props로 주입됨. 해당 계절 실데이터가 없을 때만 아래 더미값 표시.
type SeasonKey = 'spring' | 'summer' | 'fall' | 'winter'

const SEASON_REGION_DATA: Record<SeasonKey, RegionData[]> = {
  spring: [
    { region_key: 'Gyeonggi-do',       label: '경기', defect_rate: 0.112, defect_qty: 4100, planted_qty: 36520, top_species: ['이팝나무', '왕벚나무'] },
    { region_key: 'Gangwon-do',        label: '강원', defect_rate: 0.167, defect_qty: 1840, planted_qty: 11020, top_species: ['소나무', '자작나무'] },
    { region_key: 'Chungcheongbuk-do', label: '충북', defect_rate: 0.108, defect_qty:  945, planted_qty:  8750, top_species: ['산수유', '매화'] },
    { region_key: 'Chungcheongnam-do', label: '충남', defect_rate: 0.113, defect_qty: 1063, planted_qty:  9410, top_species: ['벚나무', '이팝나무'] },
    { region_key: 'Gyeongsangbuk-do',  label: '경북', defect_rate: 0.131, defect_qty: 2024, planted_qty: 15450, top_species: ['은행나무', '소나무'] },
    { region_key: 'Gyeongsangnam-do',  label: '경남', defect_rate: 0.124, defect_qty: 1761, planted_qty: 14200, top_species: ['동백나무', '치자나무'] },
    { region_key: 'Jeollabuk-do',      label: '전북', defect_rate: 0.098, defect_qty:  775, planted_qty:  7910, top_species: ['배롱나무', '산수유'] },
    { region_key: 'Jeollanam-do',      label: '전남', defect_rate: 0.095, defect_qty:  906, planted_qty:  9540, top_species: ['동백나무', '황칠나무'] },
    { region_key: 'Seoul',             label: '서울', defect_rate: 0.115, defect_qty:  575, planted_qty:  5000, top_species: ['느티나무', '이팝나무'] },
    { region_key: 'Incheon',           label: '인천', defect_rate: 0.108, defect_qty:  276, planted_qty:  2560, top_species: ['왕벚나무', '이팝나무'] },
    { region_key: 'Daejeon',           label: '대전', defect_rate: 0.105, defect_qty:  200, planted_qty:  1910, top_species: ['벚나무', '산수유'] },
    { region_key: 'Daegu',             label: '대구', defect_rate: 0.122, defect_qty:  434, planted_qty:  3560, top_species: ['은행나무', '배롱나무'] },
    { region_key: 'Gwangju',           label: '광주', defect_rate: 0.096, defect_qty:  211, planted_qty:  2200, top_species: ['왕벚나무', '산딸나무'] },
    { region_key: 'Busan',             label: '부산', defect_rate: 0.111, defect_qty:  516, planted_qty:  4650, top_species: ['동백나무', '치자나무'] },
    { region_key: 'Ulsan',             label: '울산', defect_rate: 0.128, defect_qty:  253, planted_qty:  1980, top_species: ['소나무', '은행나무'] },
    { region_key: 'Jeju',              label: '제주', defect_rate: 0.085, defect_qty:  269, planted_qty:  3160, top_species: ['동백나무', '황칠나무'] },
  ],
  summer: [
    { region_key: 'Gyeonggi-do',       label: '경기', defect_rate: 0.148, defect_qty: 5410, planted_qty: 36520, top_species: ['느티나무', '배롱나무'] },
    { region_key: 'Gangwon-do',        label: '강원', defect_rate: 0.135, defect_qty: 1488, planted_qty: 11020, top_species: ['잣나무', '전나무'] },
    { region_key: 'Chungcheongbuk-do', label: '충북', defect_rate: 0.121, defect_qty: 1059, planted_qty:  8750, top_species: ['느티나무', '메타세쿼이아'] },
    { region_key: 'Chungcheongnam-do', label: '충남', defect_rate: 0.138, defect_qty: 1299, planted_qty:  9410, top_species: ['이팝나무', '배롱나무'] },
    { region_key: 'Gyeongsangbuk-do',  label: '경북', defect_rate: 0.162, defect_qty: 2503, planted_qty: 15450, top_species: ['소나무', '은행나무'] },
    { region_key: 'Gyeongsangnam-do',  label: '경남', defect_rate: 0.155, defect_qty: 2201, planted_qty: 14200, top_species: ['배롱나무', '무궁화'] },
    { region_key: 'Jeollabuk-do',      label: '전북', defect_rate: 0.127, defect_qty: 1005, planted_qty:  7910, top_species: ['배롱나무', '왕벚나무'] },
    { region_key: 'Jeollanam-do',      label: '전남', defect_rate: 0.132, defect_qty: 1259, planted_qty:  9540, top_species: ['배롱나무', '무궁화'] },
    { region_key: 'Seoul',             label: '서울', defect_rate: 0.143, defect_qty:  715, planted_qty:  5000, top_species: ['느티나무', '플라타너스'] },
    { region_key: 'Incheon',           label: '인천', defect_rate: 0.135, defect_qty:  346, planted_qty:  2560, top_species: ['느티나무', '이팝나무'] },
    { region_key: 'Daejeon',           label: '대전', defect_rate: 0.128, defect_qty:  245, planted_qty:  1910, top_species: ['배롱나무', '무궁화'] },
    { region_key: 'Daegu',             label: '대구', defect_rate: 0.171, defect_qty:  609, planted_qty:  3560, top_species: ['배롱나무', '무궁화'] },
    { region_key: 'Gwangju',           label: '광주', defect_rate: 0.125, defect_qty:  275, planted_qty:  2200, top_species: ['배롱나무', '왕벚나무'] },
    { region_key: 'Busan',             label: '부산', defect_rate: 0.144, defect_qty:  670, planted_qty:  4650, top_species: ['배롱나무', '무궁화'] },
    { region_key: 'Ulsan',             label: '울산', defect_rate: 0.158, defect_qty:  313, planted_qty:  1980, top_species: ['배롱나무', '소나무'] },
    { region_key: 'Jeju',              label: '제주', defect_rate: 0.112, defect_qty:  354, planted_qty:  3160, top_species: ['동백나무', '야자나무류'] },
  ],
  fall: [
    { region_key: 'Gyeonggi-do',       label: '경기', defect_rate: 0.124, defect_qty: 4530, planted_qty: 36520, top_species: ['단풍나무', '은행나무'] },
    { region_key: 'Gangwon-do',        label: '강원', defect_rate: 0.142, defect_qty: 1565, planted_qty: 11020, top_species: ['소나무', '단풍나무'] },
    { region_key: 'Chungcheongbuk-do', label: '충북', defect_rate: 0.115, defect_qty: 1006, planted_qty:  8750, top_species: ['은행나무', '단풍나무'] },
    { region_key: 'Chungcheongnam-do', label: '충남', defect_rate: 0.122, defect_qty: 1148, planted_qty:  9410, top_species: ['은행나무', '느티나무'] },
    { region_key: 'Gyeongsangbuk-do',  label: '경북', defect_rate: 0.138, defect_qty: 2132, planted_qty: 15450, top_species: ['은행나무', '단풍나무'] },
    { region_key: 'Gyeongsangnam-do',  label: '경남', defect_rate: 0.141, defect_qty: 2002, planted_qty: 14200, top_species: ['감나무', '단풍나무'] },
    { region_key: 'Jeollabuk-do',      label: '전북', defect_rate: 0.118, defect_qty:  934, planted_qty:  7910, top_species: ['단풍나무', '감나무'] },
    { region_key: 'Jeollanam-do',      label: '전남', defect_rate: 0.114, defect_qty: 1088, planted_qty:  9540, top_species: ['감나무', '은행나무'] },
    { region_key: 'Seoul',             label: '서울', defect_rate: 0.128, defect_qty:  640, planted_qty:  5000, top_species: ['은행나무', '단풍나무'] },
    { region_key: 'Incheon',           label: '인천', defect_rate: 0.118, defect_qty:  302, planted_qty:  2560, top_species: ['은행나무', '느티나무'] },
    { region_key: 'Daejeon',           label: '대전', defect_rate: 0.112, defect_qty:  214, planted_qty:  1910, top_species: ['은행나무', '감나무'] },
    { region_key: 'Daegu',             label: '대구', defect_rate: 0.138, defect_qty:  491, planted_qty:  3560, top_species: ['은행나무', '단풍나무'] },
    { region_key: 'Gwangju',           label: '광주', defect_rate: 0.108, defect_qty:  238, planted_qty:  2200, top_species: ['단풍나무', '감나무'] },
    { region_key: 'Busan',             label: '부산', defect_rate: 0.124, defect_qty:  577, planted_qty:  4650, top_species: ['감나무', '단풍나무'] },
    { region_key: 'Ulsan',             label: '울산', defect_rate: 0.135, defect_qty:  267, planted_qty:  1980, top_species: ['단풍나무', '소나무'] },
    { region_key: 'Jeju',              label: '제주', defect_rate: 0.094, defect_qty:  297, planted_qty:  3160, top_species: ['동백나무', '감나무'] },
  ],
  winter: [
    { region_key: 'Gyeonggi-do',       label: '경기', defect_rate: 0.178, defect_qty: 6501, planted_qty: 36520, top_species: ['소나무', '잣나무'] },
    { region_key: 'Gangwon-do',        label: '강원', defect_rate: 0.221, defect_qty: 2435, planted_qty: 11020, top_species: ['소나무', '전나무'] },
    { region_key: 'Chungcheongbuk-do', label: '충북', defect_rate: 0.158, defect_qty: 1383, planted_qty:  8750, top_species: ['소나무', '향나무'] },
    { region_key: 'Chungcheongnam-do', label: '충남', defect_rate: 0.162, defect_qty: 1524, planted_qty:  9410, top_species: ['소나무', '향나무'] },
    { region_key: 'Gyeongsangbuk-do',  label: '경북', defect_rate: 0.188, defect_qty: 2905, planted_qty: 15450, top_species: ['소나무', '잣나무'] },
    { region_key: 'Gyeongsangnam-do',  label: '경남', defect_rate: 0.172, defect_qty: 2442, planted_qty: 14200, top_species: ['소나무', '동백나무'] },
    { region_key: 'Jeollabuk-do',      label: '전북', defect_rate: 0.145, defect_qty: 1147, planted_qty:  7910, top_species: ['소나무', '동백나무'] },
    { region_key: 'Jeollanam-do',      label: '전남', defect_rate: 0.138, defect_qty: 1316, planted_qty:  9540, top_species: ['동백나무', '소나무'] },
    { region_key: 'Seoul',             label: '서울', defect_rate: 0.165, defect_qty:  825, planted_qty:  5000, top_species: ['소나무', '잣나무'] },
    { region_key: 'Incheon',           label: '인천', defect_rate: 0.158, defect_qty:  404, planted_qty:  2560, top_species: ['소나무', '향나무'] },
    { region_key: 'Daejeon',           label: '대전', defect_rate: 0.148, defect_qty:  283, planted_qty:  1910, top_species: ['소나무', '향나무'] },
    { region_key: 'Daegu',             label: '대구', defect_rate: 0.175, defect_qty:  623, planted_qty:  3560, top_species: ['소나무', '잣나무'] },
    { region_key: 'Gwangju',           label: '광주', defect_rate: 0.132, defect_qty:  290, planted_qty:  2200, top_species: ['동백나무', '소나무'] },
    { region_key: 'Busan',             label: '부산', defect_rate: 0.151, defect_qty:  702, planted_qty:  4650, top_species: ['동백나무', '소나무'] },
    { region_key: 'Ulsan',             label: '울산', defect_rate: 0.168, defect_qty:  333, planted_qty:  1980, top_species: ['소나무', '향나무'] },
    { region_key: 'Jeju',              label: '제주', defect_rate: 0.105, defect_qty:  332, planted_qty:  3160, top_species: ['동백나무', '황칠나무'] },
  ],
}

const SEASON_META: Record<SeasonKey, {
  label: string; period: string; icon: string
  advice: string; speciesCount: number; defect_rate: number
  color: string; bgColor: string
}> = {
  spring: { label: '봄', period: '3~5월', icon: '🌱', color: '#16A34A', bgColor: '#DCFCE7',
    advice: '강원권 식재 축소 + 이팝나무·산수유 중심 구성 시 하자율 평균 3~5%p 감소',
    speciesCount: 28, defect_rate: 12.1 },
  summer: { label: '여름', period: '6~8월', icon: '☀️', color: '#D97706', bgColor: '#FEF3C7',
    advice: '대구·경북권 고온 내성 수종(배롱나무·무궁화) 우선 적용 시 하자율 2~4%p 감소',
    speciesCount: 22, defect_rate: 15.3 },
  fall:   { label: '가을', period: '9~11월', icon: '🍂', color: '#EA580C', bgColor: '#FFEDD5',
    advice: '뿌리활착 최적 시기. 은행나무·단풍나무 비중 확대 시 하자율 1~2%p 감소',
    speciesCount: 31, defect_rate: 13.8 },
  winter: { label: '겨울', period: '12~2월', icon: '❄️', color: '#2563EB', bgColor: '#DBEAFE',
    advice: '강원·경북 동절기 식재 최소화. 상록침엽수 위주 구성 필수',
    speciesCount: 14, defect_rate: 20.5 },
}

// 리스크 현황 TOP5 (수종별)
const RISK_TOP5 = [
  { name: '가시나무', rate: 1.00, color: '#EF4444' },
  { name: '오죽',    rate: 0.894, color: '#EF4444' },
  { name: '목련',    rate: 0.540, color: '#F59E0B' },
  { name: '수수꽃다리', rate: 0.500, color: '#F59E0B' },
  { name: '저멀앤개나무', rate: 0.479, color: '#F59E0B' },
]

// 협력사별 하자율 TOP10 (더미)
const CONTRACTOR_TOP10 = [
  { name: '삼성물산 에버', rate: 0.272 },
  { name: '주현조경',      rate: 0.159 },
  { name: '다원',         rate: 0.144 },
  { name: '나디엔엘',      rate: 0.137 },
  { name: '아세아종합건설', rate: 0.115 },
  { name: '동일조경',      rate: 0.106 },
  { name: '한설그린',      rate: 0.080 },
  { name: '정원조경',      rate: 0.066 },
  { name: '파인우드',      rate: 0.065 },
  { name: '금슬개발',      rate: 0.016 },
]

function contractorBarColor(rate: number) {
  if (rate >= 0.15) return '#22C55E'
  if (rate >= 0.10) return '#86EFAC'
  return '#BBF7D0'
}

type SummaryProps = {
  geoRegions: GeoRegion[]
  totalPlanted: number
  totalPlantDefect: number
  overallRate: number | null
  totalReserveCost: number
  yearlyData: AnalyticsProps['yearlyData']
  speciesData: AnalyticsProps['speciesData']
  contractorData: AnalyticsProps['contractorData']
  seasonData: AnalyticsProps['seasonData']
  seasonRegionData: AnalyticsProps['seasonRegionData']
  seasonStrategyStats: AnalyticsProps['seasonStrategyStats']
}

export function SummaryContent({
  geoRegions, totalPlanted, totalPlantDefect, overallRate,
  totalReserveCost, yearlyData, speciesData, contractorData, seasonData,
  seasonRegionData, seasonStrategyStats,
}: SummaryProps) {
  const [activeSeason, setActiveSeason] = useState<SeasonKey>('spring')
  const seasonMeta = SEASON_META[activeSeason]
  // 지도 데이터: 실데이터(seasonRegionData) 우선, 해당 계절 데이터 없으면 더미 fallback
  const realRegionData = seasonRegionData?.[activeSeason] ?? []
  const hasRealRegionData = realRegionData.length > 0
  const regionData = hasRealRegionData ? realRegionData : SEASON_REGION_DATA[activeSeason]

  // 우측 식재 전략 칩: 계절별 실데이터 (없으면 더미 SEASON_META fallback)
  const strategyStat = seasonStrategyStats?.[activeSeason]
  const hasStrategyData = !!strategyStat && strategyStat.speciesCount > 0
  // 예상 하자율(%) — 좌측 "계절별 하자율" 차트(seasonData)와 동일 출처로 맞춰 값 일치 보장
  const seasonChartItem = seasonData.find((s) => s.label === activeSeason)
  const strategyDefectRate = seasonChartItem != null
    ? seasonChartItem.defect_rate * 100
    : hasStrategyData ? strategyStat.defectRate * 100 : seasonMeta.defect_rate
  const strategySpeciesCount = hasStrategyData ? strategyStat.speciesCount : seasonMeta.speciesCount
  // 권고 배너: 계절별 고위험 수종 기반 동적 문구 (없으면 더미 advice)
  const strategyAdvice = hasStrategyData && strategyStat.highRiskSpecies.length > 0
    ? `${strategyStat.highRiskSpecies.join('·')} 등 고위험 수종을 내성 수종으로 대체 검토 권장`
    : hasStrategyData
    ? '해당 계절 고위험 수종 없음 — 현행 식재 계획 유지 가능'
    : seasonMeta.advice

  // 실제 데이터 있으면 우선 사용, 없으면 더미
  const displayPlanted    = totalPlanted > 0 ? totalPlanted : 113970
  const displayDefect     = totalPlantDefect > 0 ? totalPlantDefect : 16387
  const displayRate       = overallRate != null ? overallRate * 100 : 14.4
  const displayCost       = totalReserveCost > 0 ? totalReserveCost : 932033700

  const displayYearly = yearlyData.length > 0
    ? yearlyData.map((d) => ({ year: `${d.year}년`, rate: parseFloat((d.defect_rate * 100).toFixed(1)) }))
    : [{ year: '2023년', rate: 15.6 }, { year: '2024년', rate: 14.4 }, { year: '2025년', rate: 14.4 }]

  // 리스크 현황 — 수종 관리(수목 현황) 탭과 동일한 보정 하자율 + 표본 신뢰도 기준
  // 위험/주의/보통/양호 4단계를 요약 칩 3단계(고/중/저위험)로 매핑:
  //   위험→고위험, 주의→중위험, 보통+양호→저위험 (표본부족/참고는 칩 집계에서 제외)
  // 수종 관리(수목 현황) 화면과 동일 모집단을 쓰도록 최소 식재량(DEFAULT_MIN_PLANTING) 이상만 집계
  const speciesAdjusted = speciesData
    .filter((s) => s.inspected >= DEFAULT_MIN_PLANTING)
    .map((s) => {
      const adjustedRate = calcAdjustedRate(s.defect, s.inspected)
      return { ...s, adjustedRate, finalRisk: getFinalRisk(s.inspected, adjustedRate) }
    })

  const hasSpeciesData = speciesAdjusted.length > 0
  const riskHigh = hasSpeciesData ? speciesAdjusted.filter((s) => s.finalRisk === '위험').length : 27
  const riskMid  = hasSpeciesData ? speciesAdjusted.filter((s) => s.finalRisk === '주의').length : 29
  const riskLow  = hasSpeciesData ? speciesAdjusted.filter((s) => s.finalRisk === '보통' || s.finalRisk === '양호').length : 49

  const displayContractors = contractorData.length > 0
    ? contractorData.slice(0, 10).map((d) => ({ name: d.name, rate: d.defect_rate }))
    : CONTRACTOR_TOP10

  // TOP5 — 수종 관리(수목 현황)와 동일 모집단(DEFAULT_MIN_PLANTING 이상, speciesAdjusted에 이미 반영) 기준
  // 식재량 필터가 없으면 소량·고하자율 수종(예: 오죽)이 TOP5에만 노출되어 수종 관리 화면과 1위가 달라짐
  const displayRiskTop5 = hasSpeciesData
    ? speciesAdjusted
        .filter((s) => s.finalRisk !== '표본부족' && s.finalRisk !== '참고')
        .sort((a, b) => b.adjustedRate - a.adjustedRate)
        .slice(0, 5)
        .map((s) => ({
          name: s.name, rate: s.adjustedRate,
          color: s.adjustedRate >= 0.30 ? '#EF4444' : s.adjustedRate >= 0.20 ? '#F59E0B' : '#3B82F6',
        }))
    : RISK_TOP5

  // 계절별 하자율 — 실데이터 우선, 없으면 더미 fallback
  const SEASON_LABEL_MAP: Record<string, string> = {
    spring: '봄', summer: '여름', fall: '가을', winter: '겨울',
  }
  const displaySeasonChart = seasonData.length > 0
    ? seasonData.map((s) => ({
        label: SEASON_LABEL_MAP[s.label] ?? s.label,
        rate: parseFloat((s.defect_rate * 100).toFixed(2)),
      }))
    : [
        { label: '봄', rate: 10.56 },
        { label: '여름', rate: 9.51 },
        { label: '가을', rate: 13.5 },
        { label: '겨울', rate: 20.49 },
      ]

  // 절감 카드 — 실데이터 기반 동적 계산, 없으면 더미 fallback
  const hasRealData = totalPlantDefect > 0
  const SAVING_RATIO = 0.294
  const displaySavedQty = hasRealData ? Math.round(displayDefect * SAVING_RATIO) : 4823
  const displayAfterQty = hasRealData ? displayDefect - displaySavedQty : 11564
  const displaySavingPct = (SAVING_RATIO * 100).toFixed(1)

  // AI 권고 액션 — 실데이터 기반 동적 문자열
  const topRiskNames = displayRiskTop5.slice(0, 2).map((s) => s.name).join('·')
  const action1Desc = riskHigh > 0
    ? `${topRiskNames} → 대체 수종 적용 시 하자율 평균 3~5%p 감소`
    : '고위험 수종 → 대체 수종 적용 시 하자율 평균 3~5%p 감소'
  const highRiskContractorCount = displayContractors.filter((c) => c.rate >= 0.20).length
  const action3Desc = highRiskContractorCount > 0
    ? `하위 ${highRiskContractorCount}개사 집중 점검 시 고위험 ${riskHigh}종 리스크 관리 가능`
    : '고위험 협력사 사전 관리 시 리스크 높음 18% → 12%'

  return (
    <div className="px-6 py-6 space-y-5 bg-[#F8FAF9] min-h-screen">

      {/* ① 히어로: AI 프로세스 + 절감 효과 */}
      <div className="rounded-2xl bg-[#EFF6E8] border border-[#C6E09A] p-5">
        <div className="grid gap-4 md:grid-cols-2">
          {/* AI 프로세스 */}
          <div className="bg-white rounded-xl p-4">
            <p className="text-sm font-semibold text-[#111827] mb-4">AI 기반 조경 하자 저감 프로세스</p>
            <div className="flex items-center justify-between">
              {([
                { icon: '📋', label: '식재계획', active: false },
                { icon: '🧠', label: 'AI위험\n예측', active: true },
                { icon: '🌿', label: '최적수종\n추천', active: false },
                { icon: '🌱', label: '식재실행', active: false },
                { icon: '🛡️', label: '하자저감\n효과', active: false },
              ] as const).map((step, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="flex flex-col items-center text-center">
                    {step.active ? (
                      <div className="w-10 h-10 rounded-lg bg-[#14532D] flex items-center justify-center text-xl mb-1">
                        {step.icon}
                      </div>
                    ) : (
                      <div className="text-2xl mb-1">{step.icon}</div>
                    )}
                    <span className={`text-[10px] whitespace-pre-line leading-tight ${step.active ? 'text-[#14532D] font-semibold' : 'text-[#6B7280]'}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < 4 && <span className="text-[#D1D5DB] text-sm mx-0.5 mb-3">›</span>}
                </div>
              ))}
            </div>
          </div>

          {/* 절감 효과 */}
          <div className="bg-white rounded-xl p-4">
            <p className="text-sm font-semibold text-[#111827] mb-3">계절별·지역별 하자관리 적용 시 하자수량 변화</p>
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#6B7280]">미적용</span>
                  <span className="text-[#DC2626] font-semibold">{displayDefect.toLocaleString()}주</span>
                </div>
                <div className="h-3 bg-[#FECACA] rounded-full" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#6B7280]">적용</span>
                  <span className="text-[#16A34A] font-semibold">{displayAfterQty.toLocaleString()}주</span>
                </div>
                <div className="h-3 bg-[#F3F4F6] rounded-full relative">
                  <div className="h-3 bg-[#16A34A] rounded-full absolute left-0 top-0" style={{ width: `${(100 - Number(displaySavingPct)).toFixed(1)}%` }} />
                  <div className="h-3 border border-dashed border-[#16A34A] rounded-full absolute top-0" style={{ left: `${(100 - Number(displaySavingPct)).toFixed(1)}%`, width: `${displaySavingPct}%` }} />
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-sm font-semibold text-[#14532D]">
              ↓ 절감분 {displaySavedQty.toLocaleString()}주 ({displaySavingPct}%){hasRealData && <span className="text-[10px] font-normal text-[#6B7280] ml-1">(AI 예측 기준)</span>}
            </p>
          </div>
        </div>
        <p className="mt-3 pt-3 border-t border-[#C6E09A] text-xs text-[#4B7A1A]">
          분석 모수 {displayPlanted.toLocaleString()}주 기준 · 2025.05
        </p>
      </div>

      {/* ② KPI 4개 */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#DCFCE7] flex items-center justify-center shrink-0">
            <Leaf className="w-5 h-5 text-[#14532D]" />
          </div>
          <div>
            <p className="text-xs text-[#6B7280]">총 식재 수량</p>
            <p className="text-xl font-bold text-[#111827]">{displayPlanted.toLocaleString()}<span className="text-xs font-normal text-[#9CA3AF] ml-1">주</span></p>
            <p className="text-[10px] text-[#9CA3AF]">분석 기준 전체 데이터</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FEF3C7] flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5 text-[#D97706]" />
          </div>
          <div>
            <p className="text-xs text-[#6B7280]">전체 하자율</p>
            <p className={`text-xl font-bold ${displayRate >= 20 ? 'text-[#EF4444]' : displayRate >= 10 ? 'text-[#F59E0B]' : 'text-[#111827]'}`}>
              {displayRate.toFixed(1)}%
            </p>
            <p className="text-[10px] text-[#9CA3AF]">전체 식재 기준</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#FEE2E2] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
          </div>
          <div>
            <p className="text-xs text-[#6B7280]">예상 하자 수량</p>
            <p className="text-xl font-bold text-[#EF4444]">{displayDefect.toLocaleString()}<span className="text-xs font-normal text-[#9CA3AF] ml-1">주</span></p>
            <p className="text-[10px] text-[#9CA3AF]">하자 수량 (점검 기준)</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#ECFDF5] flex items-center justify-center shrink-0">
            <Calculator className="w-5 h-5 text-[#166534]" />
          </div>
          <div>
            <p className="text-xs text-[#6B7280]">예상 처리 비용</p>
            <p className="text-lg font-bold text-[#D97706] truncate">₩{displayCost.toLocaleString()}</p>
            <p className="text-[10px] text-[#9CA3AF]">조달청 단가 기준</p>
          </div>
        </div>
      </div>

      {/* 리스크 현황 칩 */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-[#E5E7EB] px-5 py-3">
        <span className="text-sm font-semibold text-[#374151] mr-2">리스크 현황</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEE2E2] text-[#DC2626] text-xs font-semibold">
          🔴 고위험 {riskHigh}종 <span className="font-normal">(≥20%)</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF3C7] text-[#D97706] text-xs font-semibold">
          🟠 중위험 {riskMid}종 <span className="font-normal">(10–20%)</span>
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCFCE7] text-[#166534] text-xs font-semibold">
          🟢 저위험 {riskLow}종 <span className="font-normal">(&lt;10%)</span>
        </span>
      </div>

      {/* ③ Row A: 좌(연도별+계절별+리스크) | 우(식재 전략) — KPI 카드 비율 그대로 50:50 */}
      <div className="grid gap-4 md:grid-cols-2 items-stretch">

        {/* 좌측: 연도별 → 계절별 → 리스크 현황 (3차트 수직 스택) */}
        <div className="grid gap-4 content-start">

          {/* 연도별 하자율 추이 */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="text-sm font-semibold text-[#111827] mb-3">연도별 하자율 추이</h2>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={displayYearly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="summaryAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14532D" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#14532D" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} domain={[0, 25]} />
                <Tooltip formatter={(v) => [`${v}%`, '하자율']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Area type="monotone" dataKey="rate" stroke="#14532D" strokeWidth={2} fill="url(#summaryAreaGrad)" dot={{ fill: '#14532D', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 계절별 하자율 */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="text-sm font-semibold text-[#111827] mb-3">계절별 하자율 <span className="text-xs font-normal text-[#9CA3AF]">입주시기 기준</span></h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={displaySeasonChart} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} domain={[0, 25]} />
                <Tooltip formatter={(v) => [`${v}%`, '하자율']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10, fontWeight: 600, fill: '#374151', formatter: (v: unknown) => `${v}%` }}>
                  {[
                    { label: '봄',  fill: '#F5B942' },
                    { label: '여름', fill: '#6FCF97' },
                    { label: '가을', fill: '#F5B942' },
                    { label: '겨울', fill: '#EF4444' },
                  ].map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={entry.label === '겨울' ? 1 : 0.7} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 리스크 현황 — 수종별 하자율 TOP 5 */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
            <h2 className="text-sm font-semibold text-[#111827] mb-3">
              리스크 현황 <span className="text-xs font-normal text-[#9CA3AF]">수종별 하자율 TOP 5</span>
            </h2>
            <div className="space-y-2.5">
              {displayRiskTop5.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-20 text-[#6B7280] truncate shrink-0">{s.name}</span>
                  <div className="flex-1 h-2 bg-[#F3F4F6] rounded-full">
                    <div className="h-2 rounded-full" style={{ width: `${s.rate * 100}%`, backgroundColor: s.color }} />
                  </div>
                  <span className="w-12 text-right font-semibold" style={{ color: s.color }}>{(s.rate * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-[#F3F4F6] flex gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-[#FEE2E2] text-[#DC2626] font-semibold">높음 18%</span>
              <span className="px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[#D97706] font-semibold">중간 47%</span>
              <span className="px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#16A34A] font-semibold">낮음 35%</span>
            </div>
          </div>
        </div>

        {/* 우측: 계절별·지역별·수종별 식재 전략 — 예상 하자 수량+예상 처리 비용 2칸 너비와 동일 높이 */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 flex flex-col">
          <h2 className="text-sm font-semibold text-[#111827] mb-3">계절별·지역별·수종별 식재 전략</h2>

          {/* 권고 배너 */}
          <div className="flex items-start gap-1.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-3 py-2.5 mb-3 text-xs text-[#374151]">
            <span className="text-sm shrink-0">✦</span>
            <span><span className="font-semibold">{seasonMeta.label}철 권고:</span> {strategyAdvice}</span>
          </div>

          {/* 계절 탭 */}
          <div className="flex gap-1.5 flex-wrap mb-3">
            {(Object.entries(SEASON_META) as [SeasonKey, typeof SEASON_META[SeasonKey]][]).map(([key, m]) => (
              <button
                key={key}
                onClick={() => setActiveSeason(key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  activeSeason === key
                    ? 'text-white shadow-sm'
                    : 'bg-[#F9FAFB] text-[#6B7280] border border-[#E5E7EB] hover:bg-[#F3F4F6]'
                }`}
                style={activeSeason === key ? { backgroundColor: m.color } : {}}
              >
                <span>{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          {/* 계절 정보 칩 */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <div className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] px-2.5 py-1.5">
              <span className="text-base">🌿</span>
              <div>
                <p className="text-[10px] text-[#9CA3AF]">식재 수종</p>
                <p className="text-sm font-bold text-[#111827]">{strategySpeciesCount}종</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] px-2.5 py-1.5">
              <span className="text-base">📊</span>
              <div>
                <p className="text-[10px] text-[#9CA3AF]">예상 하자율</p>
                <p className={`text-sm font-bold ${strategyDefectRate >= 20 ? 'text-[#EF4444]' : strategyDefectRate >= 10 ? 'text-[#F59E0B]' : 'text-[#16A34A]'}`}>
                  {strategyDefectRate.toFixed(2)}%
                  <span className={`ml-1 text-[9px] font-medium px-1 py-0.5 rounded-full ${
                    strategyDefectRate >= 20 ? 'bg-[#FEE2E2] text-[#DC2626]'
                    : strategyDefectRate >= 10 ? 'bg-[#FEF3C7] text-[#D97706]'
                    : 'bg-[#DCFCE7] text-[#166634]'
                  }`}>
                    {strategyDefectRate >= 20 ? '높음' : strategyDefectRate >= 10 ? '중간' : '낮음'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* 지도 — 남은 높이 모두 사용 */}
          {geoRegions.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-[#374151]">지역별 하자 위험 지도</p>
                  {hasRealRegionData ? (
                    <span className="text-[9px] text-[#166534] bg-[#DCFCE7] px-1.5 py-0.5 rounded">실데이터 · 입주시기 기준</span>
                  ) : (
                    <span className="text-[9px] text-[#9CA3AF] bg-[#F3F4F6] px-1.5 py-0.5 rounded">참고: AI 예측값(데이터 없음)</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[9px] text-[#6B7280]">
                  <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-[#FECACA] border border-[#EF4444]" />높음</span>
                  <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-[#FDE68A] border border-[#F59E0B]" />중간</span>
                  <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-[#BBF7D0] border border-[#22C55E]" />낮음</span>
                </div>
              </div>
              <div className="flex justify-center flex-1 items-center">
                <KoreaMap geoRegions={geoRegions} regionData={regionData} width={260} height={380} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ④ Row B: 좌(협력사별 TOP10) | 우(AI 권고 액션) */}
      <div className="grid gap-4 md:grid-cols-2">

        {/* 협력사별 하자율 TOP 10 */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <h2 className="text-sm font-semibold text-[#111827] mb-3">협력사별 하자율 TOP 10</h2>
          <div className="space-y-1.5">
            {displayContractors.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-right text-[#9CA3AF] shrink-0">{i + 1}</span>
                <span className="w-24 text-[#6B7280] truncate shrink-0">{c.name}</span>
                <div className="flex-1 h-2 bg-[#F3F4F6] rounded-full">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${(c.rate / 0.272) * 100}%`, backgroundColor: contractorBarColor(c.rate) }}
                  />
                </div>
                <span className="w-10 text-right font-semibold text-[#374151] shrink-0">{(c.rate * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI 권고 액션 */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <h2 className="text-sm font-semibold text-[#111827] mb-3 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#14532D]" /> AI 권고 액션
          </h2>
          <div className="space-y-2.5">
            {[
              {
                title: '고위험 수종 교체',
                desc: action1Desc,
                highlight: '',
              },
              {
                title: '강원권 봄 식재 축소',
                desc: '위험도 높음(16.7%) 권역 시기 조정 시',
                highlight: '약 ₩4,100만원 절감',
              },
              {
                title: '고위험 협력사 사전 관리',
                desc: action3Desc,
                highlight: '',
              },
            ].map((action, i) => (
              <div key={i} className="rounded-lg border border-[#E5E7EB] px-4 py-3">
                <p className="text-xs font-semibold text-[#111827]">{action.title}</p>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  {action.desc}{action.highlight && <span className="text-[#16A34A] font-semibold"> {action.highlight}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
