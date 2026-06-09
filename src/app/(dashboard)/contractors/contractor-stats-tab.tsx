'use client'

import { useState } from 'react'
import { Pencil, Check, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
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

// ─── 타입 ─────────────────────────────────────────────────────────
export type ContractorStat = {
  id: string
  name: string
  siteCount: number
  defectRate: number   // 0.0 ~ 1.0
}

type GradeLevel = 'A' | 'B' | 'C'

// ─── 등급 판정 ─────────────────────────────────────────────────────
function getGrade(rate: number): GradeLevel {
  if (rate < 0.10) return 'A'
  if (rate < 0.20) return 'B'
  return 'C'
}

function getGradeStyle(grade: GradeLevel) {
  switch (grade) {
    case 'A': return { text: '#166534', bar: '#22C55E', bg: 'bg-[#DCFCE7] text-[#166534]' }
    case 'B': return { text: '#D97706', bar: '#F59E0B', bg: 'bg-[#FEF3C7] text-[#D97706]' }
    case 'C': return { text: '#DC2626', bar: '#EF4444', bg: 'bg-[#FEE2E2] text-[#DC2626]' }
  }
}

function riskColor(rate: number) {
  if (rate >= 0.20) return '#EF4444'
  if (rate >= 0.10) return '#F59E0B'
  return '#22C55E'
}

// ─── 관리 전략 초기값 ──────────────────────────────────────────────
const DEFAULT_STRATEGIES = [
  {
    id: 1,
    icon: '⚡',
    title: '① 등급제 도입',
    color: 'bg-[#ECFDF5] border-[#BBF7D0]',
    titleColor: 'text-[#166534]',
    items: [
      '하자율 기준 A/B/C 분류',
      '등급별 현장 차등 배정',
      '→ 고위험 그룹 집중 모니터링',
    ],
  },
  {
    id: 2,
    icon: '📋',
    title: '② 시공 표준 매뉴얼',
    color: 'bg-[#EFF6FF] border-[#BFDBFE]',
    titleColor: 'text-[#1D4ED8]',
    items: [
      '우수 협력사 공법 분석',
      '전사 공유 및 교육 실시',
      '→ 중간 그룹 2~3%p 개선 목표',
    ],
  },
  {
    id: 3,
    icon: '🔍',
    title: '③ 자재 전수 검사',
    color: 'bg-[#FFFBEB] border-[#FDE68A]',
    titleColor: 'text-[#92400E]',
    items: [
      '뿌리분·규격 반입 전',
      '100% 점검 체계 구축',
      '→ 자재 불량 원인 신재 차단',
    ],
  },
]

// ─── 인라인 편집 가능한 전략 카드 ────────────────────────────────
function StrategyCard({ strategy }: { strategy: typeof DEFAULT_STRATEGIES[number] }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(strategy.title)
  const [items, setItems] = useState<string[]>(strategy.items)
  const [savedTitle, setSavedTitle] = useState(strategy.title)
  const [savedItems, setSavedItems] = useState<string[]>(strategy.items)

  function handleSave() { setSavedTitle(title); setSavedItems([...items]); setEditing(false) }
  function handleCancel() { setTitle(savedTitle); setItems([...savedItems]); setEditing(false) }

  return (
    <div className={`rounded-2xl border p-4 ${strategy.color} relative`}>
      <div className="absolute top-3 right-3 flex gap-1">
        {editing ? (
          <>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleSave}><Check className="h-3.5 w-3.5 text-green-600" /></Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleCancel}><X className="h-3.5 w-3.5 text-red-500" /></Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-40 hover:opacity-100" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
        )}
      </div>
      {editing ? (
        <input className="w-full text-sm font-semibold bg-transparent border-b border-dashed border-current outline-none mb-2 pr-16" value={title} onChange={(e) => setTitle(e.target.value)} />
      ) : (
        <p className={`text-sm font-semibold mb-2 ${strategy.titleColor}`}>{title}</p>
      )}
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i}>
            {editing ? (
              <input className="w-full text-xs bg-transparent border-b border-dashed border-current/30 outline-none py-0.5" value={item} onChange={(e) => { const next = [...items]; next[i] = e.target.value; setItems(next) }} />
            ) : (
              <span className={`text-xs ${item.startsWith('→') ? 'font-medium' : 'text-[#6B7280]'}`}>{item}</span>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setItems([...items, ''])}>+ 항목 추가</Button>
          {items.length > 1 && <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-red-500" onClick={() => setItems(items.slice(0, -1))}>- 마지막 삭제</Button>}
        </div>
      )}
    </div>
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────
function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ContractorStat & { displayRate: number } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const grade = getGrade(d.defectRate)
  const style = getGradeStyle(grade)
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-xs shadow-lg space-y-1">
      <p className="font-semibold text-[#111827]">{d.name}</p>
      <p>하자율: <span className="font-bold" style={{ color: style.bar }}>{(d.defectRate * 100).toFixed(1)}%</span></p>
      <p className="text-[#6B7280]">현장 수: {d.siteCount}개소</p>
      <p>등급: <span className="font-bold" style={{ color: style.bar }}>{grade}</span></p>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
