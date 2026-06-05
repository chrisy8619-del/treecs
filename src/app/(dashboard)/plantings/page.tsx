import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreatePlantingDialog } from './create-planting-dialog'
import { PlantingDeleteButton } from './delete-button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function PlantingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: records },
    { data: sites },
    { data: contractors },
    { data: species },
    { data: specCodes },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from('planting_records')
      .select(`
        id,
        quantity_planted,
        planting_date,
        occupancy_basis_date,
        sites ( site_name, site_code ),
        contractors ( contractor_name ),
        species ( species_name_ko ),
        spec_codes ( spec_label_raw )
      `)
      .order('created_at', { ascending: false })
      .limit(10000),
    supabase.from('sites').select('id, site_name, site_code').eq('status', 'active').order('site_name'),
    supabase.from('contractors').select('id, contractor_name, contractor_code').eq('is_active', true).order('contractor_name'),
    supabase.from('species').select('id, species_name_ko, species_code').eq('is_active', true).order('species_name_ko'),
    supabase.from('spec_codes').select('id, spec_label_raw').order('spec_label_raw'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ])
  const isAdmin = ['admin', 'superadmin'].includes(profile?.role ?? '')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">식재 기록</h2>
          <p className="text-muted-foreground">수목 식재 내역을 등록하고 관리합니다.</p>
        </div>
        <CreatePlantingDialog
          sites={sites ?? []}
          contractors={contractors ?? []}
          species={species ?? []}
          specCodes={specCodes ?? []}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            식재 목록
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              총 {records?.length ?? 0}건
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records && records.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>현장</TableHead>
                  <TableHead>시공사</TableHead>
                  <TableHead>수종</TableHead>
                  <TableHead>규격</TableHead>
                  <TableHead className="text-right">수량 (주)</TableHead>
                  <TableHead>식재일</TableHead>
                  <TableHead>준공 기산일</TableHead>
                  {isAdmin && <TableHead className="w-8" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((rec) => {
                  const site = Array.isArray(rec.sites) ? rec.sites[0] : rec.sites
                  const contractor = Array.isArray(rec.contractors) ? rec.contractors[0] : rec.contractors
                  const sp = Array.isArray(rec.species) ? rec.species[0] : rec.species
                  const sc = Array.isArray(rec.spec_codes) ? rec.spec_codes[0] : rec.spec_codes
                  return (
                    <TableRow key={rec.id}>
                      <TableCell className="font-medium">
                        {site?.site_name ?? '-'}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({site?.site_code ?? '-'})
                        </span>
                      </TableCell>
                      <TableCell>{contractor?.contractor_name ?? '-'}</TableCell>
                      <TableCell>{sp?.species_name_ko ?? '-'}</TableCell>
                      <TableCell>{sc?.spec_label_raw ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        {rec.quantity_planted.toLocaleString()}
                      </TableCell>
                      <TableCell>{rec.planting_date ?? '-'}</TableCell>
                      <TableCell>{rec.occupancy_basis_date ?? '-'}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <PlantingDeleteButton id={rec.id} />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">등록된 식재 기록이 없습니다.</p>
              <p className="text-xs mt-1">우측 상단 &apos;식재 등록&apos; 버튼으로 추가하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
