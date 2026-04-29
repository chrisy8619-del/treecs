import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateSpeciesDialog } from './create-species-dialog'
import { SpeciesToggleButton } from './toggle-button'
import { SpeciesDeleteButton } from './delete-button'
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

export default async function SpeciesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: species }, { data: groups }, { data: profile }] = await Promise.all([
    supabase
      .from('species')
      .select('id, species_name_ko, species_name_en, species_code, scientific_name, is_active, species_groups(group_name)')
      .order('species_name_ko'),
    supabase
      .from('species_groups')
      .select('id, group_name, group_code')
      .order('group_name'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ])
  const isSuperadmin = profile?.role === 'superadmin'

  const active = species?.filter((s) => s.is_active) ?? []
  const inactive = species?.filter((s) => !s.is_active) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">수종 관리</h2>
          <p className="text-muted-foreground">수목 수종 마스터 데이터를 관리합니다.</p>
        </div>
        <CreateSpeciesDialog groups={groups ?? []} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            수종 목록
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              활성 {active.length}종 · 비활성 {inactive.length}종
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {species && species.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>수종명(한글)</TableHead>
                  <TableHead>수종코드</TableHead>
                  <TableHead>수종명(영문)</TableHead>
                  <TableHead>학명</TableHead>
                  <TableHead>그룹</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {species.map((s) => {
                  const group = Array.isArray(s.species_groups) ? s.species_groups[0] : s.species_groups
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.species_name_ko}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{s.species_code}</TableCell>
                      <TableCell>{s.species_name_en ?? '-'}</TableCell>
                      <TableCell className="italic text-sm">{s.scientific_name ?? '-'}</TableCell>
                      <TableCell>{group?.group_name ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={s.is_active ? 'default' : 'outline'}>
                          {s.is_active ? '활성' : '비활성'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <SpeciesToggleButton id={s.id} isActive={s.is_active} />
                          {isSuperadmin && <SpeciesDeleteButton id={s.id} />}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">등록된 수종이 없습니다.</p>
              <p className="text-xs mt-1">우측 상단 &apos;수종 등록&apos; 버튼으로 추가하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
