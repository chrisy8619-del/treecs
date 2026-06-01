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

// 하자율 예측 분석 엑셀 행 타입
// 헤더: 현장코드, 현장명, 준공일, 식재시기, 시공사, 협력사, 지역,
//        수종명, 수량, 수고H, 수관폭W, 흉고직경B, 근원직경R,
//        단가, 예상하자율, 비고
export type DefectAnalysisRow = {
  현장코드?: string
  현장명?: string
  준공일?: string | number
  식재시기?: string | number
  시공사?: string
  협력사?: string
  지역?: string
  수종명?: string
  수량?: number
  수고H?: number
  수관폭W?: number
  흉고직경B?: number
  근원직경R?: number
  단가?: number
  예상하자율?: number   // 0~100 사이 정수 or 0~1 소수 둘 다 허용
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
    // YYYY.MM 형식 (준공일/식재시기)
    if (/^\d{4}\.\d{2}$/.test(s)) return `${s.replace('.', '-')}-01`
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    return null
  }
  if (typeof val === 'number') {
    // YYYY.MM 숫자 형태 (예: 2022.12)
    if (val > 1900 && val < 2200 && String(val).includes('.')) {
      const [y, m] = String(val).split('.')
      return `${y}-${m.padStart(2, '0')}-01`
    }
    // 엑셀 시리얼
    const ms = (val - 25569) * 86400 * 1000
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

// 식재일 → 계절 코드 변환
function dateToSeasonCode(dateStr: string | null): string | null {
  if (!dateStr) return null
  const month = parseInt(dateStr.slice(5, 7), 10)
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'fall'
  return 'winter'
}

export async function uploadPlantingRecords(rows: PlantingRow[]): Promise<UploadResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, totalRows: 0, successCount: 0, failCount: 0, errors: ['인증이 필요합니다.'] }

  const errors: string[] = []
  let successCount = 0

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
    const rowNum = i + 2

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
  const speciesMap = new Map(species?.map((s) => [s.species_code, s.id]) ?? [])
  const speciesNameMap = new Map(species?.map((s) => [s.species_name_ko, s.id]) ?? [])
  const specCodeMap = new Map(specCodes?.map((s) => [s.spec_label_raw, s.id]) ?? [])

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

    const contractor_id = contractorMap.get(contractor_key) ?? contractorNameMap.get(contractor_key)
    if (!contractor_id) { errors.push(`${rowNum}행: 시공사코드/이름 '${contractor_key}'를 찾을 수 없습니다.`); continue }

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

    const inspection_name = String(row.점검명 ?? '').trim() || null
    const roundKey = `${site_code}__${inspection_date ?? ''}__${inspection_name ?? ''}`
    let round_id = roundCache.get(roundKey)

    if (!round_id) {
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

/**
 * 하자율 예측 분석 엑셀 업로드
 * - 현장코드 기준으로 sites 조회
 * - 수종명으로 species 조회 (없으면 자동 생성)
 * - H/W/B/R 조합으로 spec_codes 조회 (없으면 자동 생성)
 * - 단가, 예상하자율 저장 → DB 트리거가 예비비·리스크등급 자동 계산
 */
export async function uploadDefectAnalysis(
  headerInfo: {
    site_code: string
    site_name: string
    completion_date: string | number | null
    planting_date: string | number | null
    contractor_name: string
    region: string
  },
  rows: DefectAnalysisRow[]
): Promise<UploadResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, totalRows: 0, successCount: 0, failCount: 0, errors: ['인증이 필요합니다.'] }

  const errors: string[] = []
  let successCount = 0

  // 현장 조회
  const { data: site } = await supabase
    .from('sites')
    .select('id, organization_id, site_name')
    .eq('site_code', headerInfo.site_code.trim())
    .maybeSingle()

  if (!site) {
    return {
      success: false,
      totalRows: rows.length,
      successCount: 0,
      failCount: rows.length,
      errors: [`현장코드 '${headerInfo.site_code}'를 찾을 수 없습니다. 먼저 현장을 등록하세요.`],
    }
  }

  // 시공사 조회 (이름으로)
  const { data: contractorList } = await supabase
    .from('contractors')
    .select('id, contractor_name')
    .eq('organization_id', site.organization_id)

  const contractorNameMap = new Map(contractorList?.map((c) => [c.contractor_name, c.id]) ?? [])
  let contractor_id = contractorNameMap.get(headerInfo.contractor_name.trim())

  // 시공사 없으면 자동 생성
  if (!contractor_id && headerInfo.contractor_name.trim()) {
    const code = `AUTO_${Date.now()}`
    const { data: newC } = await supabase
      .from('contractors')
      .insert({
        organization_id: site.organization_id,
        contractor_name: headerInfo.contractor_name.trim(),
        contractor_code: code,
      })
      .select('id')
      .single()
    contractor_id = newC?.id
  }

  if (!contractor_id) {
    errors.push('시공사를 찾거나 생성할 수 없습니다.')
  }

  // 수종 목록 로드
  const { data: speciesList } = await supabase
    .from('species')
    .select('id, species_name_ko')
    .eq('is_active', true)

  const speciesNameMap = new Map(speciesList?.map((s) => [s.species_name_ko, s.id]) ?? [])

  // spec_codes 목록 로드
  const { data: specCodes } = await supabase.from('spec_codes').select('id, spec_label_raw')
  const specCodeMap = new Map(specCodes?.map((s) => [s.spec_label_raw, s.id]) ?? [])

  const planting_date_str = excelDateToString(headerInfo.planting_date)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1

    const species_name = String(row.수종명 ?? '').trim()
    const quantity = Number(row.수량 ?? 0)

    if (!species_name || !quantity) {
      errors.push(`${rowNum}행: 수종명과 수량은 필수입니다.`)
      continue
    }

    // 수종 조회 또는 자동 생성
    let species_id = speciesNameMap.get(species_name)
    if (!species_id) {
      const code = `AUTO_${species_name.slice(0, 4).replace(/\s/g, '_')}_${Date.now() % 10000}`
      const { data: newSp } = await supabase
        .from('species')
        .insert({ species_name_ko: species_name, species_code: code })
        .select('id')
        .single()
      if (newSp) {
        species_id = newSp.id
        speciesNameMap.set(species_name, newSp.id)
      } else {
        errors.push(`${rowNum}행: 수종 '${species_name}' 생성에 실패했습니다.`)
        continue
      }
    }

    // 규격 레이블 생성 (H·W·B·R 조합)
    const parts: string[] = []
    if (row.수고H) parts.push(`H${row.수고H}`)
    if (row.수관폭W) parts.push(`W${row.수관폭W}`)
    if (row.흉고직경B) parts.push(`B${row.흉고직경B}`)
    if (row.근원직경R) parts.push(`R${row.근원직경R}`)
    const spec_label = parts.length > 0 ? parts.join('×') : '규격미상'

    let spec_code_id = specCodeMap.get(spec_label)
    if (!spec_code_id) {
      const { data: newSpec } = await supabase
        .from('spec_codes')
        .insert({
          spec_label_raw: spec_label,
          height_m: row.수고H ?? null,
          width_m: row.수관폭W ?? null,
          rootball_r: row.근원직경R ?? null,
          caliper: row.흉고직경B ?? null,
        })
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

    // 예상 하자율 정규화 (100% 단위 → 소수 변환)
    let defect_rate: number | null = null
    if (row.예상하자율 != null) {
      const raw = Number(row.예상하자율)
      defect_rate = raw > 1 ? raw / 100 : raw
    }

    const unit_price = row.단가 ? Number(row.단가) : null

    const { error } = await supabase.from('planting_records').insert({
      organization_id: site.organization_id,
      site_id: site.id,
      contractor_id: contractor_id!,
      species_id,
      spec_code_id,
      quantity_planted: quantity,
      planting_date: planting_date_str || null,
      unit_price,
      expected_defect_rate: defect_rate,
      source_type: 'excel_import',
      notes: row.비고 ? String(row.비고).trim() : null,
    })

    if (error) {
      errors.push(`${rowNum}행 (${species_name}): ${error.message}`)
    } else {
      successCount++
    }
  }

  await supabase.from('upload_logs').insert({
    uploaded_by: user.id,
    file_name: `하자율예측_${headerInfo.site_name || headerInfo.site_code}`,
    upload_type: '하자율예측',
    row_count: rows.length,
    status: errors.length === 0 ? 'success' : successCount > 0 ? 'partial' : 'failed',
    error_message: errors.length > 0 ? errors.slice(0, 10).join('\n') : null,
  })

  revalidatePath('/analytics')
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

export { dateToSeasonCode }
