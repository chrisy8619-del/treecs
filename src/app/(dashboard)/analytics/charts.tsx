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

const seasonLabel: Record<string, string> = {
  spring: '봄', summer: '여름', fall: '가을', winter: '겨울',
}

function riskColor(rate: number) {
  if (rate >= 0.35) return '#ef4444'
  if (rate >= 0.20) return '#f97316'
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
        <ReferenceLine y={35} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '기준 35%', position: 'right', fontSize: 10, fill: '#ef4444' }} />
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
        <ReferenceLine y={35} stroke="#ef4444" strokeDasharray="4 4" />
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
        <ReferenceLine y={35} stroke="#ef4444" strokeDasharray="4 4" />
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
        <ReferenceLine x={35} stroke="#ef4444" strokeDasharray="4 4" />
        <Bar dataKey="하자율" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={riskColor(entry.rate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
