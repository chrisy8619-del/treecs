import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SpeciesTabs } from './species-tabs'
import type { SpeciesStat } from './species-stats-tab'
import type { AltSpeciesRec, SpeciesStatForFinder } from './species-finder-tab'

export default async function SpeciesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: species }, { data: groups }, { data: profile }, { data: plantingData }, { data: altRecsRaw }] =
    await Promise.all([
      supabase
        .from('species')
        .select('id, species_name_ko, species_name_en, species_code, scientific_name, is_active, species_groups(group_name)')
        .order('species_name_ko'),
      supabase
        .from('species_groups')
        .select('id, group_name, group_code')
        .order('group_name'),
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase
        .from('planting_records')
        .select('quantity_planted, expected_defect_qty, species(species_name_ko, species_groups(group_name))')
        .not('expected_defect_qty', 'is', null),
      supabase
        .from('alternative_species_recommendations')
        .select('species_name, region, season, substitute1, substitute2, substitute3'),
    ])

  const isSuperadmin = profile?.role === 'superadmin'

  // 수종별 집계 → SpeciesStat[]
  type PlantingSpecies = { species_name_ko: string; species_groups: { group_name: string }[] | { group_name: string } | null } | null
  const aggMap = new Map<string, { groupName: string | null; totalQty: number; totalDefectQty: number }>()
  for (const row of plantingData ?? []) {
    const sp = (Array.isArray(row.species) ? row.species[0] : row.species) as unknown as PlantingSpecies
    const name = sp?.species_name_ko
    if (!name) continue
    const groupRaw = sp?.species_groups
    const groupName = Array.isArray(groupRaw) ? (groupRaw[0]?.group_name ?? null) : (groupRaw?.group_name ?? null)
    const prev = aggMap.get(name) ?? { groupName, totalQty: 0, totalDefectQty: 0 }
    aggMap.set(name, {
      groupName: prev.groupName ?? groupName,
      totalQty: prev.totalQty + (row.quantity_planted ?? 0),
      totalDefectQty: prev.totalDefectQty + (row.expected_defect_qty ?? 0),
    })
  }

  const stats: SpeciesStat[] = Array.from(aggMap.entries())
    .filter(([, v]) => v.totalQty > 0)
    .map(([speciesNameKo, v]) => ({
      speciesNameKo,
      groupName: v.groupName,
      totalQty: v.totalQty,
      totalDefectQty: v.totalDefectQty,
      defectRate: v.totalDefectQty / v.totalQty,
    }))

  const altRecs: AltSpeciesRec[] = (altRecsRaw ?? []).map((r) => ({
    species_name: r.species_name,
    region: r.region,
    season: r.season,
    substitute1: r.substitute1 ?? null,
    substitute2: r.substitute2 ?? null,
    substitute3: r.substitute3 ?? null,
  }))

  const speciesStatsForFinder: SpeciesStatForFinder[] = stats.map((s) => ({
    speciesNameKo: s.speciesNameKo,
    groupName: s.groupName,
    totalQty: s.totalQty,
    defectRate: s.defectRate,
  }))

  return (
    <SpeciesTabs
      species={species ?? []}
      stats={stats}
      isSuperadmin={isSuperadmin}
      altRecs={altRecs}
      speciesStatsForFinder={speciesStatsForFinder}
      groups={groups ?? []}
    />
  )
}
