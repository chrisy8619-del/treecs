import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateSiteDialog } from './create-site-dialog'
import { SiteStatusButton } from './status-button'
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
import { SiteDeleteButton } from './delete-button'

const statusLabel: Record<string, string> = {
  active: '진행중',
  pending: '대기',
  closed: '완료',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  pending: 'secondary',
  closed: 'outline',
}

export default async function SitesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: sites }, { data: organizations }, { data: profile }] = await Promise.all([
    supabase
      .from('sites')
      .select('id, site_name, site_code, region, project_type, status, start_date, end_date, occupancy_date, organizations(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('organizations')
      .select('id, name, code')
      .order('name'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ])
  const isSuperadmin = profile?.role === 'superadmin'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">현장 관리</h2>
          <p className="text-muted-foreground">공사 현장 마스터 데이터를 관리합니다.</p>
        </div>
        <CreateSiteDialog organizations={organizations ?? []} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            현장 목록
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              총 {sites?.length ?? 0}개
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sites && sites.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>현장명</TableHead>
                  <TableHead>코드</TableHead>
                  <TableHead>조직</TableHead>
                  <TableHead>지역</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>착공일</TableHead>
                  <TableHead>준공일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => {
                  const org = Array.isArray(site.organizations) ? site.organizations[0] : site.organizations
                  return (
                    <TableRow key={site.id}>
                      <TableCell className="font-medium">{site.site_name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{site.site_code}</TableCell>
                      <TableCell>{org?.name ?? '-'}</TableCell>
                      <TableCell>{site.region ?? '-'}</TableCell>
                      <TableCell>{site.project_type ?? '-'}</TableCell>
                      <TableCell>{site.start_date ?? '-'}</TableCell>
                      <TableCell>{site.occupancy_date ?? site.end_date ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[site.status] ?? 'outline'}>
                          {statusLabel[site.status] ?? site.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <SiteStatusButton id={site.id} status={site.status} />
                          {isSuperadmin && <SiteDeleteButton id={site.id} />}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">등록된 현장이 없습니다.</p>
              <p className="text-xs mt-1">우측 상단 &apos;현장 등록&apos; 버튼으로 추가하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
