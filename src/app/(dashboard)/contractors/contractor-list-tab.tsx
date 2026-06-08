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

type Organization = { name: string } | null
type Contractor = {
  id: string
  contractor_name: string
  contractor_code: string
  contact_name: string | null
  contact_phone: string | null
  is_active: boolean
  organizations: Organization | Organization[]
}

type Props = {
  contractors: Contractor[]
  isSuperadmin: boolean
}

export function ContractorListTab({ contractors, isSuperadmin }: Props) {
  const active = contractors.filter((c) => c.is_active)
  const inactive = contractors.filter((c) => !c.is_active)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          협력사 목록
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            활성 {active.length}개 · 비활성 {inactive.length}개
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {contractors.length > 0 ? (
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
  )
}
