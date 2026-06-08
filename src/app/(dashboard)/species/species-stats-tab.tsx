'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type SpeciesStat = {
  speciesNameKo: string
  groupName: string | null
  totalQty: number
  defectRate: number  // 0.0 ~ 1.0 소수
}

type RiskLevel = '위험' | '주의' | '보통' | '양호'

function getRisk(rate: number): RiskLevel {
  if (rate >= 0.35) return '위험'
  if (rate >= 0.20) return '주의'
  if (rate >= 0.10) return '보통'
  return '양호'
}

function getRiskColor(risk: RiskLevel) {
  switch (risk) {
    case '위험': return { text: 'text-red-500', bg: 'bg-red-500', dot: 'bg-red-500' }
    case '주의': return { text: 'text-orange-400', bg: 'bg-orange-400', dot: 'bg-orange-400' }
    case '보통': return { text: 'text-blue-500', bg: 'bg-blue-500', dot: 'bg-blue-500' }
    case '양호': return { text: 'text-green-500', bg: 'bg-green-500', dot: 'bg-green-500' }
  }
}

function getManagement(risk: RiskLevel): string {
  switch (risk) {
    case '위험': return '대체 수종 검토 필요'
    case '주의': return '모니터링 강화'
    case '보통': return '정기 관리'
    case '양호': return '적극 권장'
  }
}

const RISK_FILTERS: Array<{ label: string; value: RiskLevel | '전체' }> = [
  { label: '전체', value: '전체' },
  { label: '위험', value: '위험' },
  { label: '주의', value: '주의' },
  { label: '보통', value: '보통' },
  { label: '양호', value: '양호' },
]

type Props = {
  stats: SpeciesStat[]
}

export function SpeciesStatsTab({ stats }: Props) {
  const [filter, setFilter] = useState<RiskLevel | '전체'>('전체')
  const [search, setSearch] = useState('')

  const filtered = stats
    .filter((s) => filter === '전체' || getRisk(s.defectRate) === filter)
    .filter((s) => s.speciesNameKo.includes(search))
    .sort((a, b) => b.defectRate - a.defectRate)

  // 프로그레스 바 최대값: 가장 높은 하자율 기준 (최소 0.5)
  const maxRate = Math.max(...stats.map((s) => s.defectRate), 0.5)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">수목 현황</CardTitle>
        <p className="text-xs text-muted-foreground">전체 수종 하자율 분석 · 리스크 4단계 분류</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 필터 + 검색 */}
        <div className="flex items-center gap-2 flex-wrap">
          {RISK_FILTERS.map(({ label, value }) => {
            const isActive = filter === value
            const riskColor =
              value !== '전체' ? getRiskColor(value as RiskLevel) : null
            return (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                  isActive
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                }`}
              >
                {riskColor && (
                  <span className={`w-2 h-2 rounded-full ${riskColor.dot}`} />
                )}
                {label}
              </button>
            )
          })}
          <input
            type="text"
            placeholder="수종명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-2 h-8 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 w-40"
          />
        </div>

        {/* 테이블 */}
        {filtered.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/5">수종명</TableHead>
                <TableHead className="w-1/6">분류</TableHead>
                <TableHead className="w-1/8">식재 주수</TableHead>
                <TableHead className="w-1/8">하자율</TableHead>
                <TableHead className="w-1/4">비율</TableHead>
                <TableHead className="w-1/10">리스크</TableHead>
                <TableHead>관리 방향</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const risk = getRisk(s.defectRate)
                const color = getRiskColor(risk)
                const barWidth = (s.defectRate / maxRate) * 100
                const ratePercent = (s.defectRate * 100).toFixed(2)

                return (
                  <TableRow key={s.speciesNameKo}>
                    <TableCell className="font-medium">{s.speciesNameKo}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {s.groupName ?? '-'}
                    </TableCell>
                    <TableCell className="text-sm">{s.totalQty.toLocaleString()}주</TableCell>
                    <TableCell className={`font-semibold ${color.text}`}>
                      {ratePercent}%
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 w-32 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`absolute left-0 top-0 h-full rounded-full ${color.bg}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {(s.defectRate * 100).toFixed(1)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${color.text}`}>{risk}</span>
                    </TableCell>
                    <TableCell className={`text-sm ${color.text}`}>
                      {getManagement(risk)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">
              {stats.length === 0
                ? '식재 기록이 있는 수종이 없습니다.'
                : '검색 조건에 맞는 수종이 없습니다.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
