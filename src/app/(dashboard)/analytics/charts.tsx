'use client'

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
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
  spring: number | null
  summer: number | null
  fall: number | null
  winter: number | null
}

import { SEASON_CODE_TO_KO } from '@/lib/season-utils'

const seasonLabel: Record<string, string> = SEASON_CODE_TO_KO

// 엑셀 기준: ≥20% 고위험, ≥10% 중위험, 미만 저위험
function riskColor(rate: number) {
  if (rate >= 0.20) return '#ef4444'
  if (rate >= 0.10) return '#eab308'
  return '#22c55e'
}

function DefectRateTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const rate = payload[0]?.value ?? 0
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
      <p style={{ color: riskColor(rate / 100) }}>하자율: {rate.toFixed(1)}%</p>
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
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-muted-foreground">예상 하자 관리비용: <span className="font-semibold text-foreground">₩{cost.toLocaleString()}</span></p>
      {data && <p style={{ color: riskColor(data.defect_rate) }}>하자율: {(data.defect_rate * 100).toFixed(1)}% ({data.risk_level})</p>}
    </div>
  )
}

export function YearlyDefectChart({ data }: { data: YearData[] }) {
  const chartData = data.map((d) => ({
    year: `${d.year}년`,
    하자율: parseFloat((d.defect_rate * 100).toFixed(2)),
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} domain={[0, 'auto']} />
        <Tooltip content={<DefectRateTooltip />} />
        <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '기준 20%', position: 'right', fontSize: 10, fill: '#ef4444' }} />
        <Line type="monotone" dataKey="하자율" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function SeasonDefectChart({ data }: { data: SeasonData[] }) {
  const chartData = data.map((d) => ({
    season: seasonLabel[d.label] ?? d.label,
    하자율: parseFloat((d.defect_rate * 100).toFixed(2)),
    rate: d.defect_rate,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="season" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} domain={[0, 'auto']} />
        <Tooltip content={<DefectRateTooltip />} />
        <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 4" />
        <Bar dataKey="하자율" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={riskColor(entry.rate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ContractorDefectChart({ data }: { data: ContractorData[] }) {
  const chartData = data.map((d) => ({
    name: d.name.length > 8 ? d.name.slice(0, 8) + '…' : d.name,
    하자율: parseFloat((d.defect_rate * 100).toFixed(2)),
    rate: d.defect_rate,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} domain={[0, 'auto']} />
        <Tooltip content={<DefectRateTooltip />} />
        <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 4" />
        <Bar dataKey="하자율" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={riskColor(entry.rate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function SpeciesDefectChart({ data }: { data: SpeciesData[] }) {
  const chartData = data.slice(0, 15).map((d) => ({
    name: d.name.length > 6 ? d.name.slice(0, 6) + '…' : d.name,
    하자율: parseFloat((d.defect_rate * 100).toFixed(2)),
    rate: d.defect_rate,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 50 }} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} domain={[0, 'auto']} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
        <Tooltip content={<DefectRateTooltip />} />
        <ReferenceLine x={20} stroke="#ef4444" strokeDasharray="4 4" />
        <Bar dataKey="하자율" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={riskColor(entry.rate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis
          tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : `${(v / 1000).toFixed(0)}K`}
          tick={{ fontSize: 11 }}
        />
        <Tooltip content={<ReserveCostTooltip />} />
        <Bar dataKey="예상하자관리비용" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={riskColor(entry.defect_rate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

const SEASON_COLS = [
  { key: 'spring', label: '봄' },
  { key: 'summer', label: '여름' },
  { key: 'fall', label: '가을' },
  { key: 'winter', label: '겨울' },
] as const

function heatmapCellColor(rate: number | null): string {
  if (rate === null) return '#f3f4f6'
  if (rate >= 0.30) return '#991b1b'
  if (rate >= 0.20) return '#ef4444'
  if (rate >= 0.10) return '#f97316'
  if (rate >= 0.05) return '#facc15'
  return '#86efac'
}

function heatmapTextColor(rate: number | null): string {
  if (rate === null) return '#9ca3af'
  if (rate >= 0.10) return '#ffffff'
  return '#374151'
}

export function SpeciesSeasonHeatmap({ data }: { data: HeatmapData[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 bg-gray-50 border border-gray-200 font-medium text-gray-600 w-32">수종명</th>
            {SEASON_COLS.map((s) => (
              <th key={s.key} className="px-3 py-2 bg-gray-50 border border-gray-200 font-medium text-gray-600 text-center w-24">{s.label}</th>
            ))}
            <th className="px-3 py-2 bg-gray-50 border border-gray-200 font-medium text-gray-600 text-center w-24">평균</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.name}>
              <td className="px-3 py-1.5 border border-gray-200 font-medium text-gray-800 bg-gray-50 whitespace-nowrap">{row.name}</td>
              {SEASON_COLS.map((s) => {
                const rate = row[s.key]
                return (
                  <td
                    key={s.key}
                    className="px-3 py-1.5 border border-gray-200 text-center font-medium"
                    style={{ backgroundColor: heatmapCellColor(rate), color: heatmapTextColor(rate) }}
                  >
                    {rate !== null ? `${(rate * 100).toFixed(1)}%` : '-'}
                  </td>
                )
              })}
              <td
                className="px-3 py-1.5 border border-gray-200 text-center font-semibold"
                style={{ backgroundColor: heatmapCellColor(row.avgRate), color: heatmapTextColor(row.avgRate) }}
              >
                {(row.avgRate * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="font-medium">범례:</span>
        {[
          { color: '#86efac', text: '5% 미만' },
          { color: '#facc15', text: '5~10%' },
          { color: '#f97316', text: '10~20%' },
          { color: '#ef4444', text: '20~30%' },
          { color: '#991b1b', text: '30% 이상' },
          { color: '#f3f4f6', text: '데이터 없음' },
        ].map((item) => (
          <span key={item.text} className="flex items-center gap-1">
            <span className="inline-block w-4 h-4 rounded border border-gray-200" style={{ backgroundColor: item.color }} />
            {item.text}
          </span>
        ))}
      </div>
    </div>
  )
}
