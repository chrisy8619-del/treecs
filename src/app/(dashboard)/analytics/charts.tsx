'use client'

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

export type YearData = {
  year: number
  defect_rate: number
  total_quantity: number
  total_defect_quantity: number
}

export type SeasonData = {
  label: string
  defect_rate: number
}

export type ContractorData = {
  name: string
  defect_rate: number
  total_quantity: number
}

export type SpeciesData = {
  name: string
  defect_rate: number
  inspected: number
  defect: number
}

export type SiteReserveData = {
  name: string
  reserve_cost: number
  defect_rate: number
  risk_level: string
}

export type HeatmapData = {
  name: string
  avgRate: number
  inspected?: number
  spring: number | null
  summer: number | null
  fall: number | null
  winter: number | null
}

import { SEASON_CODE_TO_KO } from '@/lib/season-utils'

const seasonLabel: Record<string, string> = SEASON_CODE_TO_KO

// 하자율 기준 색상
function riskColor(rate: number) {
  if (rate >= 0.30) return '#DC2626'
  if (rate >= 0.20) return '#EF4444'
  if (rate >= 0.10) return '#F59E0B'
  return '#22C55E'
}

// 계절별 고정 색상
const SEASON_COLORS: Record<string, string> = {
  spring: '#F5B942',
  summer: '#6FCF97',
  fall:   '#F2A93B',
  winter: '#EB5757',
}

function seasonColorByLabel(label: string): string {
  const ko = seasonLabel[label] ?? label
  if (ko === '봄') return SEASON_COLORS.spring
  if (ko === '여름') return SEASON_COLORS.summer
  if (ko === '가을') return SEASON_COLORS.fall
  if (ko === '겨울') return SEASON_COLORS.winter
  return '#94A3B8'
}

/* ── 공통 Tooltip ── */
function DefectRateTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name: string; payload?: Record<string, unknown> }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const rate = payload[0]?.value ?? 0
  const qty = (payload[0]?.payload as { total_quantity?: number; inspected?: number } | undefined)?.total_quantity
    ?? (payload[0]?.payload as { inspected?: number } | undefined)?.inspected
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm shadow-lg">
      <p className="font-semibold text-[#111827] mb-1">{label}</p>
      <p style={{ color: riskColor(rate / 100) }} className="font-medium">하자율: {rate.toFixed(1)}%</p>
      {qty != null && <p className="text-[#6B7280] text-xs mt-0.5">식재수량: {qty.toLocaleString()}주</p>}
    </div>
  )
}

function ReserveCostTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; payload: SiteReserveData }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const cost = payload[0]?.value ?? 0
  const data = payload[0]?.payload
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm shadow-lg">
      <p className="font-semibold text-[#111827] mb-1">{label}</p>
      <p className="text-[#6B7280]">예상 하자 관리비용: <span className="font-semibold text-[#111827]">₩{cost.toLocaleString()}</span></p>
      {data && <p style={{ color: riskColor(data.defect_rate) }} className="mt-0.5">하자율: {(data.defect_rate * 100).toFixed(1)}% ({data.risk_level})</p>}
    </div>
  )
}

