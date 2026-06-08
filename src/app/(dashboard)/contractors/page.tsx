import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateContractorDialog } from './create-contractor-dialog'
import { ContractorTabs } from './contractor-tabs'
import type { ContractorStat } from './contractor-stats-tab'

export default async function ContractorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: contractors }, { data: organizations }, { data: profile }, { data: plantingData }] =
    await Promise.all([
      supabase
        .from('contractors')
        .select('id, contractor_name, contractor_code, contact_name, contact_phone, is_active, organizations(name)')
        .order('contractor_name'),
      supabase
        .from('organizations')
        .select('id, name, code')
        .order('name'),
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase
        .from('planting_records')
        .select('site_id, quantity_planted, expected_defect_qty, contractor_id, contractors(id, contractor_name)')
        .not('expected_defect_qty', 'is', null),
    ])

  const isSuperadmin = profile?.role === 'superadmin'
  const currentYear = new Date().getFullYear()

  // 협력사별 집계 → ContractorStat[]
  type AggValue = { name: string; siteIds: Set<string>; totalQty: number; totalDefectQty: number }
  const aggMap = new Map<string, AggValue>()

  for (const row of plantingData ?? []) {
    const ct = Array.isArray(row.contractors) ? row.contractors[0] : row.contractors
    const id = (ct as { id: string; contractor_name: string } | null)?.id
    const name = (ct as { id: string; contractor_name: string } | null)?.contractor_name
    if (!id || !name) continue

    const prev = aggMap.get(id) ?? { name, siteIds: new Set<string>(), totalQty: 0, totalDefectQty: 0 }
    if (row.site_id) prev.siteIds.add(row.site_id)
    aggMap.set(id, {
      name,
      siteIds: prev.siteIds,
      totalQty: prev.totalQty + (row.quantity_planted ?? 0),
      totalDefectQty: prev.totalDefectQty + (row.expected_defect_qty ?? 0),
    })
  }

  const stats: ContractorStat[] = Array.from(aggMap.entries())
    .filter(([, v]) => v.totalQty > 0)
    .map(([id, v]) => ({
      id,
      name: v.name,
      siteCount: v.siteIds.size,
      defectRate: v.totalDefectQty / v.totalQty,
    }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">협력사 관리</h2>
          <p className="text-muted-foreground">시공사 현황 및 마스터 데이터를 관리합니다.</p>
        </div>
        <CreateContractorDialog organizations={organizations ?? []} />
      </div>

      <ContractorTabs
        contractors={contractors ?? []}
        stats={stats}
        isSuperadmin={isSuperadmin}
        year={currentYear}
      />
    </div>
  )
}
