'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── 상수 (추후 관리자 설정으로 확장 가능) ───────────────────────
const DEFAULT_AVG_DEFECT_RATE = 0.15
const DEFAULT_SAMPLE_SIZE = 30

// ─── 타입 ─────────────────────────────────────────────────────────
export type SpeciesStat = {
  speciesNameKo: string
  groupName: string | null
  totalQty: number
  totalDefectQty: number
  defectRate: number  // 원본 하자율 (0.0 ~ 1.0)
}

type RiskLevel = '위험' | '주의' | '보통' | '양호' | '표본부족' | '참고'
type FilterValue = '전체' | '위험' | '주의' | '보통' | '양호' | '표본부족'

// ─── 보정 하자율 계산 ──────────────────────────────────────────────
function calcAdjustedRate(defectQty: number, totalQty: number): number {
  return (
    (defectQty + DEFAULT_AVG_DEFECT_RATE * DEFAULT_SAMPLE_SIZE) /
    (totalQty + DEFAULT_SAMPLE_SIZE)
  )
}

// ─── 신뢰도 분류 ───────────────────────────────────────────────────
function getTrustLevel(qty: number): string {
  if (qty < 10) return '표본부족'
  if (qty < 30) return '참고'
  if (qty < 100) return '보통'
  return '높음'
}

// ─── 최종 리스크 판정 ──────────────────────────────────────────────
function getFinalRisk(qty: number, adjustedRate: number): RiskLevel {
  if (qty < 10) return '표본부족'
  if (qty < 30) return '참고'
  if (adjustedRate >= 0.30) return '위험'
  if (adjustedRate >= 0.20) return '주의'
  if (adjustedRate >= 0.10) return '보통'
  return '양호'
}

// ─── 관리 방향 ─────────────────────────────────────────────────────
function getManagement(risk: RiskLevel): string {
  switch (risk) {
    case '위험':    return '대체 수종 검토 필요'
    case '주의':    return '모니터링 강화'
    case '보통':    return '정기 관리'
    case '양호':    return '적극 권장'
    case '표본부족': return '데이터 누적 필요'
    case '참고':    return '추가 데이터 확보 필요'
  }
}

