'use client'

import { useState } from 'react'
import { Pencil, Check, X, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
    case 'A': return { text: 'text-green-600', bar: '#22c55e', bg: 'bg-green-50 border-green-200 text-green-700' }
    case 'B': return { text: 'text-orange-500', bar: '#f97316', bg: 'bg-orange-50 border-orange-200 text-orange-700' }
    case 'C': return { text: 'text-red-500', bar: '#ef4444', bg: 'bg-red-50 border-red-200 text-red-700' }
  }
}

// ─── 관리 전략 초기값 ──────────────────────────────────────────────
const DEFAULT_STRATEGIES = [
  {
    id: 1,
    icon: '⚡',
    title: '① 등급제 도입',
    color: 'bg-green-50 border-green-200',
    titleColor: 'text-green-700',
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
    color: 'bg-blue-50 border-blue-200',
    titleColor: 'text-blue-700',
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
    color: 'bg-yellow-50 border-yellow-200',
    titleColor: 'text-yellow-700',
    items: [
      '뿌리분·규격 반입 전',
      '100% 점검 체계 구축',
      '→ 자재 불량 원인 신재 차단',
    ],
  },
]

// ─── 인라인 편집 가능한 전략 카드 ────────────────────────────────
function StrategyCard({
  strategy,
}: {
  strategy: typeof DEFAULT_STRATEGIES[number]
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(strategy.title)
  const [items, setItems] = useState<string[]>(strategy.items)
  const [savedTitle, setSavedTitle] = useState(strategy.title)
  const [savedItems, setSavedItems] = useState<string[]>(strategy.items)

  function handleSave() {
    setSavedTitle(title)
    setSavedItems([...items])
    setEditing(false)
  }

  function handleCancel() {
    setTitle(savedTitle)
    setItems([...savedItems])
    setEditing(false)
  }

  return (
    <div className={`rounded-xl border p-4 ${strategy.color} relative`}>
      {/* 편집 토글 버튼 */}
      <div className="absolute top-3 right-3 flex gap-1">
        {editing ? (
          <>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleSave}>
              <Check className="h-3.5 w-3.5 text-green-600" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleCancel}>
              <X className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-40 hover:opacity-100" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* 제목 */}
      {editing ? (
        <input
          className="w-full text-sm font-semibold bg-transparent border-b border-dashed border-current outline-none mb-2 pr-16"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      ) : (
        <p className={`text-sm font-semibold mb-2 ${strategy.titleColor}`}>{title}</p>
      )}

      {/* 항목 목록 */}
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i}>
            {editing ? (
              <input
                className="w-full text-xs bg-transparent border-b border-dashed border-current/30 outline-none py-0.5"
                value={item}
                onChange={(e) => {
                  const next = [...items]
                  next[i] = e.target.value
                  setItems(next)
                }}
              />
            ) : (
              <span className={`text-xs ${item.startsWith('→') ? 'font-medium' : 'text-muted-foreground'}`}>
                {item}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* 항목 추가/삭제 (편집 모드) */}
      {editing && (
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-2"
            onClick={() => setItems([...items, ''])}
          >
            + 항목 추가
          </Button>
          {items.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2 text-red-500"
              onClick={() => setItems(items.slice(0, -1))}
            >
              - 마지막 삭제
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 커스텀 Tooltip ───────────────────────────────────────────────
function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ContractorStat }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const grade = getGrade(d.defectRate)
  const style = getGradeStyle(grade)
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md space-y-1">
      <p className="font-medium">{d.name}</p>
      <p>하자율: <span className={`font-semibold ${style.text}`}>{(d.defectRate * 100).toFixed(2)}%</span></p>
      <p>현장 수: {d.siteCount}개소</p>
      <p>등급: <span className={`font-semibold ${style.text}`}>{grade}</span></p>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
type Props = {
  stats: ContractorStat[]
  year: number
}

export function ContractorStatsTab({ stats, year }: Props) {
  // 하자율 오름차순 정렬
  const sorted = [...stats].sort((a, b) => a.defectRate - b.defectRate)
  const avgRate = stats.length > 0
    ? stats.reduce((s, c) => s + c.defectRate, 0) / stats.length
    : 0

  // 차트용 데이터 (오름차순 → 차트는 위에서부터 낮은 순)
  const chartData = [...sorted].reverse().map((c) => ({
    ...c,
    displayRate: parseFloat((c.defectRate * 100).toFixed(2)),
  }))

  const maxRate = Math.max(...stats.map((c) => c.defectRate), 0.3)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h3 className="text-lg font-bold">협력사 현황</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          4개 현장 이상 기준 · 하자율 기반 A/B/C 등급 분류
        </p>
        <div className="flex items-center gap-4 mt-2 text-xs">
          <span><span className="font-bold text-green-600">A</span> 양호 (10% 미만)</span>
          <span><span className="font-bold text-orange-500">B</span> 보통 (10~20%)</span>
          <span><span className="font-bold text-red-500">C</span> 위험 (20% 이상)</span>
        </div>
      </div>

      {/* 테이블 + 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 협력사 테이블 */}
        <Card>
          <CardContent className="p-0">
            {sorted.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">협력사명</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs">등급</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">현장수</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">하자율</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-xs">비교</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => {
                    const grade = getGrade(c.defectRate)
                    const style = getGradeStyle(grade)
                    const barWidth = (c.defectRate / maxRate) * 100
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold border ${style.bg}`}>
                            {grade}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {c.siteCount}개소
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${style.text}`}>
                          {(c.defectRate * 100).toFixed(2)}%
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative h-2 w-24 rounded-full bg-muted overflow-hidden">
                            <div
                              className="absolute left-0 top-0 h-full rounded-full transition-all"
                              style={{ width: `${barWidth}%`, backgroundColor: style.bar }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <p className="text-sm">식재 기록이 있는 협력사가 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 가로 막대 차트 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              협력사별 하자율 비교
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                평균 {(avgRate * 100).toFixed(2)}% 기준
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={chartData.length * 44 + 40}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, Math.ceil(maxRate * 100 / 5) * 5]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={72}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="displayRate" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {chartData.map((entry) => {
                      const grade = getGrade(entry.defectRate)
                      return <Cell key={entry.id} fill={getGradeStyle(grade).bar} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                데이터 없음
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 협력사 관리 전략 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            {year} 협력사 관리 전략
            <span className="text-xs font-normal text-muted-foreground ml-1">
              (각 카드 우측 연필 아이콘으로 편집)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DEFAULT_STRATEGIES.map((s) => (
              <StrategyCard key={s.id} strategy={s} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