/* ── 1. 연도별 하자율 추이 — Area Chart ── */
export function YearlyDefectChart({ data }: { data: YearData[] }) {
  const chartData = data.map((d) => ({
    year: `${d.year}년`,
    하자율: parseFloat((d.defect_rate * 100).toFixed(2)),
    rate: d.defect_rate,
    total_quantity: d.total_quantity,
  }))

  // 인사이트: 첫/마지막 비교
  let insight = ''
  if (chartData.length >= 2) {
    const first = chartData[0].하자율
    const last  = chartData[chartData.length - 1].하자율
    const diff  = Math.abs(first - last).toFixed(1)
    insight = last < first
      ? `최근 ${chartData.length - 1}년간 하자율이 ${diff}% 감소했습니다.`
      : last > first
        ? `최근 ${chartData.length - 1}년간 하자율이 ${diff}% 증가했습니다.`
        : '하자율이 안정적으로 유지되고 있습니다.'
  }

  return (
    <div>
      {insight && (
        <p className="text-xs text-[#6B7280] mb-3">{insight}</p>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={chartData} margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#14532D" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#14532D" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
          <Tooltip content={<DefectRateTooltip />} />
          <ReferenceLine
            y={20}
            stroke="#EF4444"
            strokeDasharray="4 4"
            label={{ value: '기준선 20%', position: 'right', fontSize: 10, fill: '#EF4444' }}
          />
          <Area
            type="monotone"
            dataKey="하자율"
            stroke="#14532D"
            strokeWidth={2.5}
            fill="url(#areaGradient)"
            dot={{ r: 4, fill: '#14532D', strokeWidth: 2, stroke: '#fff' }}
            activeDot={{ r: 6, fill: '#14532D', stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── 2. 계절별 하자율 — Rounded Bar + 값 라벨 ── */
export function SeasonDefectChart({ data }: { data: SeasonData[] }) {
  const chartData = data.map((d) => ({
    season: seasonLabel[d.label] ?? d.label,
    하자율: parseFloat((d.defect_rate * 100).toFixed(2)),
    rate: d.defect_rate,
    label: d.label,
  }))

  const maxRate = Math.max(...chartData.map((d) => d.하자율))
  const maxSeason = chartData.find((d) => d.하자율 === maxRate)?.season ?? ''
  const insight = maxSeason ? `${maxSeason} 식재 하자율이 가장 높습니다.` : ''

  // 커스텀 라벨 (바 위에 %값 표시)
  const CustomLabel = ({ x, y, width, value }: { x?: number; y?: number; width?: number; value?: number }) => {
    if (value == null || value === 0) return null
    return (
      <text x={(x ?? 0) + (width ?? 0) / 2} y={(y ?? 0) - 6} fill="#374151" textAnchor="middle" fontSize={11} fontWeight={600}>
        {value}%
      </text>
    )
  }

  return (
    <div>
      {insight && <p className="text-xs text-[#6B7280] mb-3">{insight}</p>}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="season" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
          <Tooltip content={<DefectRateTooltip />} />
          <ReferenceLine y={20} stroke="#EF4444" strokeDasharray="4 4" />
          <Bar dataKey="하자율" radius={[6, 6, 0, 0]} label={<CustomLabel />}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={seasonColorByLabel(entry.label)} opacity={entry.하자율 === maxRate ? 1 : 0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ── 3. 수종별 하자율 — Ranking Dashboard ── */
export function SpeciesDefectChart({ data }: { data: SpeciesData[] }) {
  const top10 = data.slice(0, 10)
  const maxRate = top10.length > 0 ? top10[0].defect_rate : 0

  const insight = top10.length >= 2
    ? `${top10[0].name}, ${top10[1].name} 집중 관리가 필요합니다.`
    : top10.length === 1
      ? `${top10[0].name} 집중 관리가 필요합니다.`
      : ''

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {insight && <p className="text-xs text-[#6B7280]">{insight}</p>}
        <span className="text-xs text-[#9CA3AF] ml-auto">식재수량</span>
      </div>
      <div className="space-y-2">
        {top10.map((item, i) => {
          const pct = (item.defect_rate * 100)
          const barWidth = maxRate > 0 ? (item.defect_rate / maxRate) * 100 : 0
          const color = riskColor(item.defect_rate)
          return (
            <div key={item.name} className="flex items-center gap-3 group">
              {/* 순위 */}
              <span className="w-5 text-right text-xs font-semibold text-[#9CA3AF] shrink-0">{i + 1}</span>
              {/* 수종명 */}
              <span className="w-20 text-sm font-medium text-[#111827] truncate shrink-0">{item.name}</span>
              {/* 바 */}
              <div className="flex-1 relative h-6 flex items-center">
                <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.85 }} />
                <span className="relative ml-2 text-xs font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
              </div>
              {/* 식재수량 */}
              <span className="w-16 text-right text-xs text-[#6B7280] shrink-0">{item.inspected.toLocaleString()}주</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── 4. 협력사별 하자율 — 가로 Ranking Bar ── */
export function ContractorDefectChart({ data }: { data: ContractorData[] }) {
  const top10 = data.slice(0, 10)
  const maxRate = top10.length > 0 ? top10[0].defect_rate : 0

  const insight = top10.length >= 3
    ? `상위 3개 협력사 리스크가 집중되어 있습니다.`
    : top10.length > 0
      ? `하자율이 높은 협력사 관리가 필요합니다.`
      : ''

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {insight && <p className="text-xs text-[#6B7280]">{insight}</p>}
        <span className="text-xs text-[#9CA3AF] ml-auto">식재수량</span>
      </div>
      <div className="space-y-2">
        {top10.map((item, i) => {
          const pct = (item.defect_rate * 100)
          const barWidth = maxRate > 0 ? (item.defect_rate / maxRate) * 100 : 0
          const color = riskColor(item.defect_rate)
          const shortName = item.name.length > 10 ? item.name.slice(0, 10) + '…' : item.name
          return (
            <div key={item.name} className="flex items-center gap-3">
              <span className="w-5 text-right text-xs font-semibold text-[#9CA3AF] shrink-0">{i + 1}</span>
              <span className="w-24 text-sm font-medium text-[#111827] truncate shrink-0" title={item.name}>{shortName}</span>
              <div className="flex-1 relative h-6 flex items-center">
                <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.85 }} />
                <span className="relative ml-2 text-xs font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
              </div>
              <span className="w-16 text-right text-xs text-[#6B7280] shrink-0">{item.total_quantity.toLocaleString()}주</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SiteReserveCostChart({ data }: { data: SiteReserveData[] }) {
  const chartData = data.slice(0, 10).map((d) => ({
    name: d.name.length > 8 ? d.name.slice(0, 8) + '…' : d.name,
    예상하자관리비용: d.reserve_cost,
    defect_rate: d.defect_rate,
    risk_level: d.risk_level,
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : `${(v / 1000).toFixed(0)}K`}
          tick={{ fontSize: 11, fill: '#6B7280' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ReserveCostTooltip />} />
        <Bar dataKey="예상하자관리비용" radius={[6, 6, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={riskColor(entry.defect_rate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ── 5. 히트맵 ── */
const SEASON_COLS = [
  { key: 'spring', label: '봄' },
  { key: 'summer', label: '여름' },
  { key: 'fall',   label: '가을' },
  { key: 'winter', label: '겨울' },
] as const

function heatmapCellColor(rate: number | null): string {
  if (rate === null) return '#F3F4F6'
  if (rate >= 0.30) return '#FCA5A5'
  if (rate >= 0.20) return '#FD8C73'
  if (rate >= 0.10) return '#FDE68A'
  if (rate >= 0.05) return '#BBF7D0'
  return '#DCFCE7'
}

function heatmapTextColor(rate: number | null): string {
  if (rate === null) return '#9CA3AF'
  if (rate >= 0.20) return '#7F1D1D'
  if (rate >= 0.10) return '#78350F'
  return '#14532D'
}

export function SpeciesSeasonHeatmap({ data }: { data: HeatmapData[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[600px]">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 text-left px-3 py-2.5 bg-[#F8FAF9] border border-[#E5E7EB] font-semibold text-[#374151] w-28">수종명</th>
            <th className="px-3 py-2.5 bg-[#F8FAF9] border border-[#E5E7EB] font-semibold text-[#374151] text-right w-20">식재수량</th>
            {SEASON_COLS.map((s) => (
              <th key={s.key} className="px-3 py-2.5 bg-[#F8FAF9] border border-[#E5E7EB] font-semibold text-[#374151] text-center w-24">{s.label}</th>
            ))}
            <th className="px-3 py-2.5 bg-[#F8FAF9] border border-[#E5E7EB] font-semibold text-[#374151] text-center w-20">평균</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.name} className="hover:bg-[#F8FAF9] transition-colors">
              <td className="sticky left-0 z-10 px-3 py-2.5 border border-[#E5E7EB] font-medium text-[#111827] bg-white whitespace-nowrap">{row.name}</td>
              <td className="px-3 py-2.5 border border-[#E5E7EB] text-right text-[#6B7280] bg-white">
                {row.inspected != null ? `${row.inspected.toLocaleString()}주` : '-'}
              </td>
              {SEASON_COLS.map((s) => {
                const rate = row[s.key]
                return (
                  <td
                    key={s.key}
                    className="px-3 py-2.5 border border-[#E5E7EB] text-center font-semibold"
                    style={{ backgroundColor: heatmapCellColor(rate), color: heatmapTextColor(rate) }}
                  >
                    {rate !== null ? `${(rate * 100).toFixed(1)}%` : '-'}
                  </td>
                )
              })}
              <td
                className="px-3 py-2.5 border border-[#E5E7EB] text-center font-bold"
                style={{ backgroundColor: heatmapCellColor(row.avgRate), color: heatmapTextColor(row.avgRate) }}
              >
                {(row.avgRate * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[#6B7280]">
        <span className="font-medium">범례:</span>
        {[
          { color: '#DCFCE7', text: '5% 미만',  textColor: '#14532D' },
          { color: '#BBF7D0', text: '5~10%',    textColor: '#14532D' },
          { color: '#FDE68A', text: '10~20%',   textColor: '#78350F' },
          { color: '#FD8C73', text: '20~30%',   textColor: '#7F1D1D' },
          { color: '#FCA5A5', text: '30% 이상', textColor: '#7F1D1D' },
          { color: '#F3F4F6', text: '데이터 없음', textColor: '#9CA3AF' },
        ].map((item) => (
          <span key={item.text} className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-4 rounded border border-[#E5E7EB]" style={{ backgroundColor: item.color }} />
            <span style={{ color: item.textColor }}>{item.text}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
