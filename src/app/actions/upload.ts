'use server'
/**
 * 엑셀 데이터 일괄 업로드 서버 액션(식재/점검/하자율예측 3종).
 *
 * 호출 주체 : settings/upload-tab.tsx(설정>업로드 탭). 클라이언트가 xlsx로 파싱한
 *             행 배열을 배치 단위로 이 액션들에 전달한다.
 * 반환/전송 : sites·species·contractors·spec_codes·planting_records·inspection_items·
 *             upload_logs 테이블에 insert/upsert. 완료 후 관련 화면을 revalidate.
 *             - uploadPlantingRecords : revalidatePath('/plantings','/settings')
 *             - uploadInspectionResults: revalidatePath('/inspections','/settings')
 *             - uploadDefectAnalysisBatch: revalidatePath('/analytics','/plantings','/settings','/dashboard')
 *             반환은 UploadResult({ successCount, failCount, errors[] }).
 * 의존성   : @/lib/supabase/server, @/lib/season-utils, ./upload-types(공유 타입)
 * 데이터흐름: upload-tab(클라 파싱) → 배치 호출 → 이 액션(재검증+insert) → revalidate
 *
 * 동기 헬퍼는 'use server' 제약상 이 파일에서 export 불가 → excelDateToString은
 * @/lib/excel-date로 분리(공용). 내부 전용 헬퍼는 비-export 유지.
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { SEASON_KO_TO_CODE, defectSeasonToPlantingSeason } from '@/lib/season-utils'
import { excelDateToString } from '@/lib/excel-date'
import { BATCH_SIZE } from '@/lib/upload-config'
import * as XLSX from 'xlsx'
import type { UploadResult, DefectAnalysisRow } from './upload-types'

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
        const season_code = row.계절 ? SEASON_KO_TO_CODE[String(row.계절).trim()] ?? null : null
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

// 새 엑셀 컬럼명 → 내부 필드명 매핑 (한 곳에서 관리)
// 'use server' 파일은 함수만 export 가능하므로 이 객체는 파일 내부 전용으로 둔다.
const EXCEL_COL_MAP = {
  HEIGHT: '수고 H(m)',
  WIDTH: '수관폭 W(m)',
  CALIPER: '흉고직경 B(cm)',
  ROOTBALL: '근원직경 R(cm)',
  SEASON: '계절(수식)',
  RESERVE_COST: '예상 예비비(₩)',  // UI/양식 표시명; 구버전 '(d)' 표기도 파싱 시 허용
} as const

// 엑셀 예비비 컬럼 파싱 — '(₩)' 또는 구버전 '(d)' 두 키 모두 허용
function getReserveCost(row: DefectAnalysisRow): number | null {
  const v = row['예상 예비비(₩)'] ?? row['예상 예비비(d)'] ?? null
  return safeNum(v)
}

// 엑셀 숫자/문자 안전 변환
function safeNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

// 단가 문자열 파싱 ("6,000,000" → 6000000, "단가없음" → null)
function parseUnitPrice(v: unknown): number | null {
  if (v == null || v === '') return null
  const s = String(v).replace(/,/g, '').trim()
  if (!s || /[가-힣a-zA-Z]/.test(s)) return null  // "단가없음" 등 문자 포함 시 null
  const n = Number(s)
  return isNaN(n) || n <= 0 ? null : n
}

// 현장명 → site_code 자동 생성 (현장코드 없을 때 사용)
function toSiteCode(siteName: string): string {
  // 한글 제거 후 영문/숫자만 추출, 없으면 순번 기반 해시
  const cleaned = siteName.replace(/\s+/g, '_')
  return `SITE_${cleaned.slice(0, 20)}`
}

export async function uploadDefectAnalysis(
  rows: DefectAnalysisRow[]
): Promise<UploadResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, totalRows: 0, successCount: 0, failCount: 0, errors: ['인증이 필요합니다.'] }

  const errors: string[] = []
  let successCount = 0

  // organization_id 확인 (profiles → organizations 첫 번째)
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).maybeSingle()
  let org_id = profile?.organization_id
  if (!org_id) {
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1).maybeSingle()
    org_id = orgs?.id
  }
  if (!org_id) {
    return { success: false, totalRows: rows.length, successCount: 0, failCount: rows.length, errors: ['조직 정보를 찾을 수 없습니다.'] }
  }

  // 현장별로 그룹핑하여 처리 (각 행에 현장정보가 포함된 flat 구조)
  const siteCache = new Map<string, { id: string; organization_id: string; site_name: string; status: string }>()
  const contractorCache = new Map<string, string>() // contractor_name → contractor_id
  const speciesCache = new Map<string, string>()    // species_name → species_id
  const specCodeCache = new Map<string, string>()   // spec_label → spec_code_id

  // 기존 수종/규격 로드
  const { data: speciesList } = await supabase.from('species').select('id, species_name_ko').eq('is_active', true)
  speciesList?.forEach((s) => speciesCache.set(s.species_name_ko, s.id))

  const { data: specCodes } = await supabase.from('spec_codes').select('id, spec_label_raw')
  specCodes?.forEach((s) => specCodeCache.set(s.spec_label_raw, s.id))

  const pendingSiteNames: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // 헤더가 1행이므로 데이터는 2행부터

    const site_name = String(row.현장명 ?? '').trim()
    // 현장코드 없으면 현장명으로 자동 생성
    const site_code = String(row.현장코드 ?? '').trim() || (site_name ? toSiteCode(site_name) : '')
    const species_name = String(row.수종명 ?? '').trim()
    const quantity = safeNum(row.수량)

    if (!site_code && !site_name) {
      errors.push(`${rowNum}행: 현장코드 또는 현장명이 필요합니다.`)
      continue
    }
    if (!species_name || !quantity) {
      errors.push(`${rowNum}행: 수종명과 수량은 필수입니다.`)
      continue
    }

    // 현장 조회/생성 (캐시 활용)
    if (!siteCache.has(site_code)) {
      let { data: site } = await supabase
        .from('sites')
        .select('id, organization_id, site_name, status')
        .eq('site_code', site_code)
        .eq('organization_id', org_id)
        .maybeSingle()

      if (!site) {
        const completionDate = excelDateToString(row.준공일)
        // 식재시기 없으면 날짜 컬럼(점검/조사 날짜) 사용
        const plantingDate = excelDateToString(row.식재시기) ?? excelDateToString(row.날짜)
        const { data: newSite, error: siteErr } = await supabase
          .from('sites')
          .insert({
            organization_id: org_id,
            site_code,
            site_name: site_name || site_code,
            region: String(row.지역 ?? '').trim() || null,
            occupancy_date: completionDate || null,
            start_date: plantingDate || null,
            status: 'active',  // 원데이터는 즉시 active로 등록
          })
          .select('id, organization_id, site_name, status')
          .single()

        if (siteErr || !newSite) {
          errors.push(`${rowNum}행: 현장 자동 생성 실패 — ${siteErr?.message ?? '알 수 없는 오류'}`)
          continue
        }
        site = newSite
        pendingSiteNames.push(site.site_name)
      }
      siteCache.set(site_code, site)
    }

    const site = siteCache.get(site_code)!
    if (site.status === 'pending' && !pendingSiteNames.includes(site.site_name)) {
      pendingSiteNames.push(site.site_name)
    }

    // 협력사(시공사) 조회/생성 (캐시 활용)
    const contractor_name = String(row.협력사 ?? '').trim() || '미지정'
    if (!contractorCache.has(contractor_name)) {
      const { data: contractorList } = await supabase
        .from('contractors')
        .select('id, contractor_name')
        .eq('organization_id', site.organization_id)
      contractorList?.forEach((c) => contractorCache.set(c.contractor_name, c.id))

      if (!contractorCache.has(contractor_name)) {
        const { data: newC } = await supabase
          .from('contractors')
          .insert({ organization_id: site.organization_id, contractor_name, contractor_code: `AUTO_${Date.now()}` })
          .select('id')
          .single()
        if (newC) contractorCache.set(contractor_name, newC.id)
      }
    }

    const contractor_id = contractorCache.get(contractor_name)
    if (!contractor_id) {
      errors.push(`${rowNum}행: 협력사 '${contractor_name}' 생성 실패`)
      continue
    }

    // 수종 조회/생성
    if (!speciesCache.has(species_name)) {
      const code = `AUTO_${species_name.slice(0, 4).replace(/\s/g, '_')}_${Date.now() % 10000}`
      const { data: newSp } = await supabase
        .from('species')
        .insert({ species_name_ko: species_name, species_code: code })
        .select('id')
        .single()
      if (newSp) speciesCache.set(species_name, newSp.id)
      else { errors.push(`${rowNum}행: 수종 '${species_name}' 생성 실패`); continue }
    }
    const species_id = speciesCache.get(species_name)!

    // 규격 레이블 생성 — 엑셀 규격 컬럼 우선, 없으면 H·W·B·R 조합
    const height = safeNum(row[EXCEL_COL_MAP.HEIGHT])
    const width = safeNum(row[EXCEL_COL_MAP.WIDTH])
    const caliper = safeNum(row[EXCEL_COL_MAP.CALIPER])
    const rootball = safeNum(row[EXCEL_COL_MAP.ROOTBALL])

    const specLabelFromCol = String(row.규격 ?? '').trim()
    const parts: string[] = []
    if (height) parts.push(`H${height}`)
    if (width) parts.push(`W${width}`)
    if (caliper) parts.push(`B${caliper}`)
    if (rootball) parts.push(`R${rootball}`)
    const spec_label = specLabelFromCol || (parts.length > 0 ? parts.join('×') : '규격미상')

    if (!specCodeCache.has(spec_label)) {
      const { data: newSpec } = await supabase
        .from('spec_codes')
        .insert({ spec_label_raw: spec_label, height_m: height, width_m: width, rootball_r: rootball, caliper })
        .select('id')
        .single()
      if (newSpec) specCodeCache.set(spec_label, newSpec.id)
      else { errors.push(`${rowNum}행: 규격 '${spec_label}' 생성 실패`); continue }
    }
    const spec_code_id = specCodeCache.get(spec_label)!

    // 하자율 계산: 새 엑셀은 예상하자율 대신 실제 하자수량을 제공
    // defect_rate = 하자수량 / 수량
    const defect_qty = safeNum(row.하자수량)
    let defect_rate: number | null = null
    if (defect_qty != null && quantity > 0) {
      defect_rate = defect_qty / quantity
    }

    const unit_price = parseUnitPrice(row.단가)
    const reserve_cost = getReserveCost(row)

    // 리스크등급 정제
    const rawRisk = row.리스크등급 ? String(row.리스크등급).replace(/[☑□✓×]/g, '').trim() : null
    const validRisk = ['고위험', '중위험', '저위험'].includes(rawRisk ?? '') ? rawRisk : null

    // 식재시기 우선, 없으면 날짜 컬럼 사용
    const planting_date_str = excelDateToString(row.식재시기) ?? excelDateToString(row.날짜)
    const notes_parts: string[] = []
    const sebaejochi = String(row.세부조치 ?? '').trim()
    if (sebaejochi) notes_parts.push(`세부조치: ${sebaejochi}`)

    // 계절(수식) P열 → 식재 계절 (한 계절 이전)
    const defectSeasonKo = String(row[EXCEL_COL_MAP.SEASON] ?? '').trim()
    const planting_season = defectSeasonKo ? defectSeasonToPlantingSeason(defectSeasonKo) : null

    const insertData: Record<string, unknown> = {
      organization_id: site.organization_id,
      site_id: site.id,
      contractor_id,
      species_id,
      spec_code_id,
      quantity_planted: quantity,
      planting_date: planting_date_str || null,
      unit_price,
      expected_defect_rate: defect_rate,
      source_type: 'excel_import',
      notes: notes_parts.length > 0 ? notes_parts.join(' | ') : null,
      planting_season,
    }
    if (defect_qty != null) insertData.expected_defect_qty = Math.round(defect_qty)
    if (reserve_cost != null) insertData.expected_reserve_cost = Math.round(reserve_cost)
    if (validRisk) insertData.risk_level = validRisk

    const { error } = await supabase.from('planting_records').insert(insertData)
    if (error) errors.push(`${rowNum}행 (${species_name}): ${error.message}`)
    else successCount++
  }

  const siteNames = [...new Set(rows.map((r) => String(r.현장코드 ?? '').trim()).filter(Boolean))]
  await supabase.from('upload_logs').insert({
    uploaded_by: user.id,
    file_name: `하자율예측_${siteNames.slice(0, 3).join(',')}`,
    upload_type: '하자율예측',
    row_count: rows.length,
    status: errors.length === 0 ? 'success' : successCount > 0 ? 'partial' : 'failed',
    error_message: errors.length > 0 ? errors.slice(0, 10).join('\n') : null,
  })

  const pendingNotes = pendingSiteNames.length > 0
    ? [`현장 '${pendingSiteNames.join(', ')}'이(가) 승인 대기 상태로 등록되었습니다. 관리자 승인 후 대시보드에 표시됩니다.`]
    : []

  return {
    success: successCount > 0,
    totalRows: rows.length,
    successCount,
    failCount: errors.length,
    errors: [...pendingNotes, ...errors.slice(0, 20)],
  }
}

// 배치 단위 업로드 — rows 배열을 받아 처리 (기존 호환용)
export async function uploadDefectAnalysisBatch(
  rows: DefectAnalysisRow[],
  batchIndex: number,
  totalBatches: number,
): Promise<UploadResult> {
  const result = await uploadDefectAnalysis(rows)
  if (batchIndex === totalBatches - 1) {
    revalidatePath('/analytics')
    revalidatePath('/plantings')
    revalidatePath('/settings')
    revalidatePath('/dashboard')
  }
  return result
}

// 파일 기반 업로드 — 클라이언트가 엑셀 파일(base64)을 전달하면
// 서버에서 파싱 + 배치 처리를 모두 수행 (Vercel 응답 크기 제한 우회)
export async function uploadDefectAnalysisFromFile(
  fileBase64: string,  // btoa(binary) 로 인코딩된 xlsx 파일
  batchOffset: number, // 처리 시작 행 인덱스 (0, 50, 100, ...)
  batchSize: number,   // 처리할 행 수
): Promise<UploadResult & { totalRowCount: number }> {
  // base64 → Uint8Array
  const binary = atob(fileBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const wb = XLSX.read(bytes, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]

  // 컬럼명 공백 trim + 값 trim
  const rawAll: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null })
  const allRows: DefectAnalysisRow[] = rawAll
    .map((r) => {
      const cleaned: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r)) {
        cleaned[k.trim()] = typeof v === 'string' ? v.trim() : v
      }
      return cleaned
    })
    .filter((r) => r['현장명'] || r['현장코드'] || r['수종명'])
    .map((r) => ({
      날짜: r['날짜'] as string | number | undefined ?? undefined,
      현장코드: r['현장코드'] != null ? String(r['현장코드']).trim() : undefined,
      현장명: r['현장명'] != null ? String(r['현장명']).trim() : undefined,
      준공일: r['준공일'] as string | number | undefined ?? undefined,
      식재시기: r['식재시기'] as string | number | undefined ?? undefined,
      협력사: r['협력사'] != null ? String(r['협력사']).trim() : undefined,
      수종명: r['수종명'] != null ? String(r['수종명']).trim() : undefined,
      '수고 H(m)': safeNum(r['수고 H(m)']) ?? undefined,
      '수관폭 W(m)': safeNum(r['수관폭 W(m)']) ?? undefined,
      '흉고직경 B(cm)': safeNum(r['흉고직경 B(cm)']) ?? undefined,
      '근원직경 R(cm)': safeNum(r['근원직경 R(cm)']) ?? undefined,
      수량: safeNum(r['수량']) ?? undefined,
      하자수량: safeNum(r['하자수량']) ?? undefined,
      지역: r['지역'] != null ? String(r['지역']).trim() : undefined,
      단가: parseUnitPrice(r['단가']) ?? undefined,
      '계절(수식)': r['계절(수식)'] != null ? String(r['계절(수식)']).trim() : undefined,
      규격: r['규격'] != null ? String(r['규격']).trim() : undefined,
      리스크등급: r['리스크등급'] != null ? String(r['리스크등급']).trim() : undefined,
      권장조치: r['권장조치'] != null ? String(r['권장조치']).trim() : undefined,
      세부조치: r['세부조치'] != null ? String(r['세부조치']).trim() : undefined,
      '예상 예비비(₩)': safeNum(r['예상 예비비(₩)']) ?? undefined,
      '예상 예비비(d)': safeNum(r['예상 예비비(d)']) ?? undefined,
    }))

  const totalRowCount = allRows.length
  const batch = allRows.slice(batchOffset, batchOffset + batchSize)
  const isLast = batchOffset + batchSize >= totalRowCount

  const result = await uploadDefectAnalysis(batch)

  if (isLast) {
    revalidatePath('/analytics')
    revalidatePath('/plantings')
    revalidatePath('/settings')
    revalidatePath('/dashboard')
  }

  return { ...result, totalRowCount }
}

