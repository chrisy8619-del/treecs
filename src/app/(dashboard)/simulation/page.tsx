import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SimulationClient, type SiteOption, type SubstitutionMap } from './simulation-client'

export const dynamic = 'force-dynamic'

export default async function SimulationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: sitesRaw }, { data: subsRaw }] = await Promise.all([
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

  return <SimulationClient sites={sites} substitutions={substitutions} />
}
