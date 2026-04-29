'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type UploadResult = {
  success: boolean
  totalRows: number
  successCount: number
  failCount: number
  errors: string[]
}

type PlantingRow = {
  현장코드?: string
  시공사코드?: string
  수종코드?: string
  규격?: string
  수량?: number
  식재일?: string
  준공기산일?: string
}

type InspectionRow = {
  현장코드?: string
  점검명?: string
  점검일?: string
  계절?: string
  수종코드?: string
  규격?: string
  시공사코드?: string
  점검수량?: number
  하자수량?: number
  비고?: string
}

const seasonMap: Record<string, string> = {
  봄: 'spring', 여름: 'summer', 가을: 'fall', 겨울: 'winter',
}

// 엑셀 날짜 시리얼 → YYYY-MM-DD 변환
function excelDateToString(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') {
    const s = val.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return null
  }
  if (typeof val === 'number') {
    // 엑셀 시리얼: 1900-01-01 = 1 (윤년 버그 보정 포함)
    const ms = (val - 25569) * 86400 * 1000
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

export async function uploadPlantingRecords(rows: PlantingRow[]): Promise<UploadResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, totalRows: 0, successCount: 0, failCount: 0, errors: ['인증이 필요합니다.'] }

  const errors: string[] = []
  let successCount = 0

  // 참조 테이블 사전 로드
  const [{ data: sites }, { data: contractors }, { data: species }, { data: specCodes }] = await Promise.all([
    supabase.from('sites').select('id, site_code, organization_id'),
    supabase.from('contractors').select('id, contractor_code'),
    supabase.from('species').select('id, species_code'),
    supabase.from('spec_codes').select('id, spec_label_raw'),
  ])

  const siteMap = new Map(sites?.map((s) => [s.site_code, s]) ?? [])
  const contractorMap = new Map(contractors?.map((c) => [c.contractor_code, c.id]) ?? [])
  const speciesMap = new Map(species?.map((s) => [s.species_code, s.id]) ?? [])
  const specCodeMap = new Map(specCodes?.map((s) => [s.spec_label_raw, s.id]) ?? [])

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // 엑셀 행 번호 (헤더=1행)

    const site_code = String(row.현장코드 ?? '').trim()
    const contractor_code = String(row.시공사코드 ?? '').trim()
    const species_code = String(row.수종코드 ?? '').trim()
    const spec_label = String(row.규격 ?? '').trim()
    const quantity = Number(row.수량)

    if (!site_code || !contractor_code || !species_code || !spec_label || !quantity) {
      errors.push(`${rowNum}행: 현장코드, 시공사코드, 수종코드, 규격, 수량은 필수입니다.`)
      continue
    }

    const site = siteMap.get(site_code)
    if (!site) { errors.push(`${rowNum}행: 현장코드 '${site_code}'를 찾을 수 없습니다.`); continue }

    const contractor_id = contractorMap.get(contractor_code)
    if (!contractor_id) { errors.push(`${rowNum}행: 시공사코드 '${contractor_code}'를 찾을 수 없습니다.`); continue }

    const species_id = speciesMap.get(species_code)
    if (!species_id) { errors.push(`${rowNum}행: 수종코드 '${species_code}'를 찾을 수 없습니다.`); continue }

    let spec_code_id = specCodeMap.get(spec_label)
    if (!spec_code_id) {
      // spec_codes에 없으면 자동 생성
      const { data: newSpec } = await supabase
        .from('spec_codes')
        .insert({ spec_label_raw: spec_label })
        .select('id')
        .single()
      if (newSpec) {
        spec_code_id = newSpec.id
        specCodeMap.set(spec_label, newSpec.id)
      } else {
        errors.push(`${rowNum}행: 규격 '${spec_label}' 생성에 실패했습니다.`)
        continue
      }
    }

    const planting_date = row.식재일 ? String(row.식재일).trim() : null
    const occupancy_basis_date = row.준공기산일 ? String(row.준공기산일).trim() : null

    const { error } = await supabase.from('planting_records').insert({
      organization_id: site.organization_id,
      site_id: site.id,
      contractor_id,
      species_id,
      spec_code_id,
      quantity_planted: quantity,
      planting_date: planting_date || null,
      occupancy_basis_date: occupancy_basis_date || null,
      source_type: 'excel_import',
    })

    if (error) {
      errors.push(`${rowNum}행: ${error.message}`)
    } else {
      successCount++
    }
  }

  await supabase.from('upload_logs').insert({
    uploaded_by: user.id,
    file_name: '식재기록_업로드',
    upload_type: '식재기록',
    row_count: rows.length,
    status: errors.length === 0 ? 'success' : successCount > 0 ? 'partial' : 'failed',
    error_message: errors.length > 0 ? errors.slice(0, 10).join('\n') : null,
  })

  revalidatePath('/plantings')
  revalidatePath('/settings')

  return {
    success: successCount > 0,
    totalRows: rows.length,
    successCount,
    failCount: errors.length,
    errors: errors.slice(0, 20),
  }
}

