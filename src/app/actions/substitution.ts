'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'

// 'use server' 파일은 async 함수만 export 가능하므로 타입은 내부 전용으로 둔다.
type SubstitutionUploadResult = {
  success: boolean
  successCount: number
  failCount: number
  errors: string[]
}

export async function uploadSubstitutions(
  fileBase64: string
): Promise<SubstitutionUploadResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, successCount: 0, failCount: 0, errors: ['인증이 필요합니다.'] }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()
  let org_id = profile?.organization_id
  if (!org_id) {
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1).maybeSingle()
    org_id = orgs?.id
  }
  if (!org_id) return { success: false, successCount: 0, failCount: 0, errors: ['조직 정보를 찾을 수 없습니다.'] }

  const binary = atob(fileBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const wb = XLSX.read(bytes, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null })

  const { data: speciesList } = await supabase
    .from('species')
    .select('id, species_name_ko')
    .eq('is_active', true)
  const speciesMap = new Map(speciesList?.map((s) => [s.species_name_ko, s.id]) ?? [])

  const errors: string[] = []
  let successCount = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2
    const originalName = String(row['원수종명'] ?? '').trim()
    const substituteName = String(row['대체수종명'] ?? '').trim()
    const rateRaw = row['개선하자율(%)']
    const improvedRate = rateRaw != null ? Number(rateRaw) / 100 : NaN

    if (!originalName || !substituteName) {
      errors.push(`${rowNum}행: 원수종명, 대체수종명은 필수입니다.`)
      continue
    }
    if (isNaN(improvedRate) || improvedRate < 0 || improvedRate > 1) {
      errors.push(`${rowNum}행: 개선하자율(%)이 올바르지 않습니다.`)
      continue
    }

    for (const name of [originalName, substituteName]) {
      if (!speciesMap.has(name)) {
        const code = `AUTO_${name.slice(0, 4).replace(/\s/g, '_')}_${Date.now() % 10000}`
        const { data: newSp } = await supabase
          .from('species')
          .insert({ species_name_ko: name, species_code: code })
          .select('id')
          .single()
        if (newSp) speciesMap.set(name, newSp.id)
      }
    }

    const original_id = speciesMap.get(originalName)
    const substitute_id = speciesMap.get(substituteName)
    if (!original_id || !substitute_id) {
      errors.push(`${rowNum}행: 수종 생성 실패`)
      continue
    }

    const { error } = await supabase
      .from('species_substitutions')
      .upsert(
        {
          organization_id: org_id,
          original_species_id: original_id,
          substitute_species_id: substitute_id,
          improved_defect_rate: improvedRate,
        },
        { onConflict: 'organization_id,original_species_id,substitute_species_id' }
      )

    if (error) errors.push(`${rowNum}행: ${error.message}`)
    else successCount++
  }

  revalidatePath('/simulation')
  return { success: successCount > 0, successCount, failCount: errors.length, errors }
}
