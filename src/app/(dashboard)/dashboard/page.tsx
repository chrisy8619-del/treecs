import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient, type SiteOption, type PlantingRow } from './dashboard-client'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 현장 목록 — 승인된(active/closed) 현장만 표시, pending은 설정>현장승인 탭에서 처리
  const { data: sitesRaw } = await supabase
    .from('sites')
    .select('id, site_name, site_code, region, occupancy_date, start_date, organizations(name)')
    .in('status', ['active', 'closed'])
    .order('created_at', { ascending: false })

  const sites: SiteOption[] = (sitesRaw ?? []).map((s) => {
    const org = Array.isArray(s.organizations) ? s.organizations[0] : s.organizations
    return {
      id: s.id,
      site_name: s.site_name,
      site_code: s.site_code,
      region: s.region ?? null,
      occupancy_date: s.occupancy_date ?? null,
      start_date: s.start_date ?? null,
      org_name: (org as { name: string } | null)?.name ?? null,
    }
  })

  // 모든 현장의 planting_records (하자율 예측 데이터)
  // source_type이 'excel_import'이거나 unit_price/expected_defect_rate 가 있는 데이터를 우선
  const { data: plantingsRaw } = await supabase
    .from('planting_records')
    .select(`
      id,
      site_id,
      quantity_planted,
      unit_price,
      expected_defect_rate,
      expected_defect_qty,
      expected_reserve_cost,
      risk_level,
      notes,
      contractors ( contractor_name ),
      species ( species_name_ko ),
      spec_codes ( height_m, width_m, rootball_r, caliper )
    `)
    .order('created_at', { ascending: true })

  const allPlantings: PlantingRow[] = (plantingsRaw ?? []).map((r) => {
    const contractor = Array.isArray(r.contractors) ? r.contractors[0] : r.contractors
    const species = Array.isArray(r.species) ? r.species[0] : r.species
    const spec = Array.isArray(r.spec_codes) ? r.spec_codes[0] : r.spec_codes

    return {
      id: r.id,
      site_id: r.site_id,
      quantity_planted: r.quantity_planted,
      unit_price: r.unit_price != null ? Number(r.unit_price) : null,
      expected_defect_rate: r.expected_defect_rate != null ? Number(r.expected_defect_rate) : null,
      expected_defect_qty: r.expected_defect_qty ?? null,
      expected_reserve_cost: r.expected_reserve_cost != null ? Number(r.expected_reserve_cost) : null,
      risk_level: r.risk_level ?? null,
      notes: r.notes ?? null,
      contractor_name: (contractor as { contractor_name: string } | null)?.contractor_name ?? null,
      species_name: (species as { species_name_ko: string } | null)?.species_name_ko ?? null,
      height_m: (spec as { height_m?: number } | null)?.height_m ?? null,
      width_m: (spec as { width_m?: number } | null)?.width_m ?? null,
      rootball_r: (spec as { rootball_r?: number } | null)?.rootball_r ?? null,
      caliper: (spec as { caliper?: number } | null)?.caliper ?? null,
    }
  })

  return <DashboardClient sites={sites} allPlantings={allPlantings} />
}
