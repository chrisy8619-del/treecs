/**
 * 하자율 예측 분석 엑셀 배치 업로드 API. POST /api/upload-excel (form: rows JSON + isLast)
 *
 * 호출 주체 : dashboard-client.tsx, settings/upload-tab.tsx — 클라이언트에서 xlsx 파싱한
 *             행 배열을 BATCH_SIZE 단위로 반복 POST.
 * 반환/전송 : sites/contractors/species/spec_codes 자동 생성 + planting_records insert +
 *             upload_logs 기록. 마지막 배치(isLast)에서만
 *             revalidatePath('/analytics','/plantings','/settings','/dashboard').
 *             응답: { successCount, failCount, errors[] }.
 * 의존성   : @/lib/supabase/server, @/lib/season-utils
 *
 * 주의: excelDateToString은 @/lib/excel-date 공용 모듈 사용(중복 제거 완료).
 *       safeNum/parseUnitPrice는 actions/upload.ts와 아직 중복 — 추후 정리 후보.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { SEASON_KO_TO_CODE, defectSeasonToPlantingSeason, resolveSeasonCode } from '@/lib/season-utils'
import { excelDateToString } from '@/lib/excel-date'

export const maxDuration = 60

// 클라이언트에서 파싱된 JSON 행 타입
type RawRow = Record<string, unknown>

function safeNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function parseUnitPrice(v: unknown): number | null {
  if (v == null || v === '') return null
  const s = String(v).replace(/,/g, '').trim()
  if (!s || /[가-힣a-zA-Z]/.test(s)) return null
  const n = Number(s)
  return isNaN(n) || n <= 0 ? null : n
}

function toSiteCode(siteName: string): string {
  return `SITE_${siteName.replace(/\s+/g, '_').slice(0, 20)}`
}


export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  // JSON으로 배치 행 수신 (클라이언트가 파싱 후 전송)
  const body = await req.json() as {
    rows: RawRow[]
    isLast: boolean
    totalRowCount: number
    fileName: string
  }
  const { rows: batch, isLast, totalRowCount, fileName } = body

  if (!batch || batch.length === 0) {
    return NextResponse.json({ success: true, successCount: 0, failCount: 0, errors: [], isLast })
  }

  // org_id
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).maybeSingle()
  let org_id = profile?.organization_id
  if (!org_id) {
    const { data: orgs } = await supabase.from('organizations').select('id').limit(1).maybeSingle()
    org_id = orgs?.id
  }
  if (!org_id) return NextResponse.json({ error: '조직 정보를 찾을 수 없습니다.' }, { status: 400 })

  const siteCache = new Map<string, { id: string; organization_id: string; site_name: string; status: string }>()
  const contractorCache = new Map<string, string>()
  const speciesCache = new Map<string, string>()
  const specCodeCache = new Map<string, string>()

  const { data: speciesList } = await supabase.from('species').select('id, species_name_ko').eq('is_active', true)
  speciesList?.forEach((s) => speciesCache.set(s.species_name_ko, s.id))
  const { data: specCodes } = await supabase.from('spec_codes').select('id, spec_label_raw')
  specCodes?.forEach((s) => specCodeCache.set(s.spec_label_raw, s.id))

  let successCount = 0
  const errors: string[] = []

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i]
    const rowNum = i + 2

    const site_name = String(row['현장명'] ?? '').trim()
    const site_code = String(row['현장코드'] ?? '').trim() || (site_name ? toSiteCode(site_name) : '')
    const species_name = String(row['수종명'] ?? '').trim()
    const quantity = safeNum(row['수량'])

    if (!site_code && !site_name) { errors.push(`${rowNum}행: 현장코드/현장명 필요`); continue }
    if (!species_name || !quantity) { errors.push(`${rowNum}행: 수종명·수량 필수`); continue }

    // 현장
    if (!siteCache.has(site_code)) {
      let { data: site } = await supabase.from('sites').select('id, organization_id, site_name, status')
        .eq('site_code', site_code).eq('organization_id', org_id).maybeSingle()
      if (!site) {
        const { data: newSite, error: siteErr } = await supabase.from('sites').insert({
          organization_id: org_id, site_code,
          site_name: site_name || site_code,
          region: String(row['지역'] ?? '').trim() || null,
          occupancy_date: excelDateToString(row['준공일']) || null,
          start_date: (excelDateToString(row['식재시기']) ?? excelDateToString(row['날짜'])) || null,
          status: 'active',
        }).select('id, organization_id, site_name, status').single()
        if (siteErr || !newSite) { errors.push(`${rowNum}행: 현장 생성 실패 — ${siteErr?.message}`); continue }
        site = newSite
      }
      siteCache.set(site_code, site)
    }
    const site = siteCache.get(site_code)!

    // 협력사
    const contractor_name = String(row['협력사'] ?? '').trim() || '미지정'
    if (!contractorCache.has(contractor_name)) {
      const { data: list } = await supabase.from('contractors').select('id, contractor_name').eq('organization_id', site.organization_id)
      list?.forEach((c) => contractorCache.set(c.contractor_name, c.id))
      if (!contractorCache.has(contractor_name)) {
        const { data: newC } = await supabase.from('contractors')
          .insert({ organization_id: site.organization_id, contractor_name, contractor_code: `AUTO_${Date.now()}` })
          .select('id').single()
        if (newC) contractorCache.set(contractor_name, newC.id)
      }
    }
    const contractor_id = contractorCache.get(contractor_name)
    if (!contractor_id) { errors.push(`${rowNum}행: 협력사 생성 실패`); continue }

    // 수종
    if (!speciesCache.has(species_name)) {
      const code = `AUTO_${species_name.slice(0, 4).replace(/\s/g, '_')}_${Date.now() % 10000}`
      const { data: newSp } = await supabase.from('species').insert({ species_name_ko: species_name, species_code: code }).select('id').single()
      if (newSp) speciesCache.set(species_name, newSp.id)
      else { errors.push(`${rowNum}행: 수종 생성 실패`); continue }
    }
    const species_id = speciesCache.get(species_name)!

    // 규격
    const height = safeNum(row['수고 H(m)'])
    const width = safeNum(row['수관폭 W(m)'])
    const caliper = safeNum(row['흉고직경 B(cm)'])
    const rootball = safeNum(row['근원직경 R(cm)'])
    const specLabelFromCol = String(row['규격'] ?? '').trim()
    const parts: string[] = []
    if (height) parts.push(`H${height}`)
    if (width) parts.push(`W${width}`)
    if (caliper) parts.push(`B${caliper}`)
    if (rootball) parts.push(`R${rootball}`)
    const spec_label = specLabelFromCol || (parts.length > 0 ? parts.join('×') : '규격미상')
    if (!specCodeCache.has(spec_label)) {
      const { data: newSpec } = await supabase.from('spec_codes')
        .insert({ spec_label_raw: spec_label, height_m: height, width_m: width, rootball_r: rootball, caliper })
        .select('id').single()
      if (newSpec) specCodeCache.set(spec_label, newSpec.id)
      else { errors.push(`${rowNum}행: 규격 생성 실패`); continue }
    }
    const spec_code_id = specCodeCache.get(spec_label)!

    // 하자율
    const defect_qty = safeNum(row['하자수량'])
    const defect_rate = defect_qty != null && quantity > 0 ? defect_qty / quantity : null
    const unit_price = parseUnitPrice(row['단가'])
    const reserve_cost = safeNum(row['예상 예비비(₩)']) ?? safeNum(row['예상 예비비(d)'])
    const rawRisk = row['리스크등급'] ? String(row['리스크등급']).replace(/[☑□✓×]/g, '').trim() : null
    const validRisk = ['고위험', '중위험', '저위험'].includes(rawRisk ?? '') ? rawRisk : null
    const planting_date_str = excelDateToString(row['식재시기']) ?? excelDateToString(row['날짜'])

    // 계절 처리: 엑셀의 "계절(수식)"은 입주시기 계절 → 한 계절 이전의 식재 계절로 변환
    const seasonRaw = row['계절(수식)'] ? String(row['계절(수식)']).trim() : null
    const season_code = seasonRaw
      ? defectSeasonToPlantingSeason(seasonRaw)  // 봄→겨울, 여름→봄, 가을→여름, 겨울→가을
      : resolveSeasonCode(null, planting_date_str)  // 계절 미입력 시 식재시기 날짜로 자동 계산

    const insertData: Record<string, unknown> = {
      organization_id: site.organization_id,
      site_id: site.id, contractor_id, species_id, spec_code_id,
      quantity_planted: quantity,
      planting_date: planting_date_str || null,
      unit_price, expected_defect_rate: defect_rate,
      source_type: 'excel_import',
      notes: seasonRaw ? `계절:${seasonRaw}` : null,
    }
    if (season_code) insertData.planting_season = season_code
    if (defect_qty != null) insertData.expected_defect_qty = Math.round(defect_qty)
    if (reserve_cost != null) insertData.expected_reserve_cost = Math.round(reserve_cost)
    if (validRisk) insertData.risk_level = validRisk

    const { error } = await supabase.from('planting_records').insert(insertData)
    if (error) errors.push(`${rowNum}행 (${species_name}): ${error.message}`)
    else successCount++
  }

  // 마지막 배치에서 로그 저장 + revalidate
  if (isLast) {
    await supabase.from('upload_logs').insert({
      uploaded_by: user.id,
      file_name: fileName,
      upload_type: '하자율예측',
      row_count: totalRowCount,
      status: errors.length === 0 ? 'success' : successCount > 0 ? 'partial' : 'failed',
      error_message: errors.length > 0 ? errors.slice(0, 10).join('\n') : null,
    })
    revalidatePath('/analytics')
    revalidatePath('/plantings')
    revalidatePath('/settings')
    revalidatePath('/dashboard')
  }

  return NextResponse.json({
    success: successCount > 0,
    successCount,
    failCount: errors.length,
    errors: errors.slice(0, 10),
    isLast,
  })
}
