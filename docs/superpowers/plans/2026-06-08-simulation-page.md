# 대시보드(시뮬레이션) 페이지 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/simulation` 경로에 현장 하자율 예측 및 대체 수종 시뮬레이션 페이지를 추가하고, 사이드바에 `대시보드` 메뉴로 노출한다.

**Architecture:** 서버 컴포넌트(`page.tsx`)가 현장 목록·대체수종 매핑을 fetch하고 클라이언트 컴포넌트(`simulation-client.tsx`)가 드롭다운·계산·테이블 인터랙션을 담당한다. 대체수종 매핑은 `species_substitutions` 테이블에서 관리하며 엑셀 업로드로 등록한다.

**Tech Stack:** Next.js App Router, React 19, Supabase, Tailwind CSS, shadcn/ui, xlsx, lucide-react, next/image

---

## 파일 맵

| 파일 | 역할 |
|------|------|
| `supabase/migrations/add_species_substitutions.sql` | species_substitutions 테이블 생성 |
| `public/logo.png` | 나무 로고 이미지 (이미 존재 시 skip) |
| `src/app/(dashboard)/simulation/page.tsx` | 서버 컴포넌트 — 현장·매핑 fetch |
| `src/app/(dashboard)/simulation/simulation-client.tsx` | 클라이언트 — 전체 UI·계산 로직 |
| `src/app/actions/substitution.ts` | 대체수종 엑셀 업로드 서버 액션 |
| `src/app/api/substitutions/route.ts` | 대체수종 매핑 조회 API |
| `src/components/layout/app-sidebar.tsx` | 대시보드 메뉴 항목 추가 |
| `src/components/layout/dashboard-header.tsx` | /simulation 타이틀 추가 |
| `src/app/(dashboard)/analytics/page.tsx` | 헤더에 로고 삽입 |

---

## Task 1: DB 마이그레이션 — species_substitutions 테이블

**Files:**
- Create: `supabase/migrations/add_species_substitutions.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/add_species_substitutions.sql
CREATE TABLE IF NOT EXISTS species_substitutions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  original_species_id   UUID NOT NULL REFERENCES species(id),
  substitute_species_id UUID NOT NULL REFERENCES species(id),
  improved_defect_rate  NUMERIC(6,4) NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, original_species_id, substitute_species_id)
);
```

- [ ] **Step 2: Supabase SQL Editor에서 실행**

위 SQL을 Supabase 대시보드 SQL Editor에 붙여넣고 실행한다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/add_species_substitutions.sql
git commit -m "feat: species_substitutions 테이블 추가"
```

---

## Task 2: 대체수종 업로드 서버 액션

**Files:**
- Create: `src/app/actions/substitution.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/app/actions/substitution.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import * as XLSX from 'xlsx'

export type SubstitutionUploadResult = {
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

    // 수종 없으면 자동 생성
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
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/actions/substitution.ts
git commit -m "feat: 대체수종 엑셀 업로드 서버 액션 추가"
```

---

## Task 3: 대체수종 조회 API

**Files:**
- Create: `src/app/api/substitutions/route.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/app/api/substitutions/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data, error } = await supabase
    .from('species_substitutions')
    .select(`
      id,
      original_species_id,
      substitute_species_id,
      improved_defect_rate,
      original:original_species_id ( species_name_ko ),
      substitute:substitute_species_id ( species_name_ko )
    `)

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/substitutions/route.ts
git commit -m "feat: 대체수종 매핑 조회 API 추가"
```

---

## Task 4: 로고 이미지 저장

**Files:**
- Create: `public/logo.png`

- [ ] **Step 1: 로고 저장**

첨부된 나무 로고 이미지(Image #4)를 `public/logo.png`로 저장한다.
(이미지 파일을 `C:\Users\user\Desktop\dev\treecs\public\logo.png` 경로에 복사)

- [ ] **Step 2: 커밋**

```bash
git add public/logo.png
git commit -m "feat: 나무 로고 이미지 추가"
```

---

## Task 5: 시뮬레이션 클라이언트 컴포넌트

**Files:**
- Create: `src/app/(dashboard)/simulation/simulation-client.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
// src/app/(dashboard)/simulation/simulation-client.tsx
'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Image from 'next/image'
import * as XLSX from 'xlsx'
import {
  RefreshCw, Upload, Settings, Search, Sparkles, ChevronDown,
  TrendingDown, Target, Coins, TreePine, Leaf, AlertTriangle,
} from 'lucide-react'
import { uploadSubstitutions } from '@/app/actions/substitution'

