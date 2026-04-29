import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { AddItemDialog } from './add-item-dialog'
import { DeleteItemButton } from './delete-item-button'

const seasonLabel: Record<string, string> = {
  spring: '봄', summer: '여름', fall: '가을', winter: '겨울',
}
const basisLabel: Record<string, string> = {
  occupancy: '준공일', planting: '식재일', inspection: '점검일',
}

export default async function InspectionDetailPage(props: PageProps<'/inspections/[id]'>) {
  const { id } = await props.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: round } = await supabase
    .from('inspection_rounds')
    .select(`
      id, inspection_name, inspection_date, season_code,
      inspection_basis_type, performed_by, notes,
      sites ( id, site_name, site_code )
    `)
    .eq('id', id)
    .single()

  if (!round) notFound()

  const site = Array.isArray(round.sites) ? round.sites[0] : round.sites

  const [{ data: items }, { data: plantingRecords }] = await Promise.all([
    supabase
      .from('inspection_items')
      .select(`
        id, quantity_inspected, defect_quantity, defect_rate_cached, notes,
        species ( species_name_ko ),
        spec_codes ( spec_label_raw ),
        contractors ( contractor_name )
      `)
      .eq('inspection_round_id', id)
      .order('created_at'),
    supabase
      .from('planting_records')
      .select(`
        id, site_id, contractor_id, species_id, spec_code_id, quantity_planted,
        sites ( site_name, site_code ),
        contractors ( contractor_name ),
        species ( species_name_ko ),
        spec_codes ( spec_label_raw )
      `)
      .eq('site_id', site?.id ?? '')
      .order('created_at'),
  ])

  const totalInspected = (items ?? []).reduce((s, i) => s + i.quantity_inspected, 0)
  const totalDefect = (items ?? []).reduce((s, i) => s + i.defect_quantity, 0)
  const overallRate = totalInspected > 0 ? totalDefect / totalInspected : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/inspections"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          점검 목록
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {round.inspection_name ?? '점검 상세'}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{site?.site_name} ({site?.site_code})</span>
            <span>·</span>
            <span>{round.inspection_date}</span>
            {round.season_code && (
              <Badge variant="secondary">{seasonLabel[round.season_code]}</Badge>
            )}
            {round.inspection_basis_type && (
              <span>기준: {basisLabel[round.inspection_basis_type]}</span>
            )}
            {round.performed_by && <span>점검자: {round.performed_by}</span>}
          </div>
        </div>
        <AddItemDialog
          roundId={id}
          siteId={site?.id ?? ''}
          plantingRecords={(plantingRecords ?? []).map((r) => ({
            ...r,
            sites: Array.isArray(r.sites) ? r.sites[0] : r.sites,
            contractors: Array.isArray(r.contractors) ? r.contractors[0] : r.contractors,
            species: Array.isArray(r.species) ? r.species[0] : r.species,
            spec_codes: Array.isArray(r.spec_codes) ? r.spec_codes[0] : r.spec_codes,
          }))}
        />
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 점검수량</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalInspected > 0 ? totalInspected.toLocaleString() : '-'}</p>
            <p className="text-xs text-muted-foreground">{totalInspected > 0 ? '주' : '항목 없음'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 하자수량</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalDefect > 0 ? totalDefect.toLocaleString() : '-'}</p>
            <p className="text-xs text-muted-foreground">{totalDefect > 0 ? '주' : '없음'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">전체 하자율</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${overallRate !== null && overallRate >= 0.35 ? 'text-destructive' : ''}`}>
              {overallRate !== null ? `${(overallRate * 100).toFixed(1)}%` : '-'}
            </p>
            {overallRate !== null && overallRate >= 0.35 && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> 고위험 (35% 이상)
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 항목 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            점검 항목
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              총 {items?.length ?? 0}건
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items && items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>수종</TableHead>
                  <TableHead>규격</TableHead>
                  <TableHead>시공사</TableHead>
                  <TableHead className="text-right">점검수량</TableHead>
                  <TableHead className="text-right">하자수량</TableHead>
                  <TableHead className="text-right">하자율</TableHead>
                  <TableHead>비고</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const sp = Array.isArray(item.species) ? item.species[0] : item.species
                  const sc = Array.isArray(item.spec_codes) ? item.spec_codes[0] : item.spec_codes
                  const con = Array.isArray(item.contractors) ? item.contractors[0] : item.contractors
                  const rate = item.defect_rate_cached ?? 0
                  const isHighRisk = rate >= 0.35

                  return (
                    <TableRow key={item.id}>
                      <TableCell>{sp?.species_name_ko ?? '-'}</TableCell>
                      <TableCell>{sc?.spec_label_raw ?? '-'}</TableCell>
                      <TableCell>{con?.contractor_name ?? '-'}</TableCell>
                      <TableCell className="text-right">{item.quantity_inspected.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{item.defect_quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className={isHighRisk ? 'text-destructive font-semibold' : ''}>
                          {(rate * 100).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{item.notes ?? '-'}</TableCell>
                      <TableCell>
                        <DeleteItemButton id={item.id} roundId={id} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-sm">등록된 점검 항목이 없습니다.</p>
              <p className="text-xs mt-1">우측 상단 &apos;항목 추가&apos; 버튼으로 추가하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
