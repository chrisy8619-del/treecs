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
      <p className="text-muted-foreground">예상 예비비: <span className="font-semibold text-foreground">₩{cost.toLocaleString()}</span></p>
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
    예상예비비: d.reserve_cost,
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
        <Bar dataKey="예상예비비" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={riskColor(entry.defect_rate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