// ─── 타입 ────────────────────────────────────────────────
export type SiteOption = {
  id: string
  site_name: string
  site_code: string
  region: string | null
  occupancy_date: string | null
  org_name: string | null
}

export type PlantingRow = {
  id: string
  species_name: string | null
  quantity_planted: number
  expected_defect_rate: number | null
  expected_defect_qty: number | null
  expected_reserve_cost: number | null
  risk_level: string | null
  contractor_name: string | null
  notes: string | null
}

export type SubstitutionMap = {
  original_species_name: string
  substitute_species_name: string
  improved_defect_rate: number
}

type Props = {
  sites: SiteOption[]
  substitutions: SubstitutionMap[]
}

// ─── 헬퍼 ────────────────────────────────────────────────
function riskConfig(rate: number | null) {
  if (rate === null) return { label: '-', color: 'text-gray-400', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' }
  if (rate >= 0.20) return { label: '고위험', color: 'text-red-600', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  if (rate >= 0.10) return { label: '중위험', color: 'text-orange-500', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' }
  return { label: '저위험', color: 'text-green-600', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
}

// ─── 컴포넌트 ────────────────────────────────────────────
export function SimulationClient({ sites, substitutions }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const subFileInputRef = useRef<HTMLInputElement>(null)

  // 현장 선택
  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id ?? '')
  const [codeInput, setCodeInput] = useState(sites[0]?.site_code ?? '')
  const [nameInput, setNameInput] = useState(sites[0]?.site_name ?? '')
  const [codeDropdownOpen, setCodeDropdownOpen] = useState(false)
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)

  // 수목 데이터
  const [siteRows, setSiteRows] = useState<PlantingRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)

  // 대체 수종 선택 상태 { 원수종명: 대체수종명 }
  const [selectedSubstitutes, setSelectedSubstitutes] = useState<Record<string, string>>({})

  // 업로드 상태
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const site = useMemo(() => sites.find((s) => s.id === selectedSiteId) ?? sites[0] ?? null, [sites, selectedSiteId])

  // 현장 변경 시 수목 데이터 fetch
  useEffect(() => {
    if (!selectedSiteId) return
    setLoadingRows(true)
    setSiteRows([])
    setSelectedSubstitutes({})
    fetch(`/api/plantings-by-site?site_id=${selectedSiteId}`)
      .then((r) => r.json())
      .then((data: PlantingRow[]) => {
        const mapped = data.map((r) => {
          const species = Array.isArray((r as any).species) ? (r as any).species[0] : (r as any).species
          const contractor = Array.isArray((r as any).contractors) ? (r as any).contractors[0] : (r as any).contractors
          return {
            ...r,
            species_name: species?.species_name_ko ?? null,
            contractor_name: contractor?.contractor_name ?? null,
          }
        })
        setSiteRows(mapped)
      })
      .catch(() => setSiteRows([]))
      .finally(() => setLoadingRows(false))
  }, [selectedSiteId])

  // 드롭다운 필터
  const codeMatches = useMemo(
    () => sites.filter((s) => s.site_code.toLowerCase().includes(codeInput.toLowerCase())),
    [sites, codeInput]
  )
  const nameMatches = useMemo(
    () => sites.filter((s) => s.site_name.toLowerCase().includes(nameInput.toLowerCase())),
    [sites, nameInput]
  )

  function selectSite(s: SiteOption) {
    setSelectedSiteId(s.id)
    setCodeInput(s.site_code)
    setNameInput(s.site_name)
    setCodeDropdownOpen(false)
    setNameDropdownOpen(false)
  }

  // 대체수종 맵 (원수종명 → [{대체수종명, 개선하자율}])
  const subMap = useMemo(() => {
    const map = new Map<string, { name: string; rate: number }[]>()
    for (const s of substitutions) {
      const list = map.get(s.original_species_name) ?? []
      list.push({ name: s.substitute_species_name, rate: s.improved_defect_rate })
      map.set(s.original_species_name, list)
    }
    return map
  }, [substitutions])

  // 행별 계산
  const tableRows = useMemo(() => {
    return siteRows.map((r) => {
      const speciesName = r.species_name ?? ''
      const substituteName = selectedSubstitutes[speciesName] ?? null
      const substituteOptions = subMap.get(speciesName) ?? []
      const selectedSub = substituteOptions.find((s) => s.name === substituteName)
      const originalRate = r.expected_defect_rate
      const improvedRate = selectedSub?.rate ?? null
      const reduction = originalRate != null && improvedRate != null ? originalRate - improvedRate : null
      const improvedDefectQty = improvedRate != null
        ? Math.round(r.quantity_planted * improvedRate)
        : null

      return {
        ...r,
        speciesName,
        substituteOptions,
        selectedSubstituteName: substituteName,
        improvedRate,
        reduction,
        improvedDefectQty,
      }
    })
  }, [siteRows, selectedSubstitutes, subMap])

  // 집계
  const originalTotalQty = siteRows.reduce((s, r) => s + r.quantity_planted, 0)
  const originalWeightedRate = useMemo(() => {
    const withRate = siteRows.filter((r) => r.expected_defect_rate != null)
    const totalQty = withRate.reduce((s, r) => s + r.quantity_planted, 0)
    if (totalQty === 0) return null
    return withRate.reduce((s, r) => s + r.expected_defect_rate! * r.quantity_planted, 0) / totalQty
  }, [siteRows])

  const improvedWeightedRate = useMemo(() => {
    const rows = tableRows.filter((r) => r.expected_defect_rate != null)
    const totalQty = rows.reduce((s, r) => s + r.quantity_planted, 0)
    if (totalQty === 0) return null
    return rows.reduce((s, r) => {
      const rate = r.improvedRate ?? r.expected_defect_rate ?? 0
      return s + rate * r.quantity_planted
    }, 0) / totalQty
  }, [tableRows])

  const reductionEffect = originalWeightedRate != null && improvedWeightedRate != null
    ? originalWeightedRate - improvedWeightedRate : null

  const riskCounts = useMemo(() => {
    let high = 0, mid = 0, low = 0
    for (const r of siteRows) {
      if (r.risk_level === '고위험') high++
      else if (r.risk_level === '중위험') mid++
      else if (r.risk_level === '저위험') low++
    }
    return { high, mid, low }
  }, [siteRows])

  const substituteAvailableCount = useMemo(
    () => siteRows.filter((r) => r.species_name && subMap.has(r.species_name)).length,
    [siteRows, subMap]
  )

  // 협력사 목록
  const contractorNames = useMemo(() => {
    const names = siteRows.map((r) => r.contractor_name).filter((n): n is string => !!n)
    return [...new Set(names)]
  }, [siteRows])

  // 대체수종 파일 업로드
  async function handleSubFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    setUploadStatus(null)
    try {
      const ab = await file.arrayBuffer()
      const bytes = new Uint8Array(ab)
      let binary = ''
      bytes.forEach((b) => (binary += String.fromCharCode(b)))
      const base64 = btoa(binary)
      const result = await uploadSubstitutions(base64)
      setUploadStatus({
        type: result.success ? 'success' : 'error',
        msg: result.success
          ? `${result.successCount}건 업로드 완료`
          : `업로드 실패: ${result.errors.slice(0, 3).join(', ')}`,
      })
      if (result.success) setTimeout(() => window.location.reload(), 1200)
    } catch {
      setUploadStatus({ type: 'error', msg: '파일 처리 중 오류가 발생했습니다.' })
    } finally {
      setIsUploading(false)
      if (subFileInputRef.current) subFileInputRef.current.value = ''
    }
  }

  // 파일 내보내기 (양식 다운로드)
  function handleExportTemplate() {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['원수종명', '대체수종명', '개선하자율(%)'],
      ['서양측백', '느티나무', 15.0],
    ])
    XLSX.utils.book_append_sheet(wb, ws, '대체수종매핑')
    XLSX.writeFile(wb, '대체수종매핑_양식.xlsx')
  }

  return (
    <div className="space-y-0 -m-6">
      {/* ── 상단 헤더 ── */}
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">현장 하자율 예측 및 대체 수종 시뮬레이션</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled
            className="flex items-center gap-1.5 bg-white/10 text-white/50 text-xs px-3 py-1.5 rounded border border-white/20 cursor-not-allowed"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI 분석 생성
          </button>
          <button
            onClick={handleExportTemplate}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            파일 내보내기
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            새로고침
          </button>
          <button
            onClick={() => subFileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors disabled:opacity-50"
          >
            <Settings className="h-3.5 w-3.5" />
            {isUploading ? '업로드 중...' : '대체수종 등록'}
          </button>
          <input ref={subFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleSubFileChange} />
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* 업로드 상태 */}
        {uploadStatus && (
          <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center justify-between ${uploadStatus.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            <span>{uploadStatus.msg}</span>
            <button onClick={() => setUploadStatus(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}

        {/* ── 현장 기본 정보 ── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">현장 기본 정보</h2>
          <div className="flex gap-4">
            {/* 현장 정보 테이블 */}
            <div className="flex-1 border rounded-lg overflow-visible bg-white">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-2.5 bg-gray-100 font-medium text-gray-500 w-24 text-xs">현장코드</td>
                    <td className="px-3 py-1.5 relative">
                      <div className="relative">
                        <input
                          type="text" value={codeInput} placeholder="현장코드 입력"
                          onChange={(e) => { setCodeInput(e.target.value); setCodeDropdownOpen(true) }}
                          onFocus={() => setCodeDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setCodeDropdownOpen(false), 150)}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-green-500 focus:bg-white text-gray-700 placeholder-gray-400"
                        />
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300 pointer-events-none" />
                        {codeDropdownOpen && codeMatches.length > 0 && (
                          <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {codeMatches.map((s) => (
                              <button key={s.id} onMouseDown={(e) => { e.preventDefault(); selectSite(s) }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 flex items-center gap-2">
                                <span className="font-mono text-gray-500 w-20 shrink-0">{s.site_code}</span>
                                <span className="text-gray-800">{s.site_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs border-l w-20">협력사</td>
                    <td className="px-4 py-2.5 text-gray-900 text-xs">
                      {contractorNames.length > 0 ? contractorNames.join(' · ') : <span className="text-gray-400">-</span>}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 bg-gray-100 font-medium text-gray-500 text-xs">현장명</td>
                    <td className="px-3 py-1.5 relative" colSpan={3}>
                      <div className="relative">
                        <input
                          type="text" value={nameInput} placeholder="현장명 입력"
                          onChange={(e) => { setNameInput(e.target.value); setNameDropdownOpen(true) }}
                          onFocus={() => setNameDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setNameDropdownOpen(false), 150)}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-green-500 focus:bg-white text-gray-700 placeholder-gray-400"
                        />
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300 pointer-events-none" />
                        {nameDropdownOpen && nameMatches.length > 0 && (
                          <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {nameMatches.map((s) => (
                              <button key={s.id} onMouseDown={(e) => { e.preventDefault(); selectSite(s) }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 flex items-center gap-2">
                                <span className="text-gray-800 font-medium">{s.site_name}</span>
                                <span className="font-mono text-gray-400">{s.site_code}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* KPI 카드 3개 */}
            <div className="flex gap-3">
              <div className="border rounded-lg bg-white px-4 py-3 min-w-[160px]">
                <div className="text-xs text-gray-500 mb-1">기존 예상 하자율</div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold text-gray-900">
                    {originalWeightedRate != null ? (originalWeightedRate * 100).toFixed(2) + '%' : '-'}
                  </div>
                  {originalWeightedRate != null && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${riskConfig(originalWeightedRate).badge}`}>
                      {riskConfig(originalWeightedRate).label}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  예상 하자수량 {siteRows.reduce((s, r) => s + (r.expected_defect_qty ?? 0), 0)} 주
                </div>
              </div>
              <div className="border rounded-lg bg-white px-4 py-3 min-w-[160px]">
                <div className="text-xs text-gray-500 mb-1">개선 후 하자율 <span className="text-green-600">(대체 적용 시)</span></div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold text-gray-900">
                    {improvedWeightedRate != null ? (improvedWeightedRate * 100).toFixed(2) + '%' : '-'}
                  </div>
                  {improvedWeightedRate != null && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">개선 후</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  예상 하자수량 {tableRows.reduce((s, r) => s + (r.improvedDefectQty ?? r.expected_defect_qty ?? 0), 0)} 주
                </div>
              </div>
              <div className="border rounded-lg bg-white px-4 py-3 min-w-[140px]">
                <div className="text-xs text-gray-500 mb-1">저감 효과</div>
                <div className="flex items-center gap-1">
                  {reductionEffect != null && reductionEffect > 0 ? (
                    <>
                      <TrendingDown className="h-5 w-5 text-green-500" />
                      <span className="text-2xl font-bold text-green-600">
                        {(reductionEffect * 100).toFixed(2)}%p
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-gray-400">-</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {reductionEffect != null && reductionEffect > 0
                    ? `예상 하자수량 ${Math.round((originalWeightedRate ?? 0) * originalTotalQty) - Math.round((improvedWeightedRate ?? 0) * originalTotalQty)} 주 감소`
                    : '대체 수종 선택 시 계산'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 전체 리스크 요약 ── */}
        <div className="border rounded-lg bg-white px-4 py-3 flex items-center gap-4 flex-wrap">
          <span className="text-xs font-semibold text-gray-600 shrink-0">전체 리스크 요약</span>
          <div className="flex items-center gap-2">
            <div className="border border-red-200 rounded-lg px-4 py-2 text-center min-w-[90px]">
              <div className="text-xs text-red-500 font-medium">고위험 수종</div>
              <div className="text-xl font-bold text-red-600">{riskCounts.high} <span className="text-sm font-normal">종</span></div>
            </div>
            <div className="border border-orange-200 rounded-lg px-4 py-2 text-center min-w-[90px]">
              <div className="text-xs text-orange-500 font-medium">중위험 수종</div>
              <div className="text-xl font-bold text-orange-500">{riskCounts.mid} <span className="text-sm font-normal">종</span></div>
            </div>
            <div className="border border-green-200 rounded-lg px-4 py-2 text-center min-w-[90px]">
              <div className="text-xs text-green-600 font-medium">저위험 수종</div>
              <div className="text-xl font-bold text-green-600">{riskCounts.low} <span className="text-sm font-normal">종</span></div>
            </div>
            <div className="border border-blue-200 rounded-lg px-4 py-2 text-center min-w-[110px]">
              <div className="text-xs text-blue-600 font-medium">대체 추천 가능 수종</div>
              <div className="text-xl font-bold text-blue-600">{substituteAvailableCount} <span className="text-sm font-normal">종</span></div>
            </div>
          </div>
          <div className="ml-auto flex items-start gap-2 max-w-xs">
            <Leaf className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-medium text-gray-700">대체 적용 시 기대 효과</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {substituteAvailableCount > 0
                  ? `고위험/중위험 수종에 추천 대체 수종을 모두 적용할 경우, 평균 하자율 저감 효과를 기대할 수 있습니다.`
                  : '대체수종 데이터를 등록하면 시뮬레이션이 가능합니다.'}
              </div>
            </div>
          </div>
        </div>

        {/* ── AI 분석 요약 (UI 틀) ── */}
        <div className="border rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">AI 분석 요약</span>
            <span className="text-xs text-gray-400 ml-1">(AI 분석 생성 버튼 클릭 후 활성화)</span>
          </div>
          <div className="grid grid-cols-4 divide-x text-xs">
            {[
              { title: '대체 효과 요약', icon: <Target className="h-3.5 w-3.5 text-gray-400" />, placeholder: '고위험/중위험 수종 대체 시 예상 저감 효과를 분석합니다.' },
              { title: '우선 대체 대상 수종', icon: <AlertTriangle className="h-3.5 w-3.5 text-gray-400" />, placeholder: '하자율이 높고 대체 효과가 큰 수종 순으로 우선순위를 제시합니다.' },
              { title: '계절 영향', icon: <Leaf className="h-3.5 w-3.5 text-gray-400" />, placeholder: '식재 계절에 따른 하자율 영향 분석 결과를 표시합니다.' },
              { title: '관리 포인트', icon: <TreePine className="h-3.5 w-3.5 text-gray-400" />, placeholder: '수목 관리 및 하자 예방을 위한 핵심 포인트를 안내합니다.' },
            ].map((box) => (
              <div key={box.title} className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  {box.icon}
                  <span className="font-semibold text-gray-600">{box.title}</span>
                </div>
                <p className="text-gray-400 leading-relaxed">{box.placeholder}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── 시뮬레이션 테이블 ── */}
        <div className="border rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">수종별 하자율 저감 시뮬레이션</span>
              <span className="text-xs text-gray-400">
                {loadingRows ? '데이터 불러오는 중...' : `총 ${tableRows.length}종`}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {[
                { dot: 'bg-red-500', label: '고위험' },
                { dot: 'bg-orange-400', label: '중위험' },
                { dot: 'bg-green-500', label: '저위험' },
                { dot: 'bg-gray-300', label: '유지 관리' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${item.dot}`} />
                  <span className="text-gray-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1a3a2a] text-white">
                  {['No.', '원수종', '수량 (주)', '기존 하자율', '리스크 등급', '대체 수종 선택', '개선 하자율', '저감 효과', '개선 후 예상 하자수량', '권장 조치', '세부 조치'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-400">
                      {loadingRows ? '데이터 불러오는 중...' : '현장을 선택하면 수목 데이터가 표시됩니다.'}
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row, idx) => {
                    const risk = riskConfig(row.expected_defect_rate)
                    const isLowRisk = row.risk_level === '저위험'
                    const hasSubOptions = row.substituteOptions.length > 0
                    const originalRatePct = row.expected_defect_rate != null
                      ? (row.expected_defect_rate * 100).toFixed(2) + '%' : '-'
                    const improvedRatePct = row.improvedRate != null
                      ? (row.improvedRate * 100).toFixed(2) + '%' : '-'
                    const reductionPct = row.reduction != null && row.reduction > 0
                      ? '▼ ' + (row.reduction * 100).toFixed(2) + '%p' : '-'

                    return (
                      <tr key={row.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                        <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{row.speciesName || '-'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{row.quantity_planted.toLocaleString()}</td>
                        <td className={`px-3 py-2 text-right font-medium ${risk.color}`}>{originalRatePct}</td>
                        <td className="px-3 py-2">
                          {row.expected_defect_rate != null ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${risk.badge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                              {risk.label}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2">
                          {isLowRisk || !hasSubOptions ? (
                            <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded">
                              {isLowRisk ? '유지 관리' : '등록된 대체수종 없음'}
                            </span>
                          ) : (
                            <div className="relative">
                              <select
                                value={row.selectedSubstituteName ?? ''}
                                onChange={(e) => setSelectedSubstitutes((prev) => ({
                                  ...prev,
                                  [row.speciesName]: e.target.value,
                                }))}
                                className="text-xs border border-dashed border-gray-400 rounded px-2 py-1 pr-6 appearance-none bg-white focus:outline-none focus:border-green-500 min-w-[120px]"
                              >
                                <option value="">대체 수종 선택</option>
                                {row.substituteOptions.map((opt) => (
                                  <option key={opt.name} value={opt.name}>
                                    {opt.name} ({(opt.rate * 100).toFixed(1)}%)
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-blue-600 font-medium">{improvedRatePct}</td>
                        <td className="px-3 py-2 text-right text-green-600 font-medium">{reductionPct}</td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {row.improvedDefectQty != null
                            ? `${row.improvedDefectQty} 주 (기존 ${row.expected_defect_qty ?? '-'}주)`
                            : row.expected_defect_qty != null ? `${row.expected_defect_qty} 주` : '-'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {row.selectedSubstituteName ? (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">대체 권장</span>
                          ) : isLowRisk ? (
                            <span className="px-2 py-0.5 rounded text-xs text-gray-400 bg-gray-100">유지 관리</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs text-gray-500 bg-gray-100">대체 수종 선택</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {row.selectedSubstituteName ? '즉시 교체 검토' : '-'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t text-xs text-gray-400 bg-gray-50">
            ※ 개선 하자율은 대체 수종의 기본 하자율을 기반으로 산출됩니다.
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add "src/app/(dashboard)/simulation/simulation-client.tsx"
git commit -m "feat: 시뮬레이션 클라이언트 컴포넌트 추가"
```

---

## Task 6: 시뮬레이션 서버 컴포넌트(page.tsx)

**Files:**
- Create: `src/app/(dashboard)/simulation/page.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
// src/app/(dashboard)/simulation/page.tsx
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
```

- [ ] **Step 2: 커밋**

```bash
git add "src/app/(dashboard)/simulation/page.tsx"
git commit -m "feat: 시뮬레이션 서버 컴포넌트(page.tsx) 추가"
```

---

## Task 7: 사이드바 메뉴 추가 + 헤더 타이틀 등록

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/dashboard-header.tsx`

- [ ] **Step 1: app-sidebar.tsx 수정 — navMain 맨 앞에 대시보드 추가**

`navMain` 배열을 아래로 교체:

```typescript
const navMain = [
  { title: '대시보드', href: '/simulation', icon: LayoutDashboard },
  { title: '분석', href: '/analytics', icon: BarChart3 },
  { title: '현장 하자율 예측 분석', href: '/dashboard', icon: TreePine },
]
```

- [ ] **Step 2: dashboard-header.tsx 수정 — /simulation 타이틀 추가**

`pageTitles` 객체에 항목 추가:

```typescript
const pageTitles: Record<string, string> = {
  '/simulation': '대시보드',
  '/analytics': '분석',
  '/dashboard': '현장 하자율 예측 분석',
  '/plantings': '식재 기록',
  '/sites': '현장 관리',
  '/contractors': '협력사 관리',
  '/species': '수종 관리',
  '/settings': '설정',
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/layout/app-sidebar.tsx src/components/layout/dashboard-header.tsx
git commit -m "feat: 사이드바 대시보드(/simulation) 메뉴 추가"
```

---

## Task 8: 로고 이미지 저장 및 analytics 헤더에 삽입

**Files:**
- Modify: `src/app/(dashboard)/analytics/page.tsx`

- [ ] **Step 1: public/logo.png 저장**

`C:\Users\user\.claude\image-cache\f70c61d4-edf3-420a-a452-83b0359460ff\4.png` 파일을
`C:\Users\user\Desktop\dev\treecs\public\logo.png` 경로로 복사한다.

- [ ] **Step 2: analytics/page.tsx 헤더에 로고 삽입**

analytics/page.tsx에서 헤더 `<h1>` 부분을 찾아 로고를 추가:

```tsx
// 파일 상단 import에 추가
import Image from 'next/image'

// 헤더 h1 부분 교체
<div className="flex items-center gap-3">
  <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
    <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
  </div>
  <h1 className="text-xl font-bold tracking-tight">분석</h1>
</div>
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

출력 없으면 통과.

- [ ] **Step 4: 커밋 및 푸시**

```bash
git add public/logo.png "src/app/(dashboard)/analytics/page.tsx"
git commit -m "feat: 헤더 나무 로고 삽입 (simulation·analytics 페이지)"
git push origin main
```

---

## Self-Review

**Spec 커버리지 체크:**
- [x] `/simulation` 라우트 → Task 5, 6
- [x] 사이드바 `대시보드` 메뉴 → Task 7
- [x] 현장 기본 정보 + KPI 3개 → Task 5
- [x] 전체 리스크 요약 바 → Task 5
- [x] AI 분석 요약 UI 틀 → Task 5
- [x] 시뮬레이션 테이블 + 드롭다운 → Task 5
- [x] 대체수종 엑셀 업로드 → Task 2
- [x] species_substitutions 테이블 → Task 1
- [x] 조회 API → Task 3
- [x] 로고 삽입 (simulation + analytics) → Task 5, 8
- [x] dashboard-header.tsx 타이틀 등록 → Task 7