export async function uploadInspectionResults(rows: InspectionRow[]): Promise<UploadResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, totalRows: 0, successCount: 0, failCount: 0, errors: ['인증이 필요합니다.'] }

  const errors: string[] = []
  let successCount = 0

  const [{ data: sites }, { data: contractors }, { data: species }, { data: specCodes }] = await Promise.all([
    supabase.from('sites').select('id, site_code, organization_id'),
    supabase.from('contractors').select('id, contractor_code, contractor_name'),
    supabase.from('species').select('id, species_code, species_name_ko'),
    supabase.from('spec_codes').select('id, spec_label_raw'),
  ])

  const siteMap = new Map(sites?.map((s) => [s.site_code, s]) ?? [])
  const contractorMap = new Map(contractors?.map((c) => [c.contractor_code, c.id]) ?? [])
  const contractorNameMap = new Map(contractors?.map((c) => [c.contractor_name, c.id]) ?? [])
  // 수종: 코드와 한글명 둘 다 조회 가능
  const speciesMap = new Map(species?.map((s) => [s.species_code, s.id]) ?? [])
  const speciesNameMap = new Map(species?.map((s) => [s.species_name_ko, s.id]) ?? [])
  const specCodeMap = new Map(specCodes?.map((s) => [s.spec_label_raw, s.id]) ?? [])

  // 점검 회차 캐시 (현장코드+점검일+점검명 → round_id)
  const roundCache = new Map<string, string>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2

    const site_code = String(row.현장코드 ?? '').trim()
    const inspection_date = excelDateToString(row.점검일)
    const species_key = String(row.수종코드 ?? '').trim()
    const spec_label = String(row.규격 ?? '').trim()
    const contractor_key = String(row.시공사코드 ?? '').trim()
    const quantity_inspected = Number(row.점검수량 ?? 0)
    const defect_quantity = Number(row.하자수량 ?? 0)

    if (!site_code || !inspection_date || !species_key || !spec_label || !contractor_key) {
      errors.push(`${rowNum}행: 현장코드, 점검일, 수종코드, 규격, 시공사코드는 필수입니다.`)
      continue
    }

    const site = siteMap.get(site_code)
    if (!site) { errors.push(`${rowNum}행: 현장코드 '${site_code}'를 찾을 수 없습니다.`); continue }

    // 시공사: 코드 또는 이름으로 조회
    const contractor_id = contractorMap.get(contractor_key) ?? contractorNameMap.get(contractor_key)
    if (!contractor_id) { errors.push(`${rowNum}행: 시공사코드/이름 '${contractor_key}'를 찾을 수 없습니다.`); continue }

    // 수종: 코드 또는 한글명으로 조회
    const species_id = speciesMap.get(species_key) ?? speciesNameMap.get(species_key)
    if (!species_id) { errors.push(`${rowNum}행: 수종코드/이름 '${species_key}'를 찾을 수 없습니다.`); continue }

    let spec_code_id = specCodeMap.get(spec_label)
    if (!spec_code_id) {
      const { data: newSpec } = await supabase
        .from('spec_codes')
        .insert({ spec_label_raw: spec_label })
        .select('id')
        .single()
      if (newSpec) {
        spec_code_id = newSpec.id
        specCodeMap.set(spec_label, newSpec.id)
      } else {
        errors.push(`${rowNum}행: 규격 '${spec_label}' 생성에 실패했습니다.`)
        continue
      }
    }

    // 점검 회차 찾기 또는 생성
    const inspection_name = String(row.점검명 ?? '').trim() || null
    const roundKey = `${site_code}__${inspection_date ?? ''}__${inspection_name ?? ''}`
    let round_id = roundCache.get(roundKey)

    if (!round_id) {
      // DB에서 동일 회차 조회
      const { data: existing } = await supabase
        .from('inspection_rounds')
        .select('id')
        .eq('site_id', site.id)
        .eq('inspection_date', inspection_date)
        .eq('inspection_name', inspection_name ?? '')
        .maybeSingle()

      if (existing) {
        round_id = existing.id
      } else {
        const season_code = row.계절 ? seasonMap[String(row.계절).trim()] ?? null : null
        const { data: newRound } = await supabase
          .from('inspection_rounds')
          .insert({
            organization_id: site.organization_id,
            site_id: site.id,
            inspection_name,
            inspection_date,
            season_code,
          })
          .select('id')
          .single()

        if (!newRound) {
          errors.push(`${rowNum}행: 점검 회차 생성에 실패했습니다.`)
          continue
        }
        round_id = newRound.id
      }
      roundCache.set(roundKey, round_id!)
    }

    if (defect_quantity > quantity_inspected) {
      errors.push(`${rowNum}행: 하자수량(${defect_quantity})이 점검수량(${quantity_inspected})을 초과합니다.`)
      continue
    }

    const { error } = await supabase.from('inspection_items').upsert(
      {
        inspection_round_id: round_id,
        site_id: site.id,
        contractor_id,
        species_id,
        spec_code_id,
        quantity_inspected,
        defect_quantity,
        notes: row.비고 ? String(row.비고).trim() : null,
      },
      {
        onConflict: 'inspection_round_id,planting_record_id,species_id,spec_code_id',
        ignoreDuplicates: false,
      }
    )

    if (error) {
      errors.push(`${rowNum}행: ${error.message}`)
    } else {
      successCount++
    }
  }

  await supabase.from('upload_logs').insert({
    uploaded_by: user.id,
    file_name: '점검결과_업로드',
    upload_type: '점검결과',
    row_count: rows.length,
    status: errors.length === 0 ? 'success' : successCount > 0 ? 'partial' : 'failed',
    error_message: errors.length > 0 ? errors.slice(0, 10).join('\n') : null,
  })

  revalidatePath('/inspections')
  revalidatePath('/settings')

  return {
    success: successCount > 0,
    totalRows: rows.length,
    successCount,
    failCount: errors.length,
    errors: errors.slice(0, 20),
  }
}
