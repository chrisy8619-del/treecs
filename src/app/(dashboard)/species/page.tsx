import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { CreateSpeciesDialog } from './create-species-dialog'
import { SpeciesTabs } from './species-tabs'
import type { SpeciesStat } from './species-stats-tab'

export default async function SpeciesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: species }, { data: groups }, { data: profile }, { data: plantingData }] =
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

  return (
    <div className="space-y-0 -m-6">
      {/* 상단 헤더 */}
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">수종 관리</h1>
            <p className="text-xs text-green-200 mt-0.5">수목 수종 마스터 데이터 및 리스크 현황을 관리합니다.</p>
          </div>
        </div>
        <CreateSpeciesDialog groups={groups ?? []} />
      </div>

      <div className="px-6 py-5 space-y-6">
        <SpeciesTabs
          species={species ?? []}
          stats={stats}
          isSuperadmin={isSuperadmin}
        />
      </div>
    </div>
  )
}