// ─── 리스크 색상 ───────────────────────────────────────────────────
function getRiskStyle(risk: RiskLevel) {
  switch (risk) {
    case '위험':
      return { text: 'text-red-500', bg: 'bg-red-500', dot: 'bg-red-500', badge: 'bg-red-50 text-red-600 border-red-200' }
    case '주의':
      return { text: 'text-orange-400', bg: 'bg-orange-400', dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-600 border-orange-200' }
    case '보통':
      return { text: 'text-blue-500', bg: 'bg-blue-500', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-600 border-blue-200' }
    case '양호':
      return { text: 'text-green-500', bg: 'bg-green-500', dot: 'bg-green-500', badge: 'bg-green-50 text-green-600 border-green-200' }
    case '표본부족':
    case '참고':
      return { text: 'text-gray-400', bg: 'bg-gray-300', dot: 'bg-gray-400', badge: 'bg-gray-50 text-gray-500 border-gray-200' }
  }
}

// ─── 신뢰도 배지 색상 ─────────────────────────────────────────────
function getTrustBadgeClass(trust: string): string {
  switch (trust) {
    case '높음':   return 'bg-green-50 text-green-700 border-green-200'
    case '보통':   return 'bg-blue-50 text-blue-700 border-blue-200'
    case '참고':   return 'bg-yellow-50 text-yellow-700 border-yellow-200'
    default:      return 'bg-gray-50 text-gray-500 border-gray-200'
  }
}

// ─── 필터 정의 ────────────────────────────────────────────────────
const RISK_FILTERS: Array<{ label: string; value: FilterValue; dotClass?: string }> = [
  { label: '전체', value: '전체' },
  { label: '위험', value: '위험', dotClass: 'bg-red-500' },
  { label: '주의', value: '주의', dotClass: 'bg-orange-400' },
  { label: '보통', value: '보통', dotClass: 'bg-blue-500' },
  { label: '양호', value: '양호', dotClass: 'bg-green-500' },
  { label: '표본부족', value: '표본부족', dotClass: 'bg-gray-400' },
]

// ─── Tooltip 컴포넌트 ─────────────────────────────────────────────
function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  return (
    <div className="group relative inline-block">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100">
        {content}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-border" />
      </div>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────
type Props = {
  stats: SpeciesStat[]
}

export function SpeciesStatsTab({ stats }: Props) {
  const [filter, setFilter] = useState<FilterValue>('전체')
  const [search, setSearch] = useState('')

  // 보정 하자율 포함한 계산 결과 목록
  const computed = stats.map((s) => {
    const adjustedRate = calcAdjustedRate(s.totalDefectQty, s.totalQty)
    const finalRisk = getFinalRisk(s.totalQty, adjustedRate)
    const trust = getTrustLevel(s.totalQty)
    return { ...s, adjustedRate, finalRisk, trust }
  })

  // 필터 매핑: '표본부족' 필터는 risk가 '표본부족' 또는 '참고' 모두 포함
  const filtered = computed
    .filter((s) => {
      if (filter === '전체') return true
      if (filter === '표본부족') return s.finalRisk === '표본부족' || s.finalRisk === '참고'
      return s.finalRisk === filter
    })
    .filter((s) => s.speciesNameKo.includes(search))
    .sort((a, b) => b.adjustedRate - a.adjustedRate)

  // 프로그레스 바 기준: 보정 하자율 최대값 (최소 0.3)
  const maxAdjusted = Math.max(...computed.map((s) => s.adjustedRate), 0.3)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">수목 현황</CardTitle>
        <p className="text-xs text-muted-foreground">
          전체 수종 하자율 분석 · 표본 신뢰도 기반 리스크 4단계 분류
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 필터 + 검색 */}
        <div className="flex items-center gap-2 flex-wrap">
          {RISK_FILTERS.map(({ label, value, dotClass }) => {
            const isActive = filter === value
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
                {dotClass && <span className={`w-2 h-2 rounded-full ${dotClass}`} />}
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>수종명</TableHead>
                  <TableHead>분류</TableHead>
                  <TableHead className="text-right">식재 주수</TableHead>
                  <TableHead className="text-right">하자율</TableHead>
                  <TableHead className="text-right">보정 하자율</TableHead>
                  <TableHead>데이터 신뢰도</TableHead>
                  <TableHead>비율</TableHead>
                  <TableHead>최종 리스크</TableHead>
                  <TableHead>관리 방향</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const style = getRiskStyle(s.finalRisk)
                  const barWidth = Math.min((s.adjustedRate / maxAdjusted) * 100, 100)
                  const rawPercent = (s.defectRate * 100).toFixed(1)
                  const adjPercent = (s.adjustedRate * 100).toFixed(1)
                  const isLowSample = s.totalQty < 10

                  return (
                    <TableRow key={s.speciesNameKo} className="group">
                      {/* 수종명 + 표본부족 뱃지 + tooltip */}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Tooltip
                            content={
                              <div className="space-y-1">
                                <div className="font-medium mb-1">{s.speciesNameKo}</div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">식재 주수</span>
                                  <span>{s.totalQty.toLocaleString()}주</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">하자 수량</span>
                                  <span>{s.totalDefectQty.toLocaleString()}주</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">기존 하자율</span>
                                  <span>{rawPercent}%</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">보정 하자율</span>
                                  <span className={style.text}>{adjPercent}%</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">데이터 신뢰도</span>
                                  <span>{s.trust}</span>
                                </div>
                                {isLowSample && (
                                  <div className="mt-1 pt-1 border-t text-yellow-600 text-[11px]">
                                    표본 수량이 적어 실제 리스크와 차이가 있을 수 있습니다.
                                  </div>
                                )}
                              </div>
                            }
                          >
                            <span className="cursor-default border-b border-dashed border-muted-foreground/40">
                              {s.speciesNameKo}
                            </span>
                          </Tooltip>
                          {isLowSample && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-gray-50 text-gray-400 border-gray-200 whitespace-nowrap">
                              Low Sample
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* 분류 */}
                      <TableCell className="text-muted-foreground text-sm">
                        {s.groupName ?? '-'}
                      </TableCell>

                      {/* 식재 주수 */}
                      <TableCell className="text-right text-sm tabular-nums">
                        {s.totalQty.toLocaleString()}주
                      </TableCell>

                      {/* 하자율 (원본, 텍스트만) */}
                      <TableCell className="text-right tabular-nums text-muted-foreground text-sm">
                        {rawPercent}%
                      </TableCell>

                      {/* 보정 하자율 (badge) */}
                      <TableCell className="text-right">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold border ${style.badge}`}>
                          {adjPercent}%
                        </span>
                      </TableCell>

                      {/* 데이터 신뢰도 */}
                      <TableCell>
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium border ${getTrustBadgeClass(s.trust)}`}>
                          {s.trust}
                        </span>
                      </TableCell>

                      {/* 비율 progress (보정 하자율 기준) */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="relative h-2 w-28 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`absolute left-0 top-0 h-full rounded-full transition-all ${style.bg}`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
                            {adjPercent}
                          </span>
                        </div>
                      </TableCell>

                      {/* 최종 리스크 */}
                      <TableCell>
                        <span className={`text-sm font-medium ${style.text}`}>
                          {s.finalRisk}
                        </span>
                      </TableCell>

                      {/* 관리 방향 */}
                      <TableCell className={`text-sm ${style.text}`}>
                        {getManagement(s.finalRisk)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
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
