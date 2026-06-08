'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type SiteReserveData } from './charts'

type SiteRow = {
  name: string
  defect_rate: number
  inspected?: number
  defect?: number
  reserve_cost?: number
}

type Props = {
  siteData: SiteRow[]
  siteReserveData: SiteReserveData[]
}

function riskBadge(rate: number) {
  if (rate >= 0.20) return <Badge className="bg-red-500 hover:bg-red-500 text-white">고위험</Badge>
  if (rate >= 0.10) return <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white">중위험</Badge>
  return <Badge className="bg-green-500 hover:bg-green-500 text-white">저위험</Badge>
}

const PAGE_SIZE = 20

export function SiteAnalysisTable({ siteData, siteReserveData }: Props) {
  const [page, setPage] = useState(1)

  // siteData 우선, 없으면 siteReserveData 기반으로 행 구성
  const rows: SiteRow[] = siteData.length > 0
    ? siteData.map((s) => {
        const reserve = siteReserveData.find((r) => r.name === s.name)
        return { ...s, reserve_cost: reserve?.reserve_cost }
      })
    : siteReserveData.map((s) => ({
        name: s.name,
        defect_rate: s.defect_rate,
        reserve_cost: s.reserve_cost,
      }))

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pagedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
      acc.push(p)
      return acc
    }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          현장별 분석
          <span className="ml-2 text-sm font-normal text-muted-foreground">전체 {total}개 현장</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">순위</TableHead>
              <TableHead>현장명</TableHead>
              <TableHead className="text-right">점검 수량</TableHead>
              <TableHead className="text-right">하자 수량</TableHead>
              <TableHead className="text-right">하자율</TableHead>
              <TableHead className="text-right">예상 하자 관리비용</TableHead>
              <TableHead>리스크 등급</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((site, idx) => {
              const globalIdx = (page - 1) * PAGE_SIZE + idx
              return (
                <TableRow key={globalIdx}>
                  <TableCell className="text-muted-foreground text-sm">{globalIdx + 1}</TableCell>
                  <TableCell className="font-medium">{site.name}</TableCell>
                  <TableCell className="text-right">
                    {site.inspected != null ? site.inspected.toLocaleString() : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {site.defect != null ? site.defect.toLocaleString() : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <span className={site.defect_rate >= 0.20 ? 'text-red-500' : site.defect_rate >= 0.10 ? 'text-yellow-500' : ''}>
                      {(site.defect_rate * 100).toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-orange-600">
                    {site.reserve_cost != null ? `₩${site.reserve_cost.toLocaleString()}` : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>{riskBadge(site.defect_rate)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {/* 페이지네이션 */}
        <div className="px-4 py-2 border-t flex items-center justify-between text-xs text-gray-500 bg-gray-50">
          <span>전체 {total}개 현장</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {pageNumbers.map((p, i) =>
              p === '...' ? (
                <span key={`e-${i}`} className="px-1">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`w-6 h-6 rounded text-xs transition-colors ${page === p ? 'bg-[#1a3a2a] text-white' : 'hover:bg-gray-200'}`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
