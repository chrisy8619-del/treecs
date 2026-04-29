import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateContractorDialog } from './create-contractor-dialog'
import { ContractorToggleButton } from './toggle-button'
import { ContractorDeleteButton } from './delete-button'
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

export default async function ContractorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: contractors }, { data: organizations }, { data: profile }] = await Promise.all([
    supabase
      .from('contractors')
      .select('id, contractor_name, contractor_code, contact_name, contact_phone, is_active, organizations(name)')
      .order('contractor_name'),
    supabase
      .from('organizations')
      .select('id, name, code')
      .order('name'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ])
  const isSuperadmin = profile?.role === 'superadmin'

  const active = contractors?.filter((c) => c.is_active) ?? []
  const inactive = contractors?.filter((c) => !c.is_active) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">시공사 관리</h2>
          <p className="text-muted-foreground">시공사 마스터 데이터를 관리합니다.</p>
        </div>
        <CreateContractorDialog organizations={organizations ?? []} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            시공사 목록
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              활성 {active.length}개 · 비활성 {inactive.length}개
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {contractors && contractors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시공사명</TableHead>
                  <TableHead>코드</TableHead>
                  <TableHead>조직</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractors.map((c) => {
                  const org = Array.isArray(c.organizations) ? c.organizations[0] : c.organizations
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.contractor_name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{c.contractor_code}</TableCell>
                      <TableCell>{org?.name ?? '-'}</TableCell>
                      <TableCell>{c.contact_name ?? '-'}</TableCell>
                      <TableCell>{c.contact_phone ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={c.is_active ? 'default' : 'outline'}>
                          {c.is_active ? '활성' : '비활성'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <ContractorToggleButton id={c.id} isActive={c.is_active} />
                          {isSuperadmin && <ContractorDeleteButton id={c.id} />}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">등록된 시공사가 없습니다.</p>
              <p className="text-xs mt-1">우측 상단 &apos;시공사 등록&apos; 버튼으로 추가하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
