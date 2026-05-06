import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateInspectionDialog } from './create-inspection-dialog'
import { InspectionDeleteButton } from './delete-button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const seasonLabel: Record<string, string> = {
  spring: '봄',
  summer: '여름',
  fall: '가을',
  winter: '겨울',
}

const basisLabel: Record<string, string> = {
  occupancy: '준공일',
  planting: '식재일',
  inspection: '점검일',
}

export default async function InspectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: rounds }, { data: sites }, { data: profile }] = await Promise.all([
    supabase
      .from('inspection_rounds')
      .select(`
        id,
        inspection_name,
        inspection_date,
        inspection_year,
        season_code,
        inspection_basis_type,
        performed_by,
        sites ( site_name, site_code )
      `)
      .order('inspection_date', { ascending: false }),
    supabase
      .from('sites')
      .select('id, site_name, site_code')
      .eq('status', 'active')
      .order('site_name'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ])
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role ?? '')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">점검 관리</h2>
          <p className="text-muted-foreground">수목 점검 회차를 등록하고 관리합니다.</p>
        </div>
        <CreateInspectionDialog sites={sites ?? []} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            점검 목록
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              총 {rounds?.length ?? 0}건
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rounds && rounds.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>현장</TableHead>
                  <TableHead>점검명</TableHead>
                  <TableHead>점검일</TableHead>
                  <TableHead>계절</TableHead>
                  <TableHead>기산기준</TableHead>
                  <TableHead>점검자</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rounds.map((round) => {
                  const site = Array.isArray(round.sites) ? round.sites[0] : round.sites
                  return (
                    <TableRow key={round.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {site?.site_name ?? '-'}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({site?.site_code ?? '-'})
                        </span>
                      </TableCell>
                      <TableCell>{round.inspection_name ?? '-'}</TableCell>
                      <TableCell>{round.inspection_date}</TableCell>
                      <TableCell>
                        {round.season_code ? (
                          <Badge variant="secondary">
                            {seasonLabel[round.season_code] ?? round.season_code}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {round.inspection_basis_type
                          ? basisLabel[round.inspection_basis_type] ?? round.inspection_basis_type
                          : '-'}
                      </TableCell>
                      <TableCell>{round.performed_by ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isAdmin && <InspectionDeleteButton id={round.id} />}
                          <Link
                            href={`/inspections/${round.id}`}
                            className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">등록된 점검 내역이 없습니다.</p>
              <p className="text-xs mt-1">우측 상단 &apos;점검 등록&apos; 버튼으로 추가하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
