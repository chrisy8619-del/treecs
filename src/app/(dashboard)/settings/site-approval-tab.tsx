'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { approveSite, rejectSite } from '@/app/actions/settings'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapPin, Calendar, CheckCircle2, XCircle } from 'lucide-react'

export type PendingSite = {
  id: string
  site_name: string
  site_code: string
  region: string | null
  occupancy_date: string | null
  start_date: string | null
  created_at: string
  planting_count: number
}

export function SiteApprovalTab({ sites }: { sites: PendingSite[] }) {
  const [isPending, setIsPending] = useState(false)
  const [localSites, setLocalSites] = useState<PendingSite[]>(sites)

  async function handleApprove(siteId: string, siteName: string) {
    setIsPending(true)
    try {
      const res = await approveSite(siteId)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(`'${siteName}' 현장이 승인되었습니다.`)
        setLocalSites((prev) => prev.filter((s) => s.id !== siteId))
      }
    } finally { setIsPending(false) }
  }

  async function handleReject(siteId: string, siteName: string) {
    if (!confirm(`'${siteName}' 현장을 반려하시겠습니까?\n업로드된 수목 데이터도 함께 삭제됩니다.`)) return
    setIsPending(true)
    try {
      const res = await rejectSite(siteId)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(`'${siteName}' 현장이 반려되었습니다.`)
        setLocalSites((prev) => prev.filter((s) => s.id !== siteId))
      }
    } finally { setIsPending(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            엑셀 업로드 시 신규 등록된 현장입니다. 승인하면 대시보드에서 조회 가능합니다.
          </p>
        </div>
        {localSites.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            대기 {localSites.length}건
          </Badge>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>현장코드</TableHead>
              <TableHead>현장명</TableHead>
              <TableHead>지역</TableHead>
              <TableHead>준공일</TableHead>
              <TableHead>식재시기</TableHead>
              <TableHead className="text-right">수목 수</TableHead>
              <TableHead>등록일시</TableHead>
              <TableHead className="text-center">처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {localSites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-400 opacity-50" />
                  승인 대기 중인 현장이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              localSites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {site.site_code}
                  </TableCell>
                  <TableCell className="font-medium">{site.site_name}</TableCell>
                  <TableCell>
                    {site.region ? (
                      <span className="flex items-center gap-1 text-xs">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        {site.region}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {site.occupancy_date ? (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {site.occupancy_date}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {site.start_date ?? '-'}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {site.planting_count > 0 ? (
                      <span className="text-green-600 font-medium">{site.planting_count}종</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(site.created_at).toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleApprove(site.id, site.site_name)}
                        className="h-7 px-3 text-xs gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        승인
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleReject(site.id, site.site_name)}
                        className="h-7 px-3 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        반려
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {localSites.length > 0 && (
        <p className="text-xs text-muted-foreground">
          * 반려 시 업로드된 수목 데이터도 함께 삭제됩니다.
        </p>
      )}
    </div>
  )
}