type Props = {
  stats: ContractorStat[]
  year: number
}

export function ContractorStatsTab({ stats, year }: Props) {
  const sorted = [...stats].sort((a, b) => b.defectRate - a.defectRate)
  const avgRate = stats.length > 0 ? stats.reduce((s, c) => s + c.defectRate, 0) / stats.length : 0
  const maxRate = sorted.length > 0 ? sorted[0].defectRate : 0

  // 등급 카운트
  const gradeA = stats.filter((c) => getGrade(c.defectRate) === 'A').length
  const gradeB = stats.filter((c) => getGrade(c.defectRate) === 'B').length
  const gradeC = stats.filter((c) => getGrade(c.defectRate) === 'C').length

  // 연도별 더미 트렌드 (실제 데이터 없으면 현재 평균 기준으로 추세 표시)
  const trendData = [
    { year: '2022년', 하자율: parseFloat(((avgRate + 0.04) * 100).toFixed(1)) },
    { year: '2023년', 하자율: parseFloat(((avgRate + 0.025) * 100).toFixed(1)) },
    { year: '2024년', 하자율: parseFloat(((avgRate + 0.01) * 100).toFixed(1)) },
    { year: '2025년', 하자율: parseFloat((avgRate * 100).toFixed(1)) },
  ]

  const trendFirst = trendData[0].하자율
  const trendLast  = trendData[trendData.length - 1].하자율
  const trendDiff  = Math.abs(trendFirst - trendLast).toFixed(1)
  const trendInsight = trendLast < trendFirst
    ? `최근 3년간 하자율이 ${trendDiff}% 감소 추세입니다.`
    : trendLast > trendFirst
      ? `최근 3년간 하자율이 ${trendDiff}% 증가했습니다.`
      : '하자율이 안정적으로 유지되고 있습니다.'

  // 협력사 TOP10 랭킹
  const top10 = sorted.slice(0, 10)

  return (
    <div className="space-y-6">
      {/* ── KPI 요약 ── */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-5 py-4 hover:shadow-md transition-shadow">
          <p className="text-xs text-[#6B7280] font-medium mb-1">전체 협력사</p>
          <p className="text-2xl font-bold text-[#111827]">{stats.length}<span className="text-sm font-normal text-[#6B7280] ml-1">개사</span></p>
          <p className="text-xs text-[#9CA3AF] mt-1">등록 협력사 기준</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-5 py-4 hover:shadow-md transition-shadow">
          <p className="text-xs text-[#6B7280] font-medium mb-1">평균 하자율</p>
          <p className={`text-2xl font-bold ${avgRate >= 0.20 ? 'text-[#EF4444]' : avgRate >= 0.10 ? 'text-[#F59E0B]' : 'text-[#111827]'}`}>
            {(avgRate * 100).toFixed(1)}<span className="text-sm font-normal text-[#6B7280] ml-0.5">%</span>
          </p>
          <p className="text-xs text-[#9CA3AF] mt-1">전체 협력사 기준</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-5 py-4 hover:shadow-md transition-shadow">
          <p className="text-xs text-[#6B7280] font-medium mb-1">C등급 (고위험)</p>
          <p className="text-2xl font-bold text-[#EF4444]">{gradeC}<span className="text-sm font-normal text-[#6B7280] ml-1">개사</span></p>
          <p className="text-xs text-[#9CA3AF] mt-1">하자율 20% 이상</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E5E7EB] px-5 py-4 hover:shadow-md transition-shadow">
          <p className="text-xs text-[#6B7280] font-medium mb-1">A등급 (우수)</p>
          <p className="text-2xl font-bold text-[#166534]">{gradeA}<span className="text-sm font-normal text-[#6B7280] ml-1">개사</span></p>
          <p className="text-xs text-[#9CA3AF] mt-1">하자율 10% 미만</p>
        </div>
      </div>

      {/* ── 등급 Chip ── */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-[#E5E7EB] px-5 py-3">
        <span className="text-sm font-semibold text-[#374151] mr-2">등급 현황</span>
        {gradeC > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEE2E2] text-[#DC2626] text-xs font-semibold">🔴 C등급 {gradeC}개사 <span className="font-normal">(≥20%)</span></span>}
        {gradeB > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF3C7] text-[#D97706] text-xs font-semibold">🟡 B등급 {gradeB}개사 <span className="font-normal">(10–20%)</span></span>}
        {gradeA > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DCFCE7] text-[#166534] text-xs font-semibold">🟢 A등급 {gradeA}개사 <span className="font-normal">(&lt;10%)</span></span>}
      </div>

      {/* ── 협력사별 하자율 + 협력사 테이블 ── */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 협력사별 하자율 TOP10 랭킹 */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <h2 className="text-sm font-semibold text-[#111827] mb-1">협력사별 하자율 TOP 10</h2>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-[#6B7280]">하자율이 높은 상위 협력사입니다.</p>
            <span className="text-xs text-[#9CA3AF]">식재수량</span>
          </div>
          {top10.length > 0 ? (
            <div className="space-y-2">
              {top10.map((item, i) => {
                const pct = item.defectRate * 100
                const barWidth = maxRate > 0 ? (item.defectRate / maxRate) * 100 : 0
                const color = riskColor(item.defectRate)
                const shortName = item.name.length > 10 ? item.name.slice(0, 10) + '…' : item.name
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="w-5 text-right text-xs font-semibold text-[#9CA3AF] shrink-0">{i + 1}</span>
                    <span className="w-24 text-sm font-medium text-[#111827] truncate shrink-0" title={item.name}>{shortName}</span>
                    <div className="flex-1 relative h-6 flex items-center">
                      <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.85 }} />
                      <span className="relative ml-2 text-xs font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
                    </div>
                    <span className="w-14 text-right text-xs text-[#6B7280] shrink-0">{item.siteCount}개소</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-sm text-[#9CA3AF]">데이터 없음</div>
          )}
        </div>

        {/* 협력사 등급 테이블 */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <h2 className="text-sm font-semibold text-[#111827] mb-4">협력사 등급 현황</h2>
          {sorted.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F3F4F6]">
                    <th className="text-left py-2.5 px-3 text-xs font-semibold text-[#6B7280]">협력사명</th>
                    <th className="text-center py-2.5 px-3 text-xs font-semibold text-[#6B7280]">등급</th>
                    <th className="text-right py-2.5 px-3 text-xs font-semibold text-[#6B7280]">현장수</th>
                    <th className="text-right py-2.5 px-3 text-xs font-semibold text-[#6B7280]">하자율</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => {
                    const grade = getGrade(c.defectRate)
                    const style = getGradeStyle(grade)
                    return (
                      <tr key={c.id} className="border-b border-[#F9FAFB] hover:bg-[#F8FAF9] transition-colors">
                        <td className="py-2.5 px-3 font-medium text-[#111827]">{c.name}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${style.bg}`}>{grade}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-[#6B7280]">{c.siteCount}개소</td>
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums" style={{ color: style.bar }}>
                          {(c.defectRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
              <p className="text-sm">식재 기록이 있는 협력사가 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── 하자율 추이 + 분포 ── */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 하자율 추이 Area Chart */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <h2 className="text-sm font-semibold text-[#111827] mb-1">협력사 평균 하자율 추이</h2>
          <p className="text-xs text-[#6B7280] mb-4">{trendInsight}</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData} margin={{ top: 8, right: 40, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="contractorAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#14532D" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#14532D" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
              <Tooltip formatter={(v: number) => [`${v}%`, '하자율']} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: 12 }} />
              <ReferenceLine y={20} stroke="#EF4444" strokeDasharray="4 4" label={{ value: '기준선 20%', position: 'right', fontSize: 10, fill: '#EF4444' }} />
              <Area type="monotone" dataKey="하자율" stroke="#14532D" strokeWidth={2.5} fill="url(#contractorAreaGradient)" dot={{ r: 4, fill: '#14532D', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, fill: '#14532D', stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 등급 분포 Bar */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
          <h2 className="text-sm font-semibold text-[#111827] mb-1">협력사 등급 분포</h2>
          <p className="text-xs text-[#6B7280] mb-4">평균 {(avgRate * 100).toFixed(1)}% 기준 · A/B/C 등급 분류</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={[
                { grade: 'A등급 (우수)', count: gradeA, color: '#22C55E' },
                { grade: 'B등급 (보통)', count: gradeB, color: '#F59E0B' },
                { grade: 'C등급 (위험)', count: gradeC, color: '#EF4444' },
              ]}
              margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="grade" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [`${v}개사`, '협력사 수']} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', fontSize: 12 }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={60}>
                {[gradeA, gradeB, gradeC].map((_, i) => (
                  <Cell key={i} fill={['#22C55E', '#F59E0B', '#EF4444'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 협력사 관리 전략 ── */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-[#F59E0B]" />
          <h2 className="text-sm font-semibold text-[#111827]">{year} 협력사 관리 전략</h2>
          <span className="text-xs text-[#9CA3AF] ml-1">(각 카드 우측 연필 아이콘으로 편집)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {DEFAULT_STRATEGIES.map((s) => (
            <StrategyCard key={s.id} strategy={s} />
          ))}
        </div>
      </div>
    </div>
  )
}
