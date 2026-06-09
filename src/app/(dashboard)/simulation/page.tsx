import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SimulationClient, type SiteOption, type SubstitutionMap, type AltSpeciesRec } from './simulation-client'

export const dynamic = 'force-dynamic'

export default async function SimulationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: sitesRaw }, { data: subsRaw }, { data: plantingAvgRaw }, { data: altRecsRaw }] = await Promise.all([
    supabase
      .from('sites')
      .select('id, site_name, site_code, region, occupancy_date, organizations(name)')
      .in('status', ['active', 'closed'])
      .order('created_at', { ascending: false }),
    supabase
      .from('species_substitutions')
      .select(`
        original_species_id,
        substitute_species_id,
        improved_defect_rate,
        original:original_species_id ( species_name_ko ),
        substitute:substitute_species_id ( species_name_ko )
      `),
    supabase
      .from('planting_records')
      .select('quantity_planted, expected_defect_qty, species ( species_name_ko )')
      .not('expected_defect_qty', 'is', null),
    supabase
      .from('alternative_species_recommendations')
      .select('species_name, region, season, substitute1, substitute2, substitute3'),
  ])

  const sites: SiteOption[] = (sitesRaw ?? []).map((s) => {
    const org = Array.isArray(s.organizations) ? s.organizations[0] : s.organizations
    return {
      id: s.id,
      site_name: s.site_name,
      site_code: s.site_code,
      region: s.region ?? null,
      occupancy_date: s.occupancy_date ?? null,
      org_name: (org as { name: string } | null)?.name ?? null,
    }
  })

  const substitutions: SubstitutionMap[] = (subsRaw ?? []).map((s) => {
    const original = Array.isArray(s.original) ? s.original[0] : s.original
    const substitute = Array.isArray(s.substitute) ? s.substitute[0] : s.substitute
    return {
      original_species_name: (original as { species_name_ko: string } | null)?.species_name_ko ?? '',
      substitute_species_name: (substitute as { species_name_ko: string } | null)?.species_name_ko ?? '',
      improved_defect_rate: Number(s.improved_defect_rate),
    }
  }).filter((s) => s.original_species_name && s.substitute_species_name)

  // 전체 데이터 기준 수종별 평균 하자율: SUM(하자수량)/SUM(수량) per 수종명
  const aggMap = new Map<string, { qty: number; defect: number }>()
  for (const row of plantingAvgRaw ?? []) {
    const speciesArr = row.species
    const species = Array.isArray(speciesArr) ? speciesArr[0] : speciesArr
    const name = (species as { species_name_ko: string } | null)?.species_name_ko
    if (!name) continue
    const prev = aggMap.get(name) ?? { qty: 0, defect: 0 }
    aggMap.set(name, {
      qty: prev.qty + (row.quantity_planted ?? 0),
      defect: prev.defect + (row.expected_defect_qty ?? 0),
    })
  }
  const speciesAvgRate: Record<string, number> = {}
  for (const [name, v] of aggMap) {
    speciesAvgRate[name] = v.qty > 0 ? v.defect / v.qty : 0
  }

  const altRecs: AltSpeciesRec[] = (altRecsRaw ?? []).map((r) => ({
    species_name: r.species_name,
    region: r.region,
    season: r.season,
    substitute1: r.substitute1 ?? null,
    substitute2: r.substitute2 ?? null,
    substitute3: r.substitute3 ?? null,
  }))

  return <SimulationClient sites={sites} substitutions={substitutions} speciesAvgRate={speciesAvgRate} altRecs={altRecs} />
}
