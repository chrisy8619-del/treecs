'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Image from 'next/image'
import * as XLSX from 'xlsx'
import {
  RefreshCw, Upload, Settings, Search, Sparkles, ChevronDown,
  TrendingDown, TreePine, Leaf, AlertTriangle, Target,
} from 'lucide-react'
import { uploadSubstitutions } from '@/app/actions/substitution'

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

function riskConfig(rate: number | null) {
  if (rate === null) return { label: '-', color: 'text-gray-400', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' }
  if (rate >= 0.20) return { label: '고위험', color: 'text-red-600', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  if (rate >= 0.10) return { label: '중위험', color: 'text-orange-500', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' }
  return { label: '저위험', color: 'text-green-600', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
}

export function SimulationClient({ sites, substitutions }: Props) {
  const subFileInputRef = useRef<HTMLInputElement>(null)

  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id ?? '')
  const [codeInput, setCodeInput] = useState(sites[0]?.site_code ?? '')
  const [nameInput, setNameInput] = useState(sites[0]?.site_name ?? '')
  const [codeDropdownOpen, setCodeDropdownOpen] = useState(false)
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const [siteRows, setSiteRows] = useState<PlantingRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [selectedSubstitutes, setSelectedSubstitutes] = useState<Record<string, string>>({})
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    if (!selectedSiteId) return
    setLoadingRows(true)
    setSiteRows([])
    setSelectedSubstitutes({})
    fetch(`/api/plantings-by-site?site_id=${selectedSiteId}`)
      .then((r) => r.json())
      .then((data: PlantingRow[]) => {
        const mapped = data.map((r) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const species = Array.isArray((r as any).species) ? (r as any).species[0] : (r as any).species
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // DB 등록 대체수종 맵
  const dbSubMap = useMemo(() => {
    const map = new Map<string, { name: string; rate: number }[]>()
    for (const s of substitutions) {
      const list = map.get(s.original_species_name) ?? []
      list.push({ name: s.substitute_species_name, rate: s.improved_defect_rate })
      map.set(s.original_species_name, list)
    }
    return map
  }, [substitutions])

  // 현장 내 저위험 수종을 고위험/중위험 수종의 대체 후보로 자동 추천
  const subMap = useMemo(() => {
    const map = new Map<string, { name: string; rate: number; isAuto?: boolean }[]>()

    // DB 등록 데이터 우선 반영
    for (const [k, v] of dbSubMap) map.set(k, v.map((s) => ({ ...s, isAuto: false })))

    // 현장 내 저위험 수종 목록 (하자율 0 초과인 수종만, 중복 제거)
    const lowRiskSpecies = Array.from(
      new Map(
        siteRows
          .filter((r) => r.species_name && r.risk_level === '저위험' && r.expected_defect_rate != null)
          .map((r) => [r.species_name!, { name: r.species_name!, rate: r.expected_defect_rate! }])
      ).values()
    ).sort((a, b) => a.rate - b.rate)  // 하자율 낮은 순

    // 고위험/중위험 수종에 DB 등록 없으면 자동 추천 추가
    for (const r of siteRows) {
      if (!r.species_name) continue
      if (r.risk_level !== '고위험' && r.risk_level !== '중위험') continue
      if (map.has(r.species_name) && map.get(r.species_name)!.length > 0) continue
      const candidates = lowRiskSpecies.filter((s) => s.name !== r.species_name)
      if (candidates.length > 0) {
        map.set(r.species_name, candidates.map((s) => ({ ...s, isAuto: true })))
      }
    }

    return map
  }, [dbSubMap, siteRows])

  const tableRows = useMemo(() => {
    return siteRows.map((r) => {
      const speciesName = r.species_name ?? ''
      const substituteName = selectedSubstitutes[speciesName] ?? null
      const substituteOptions = subMap.get(speciesName) ?? []
      const selectedSub = substituteOptions.find((s) => s.name === substituteName)
      const originalRate = r.expected_defect_rate
      const improvedRate = selectedSub?.rate ?? null
      const reduction = originalRate != null && improvedRate != null ? originalRate - improvedRate : null
      const improvedDefectQty = improvedRate != null ? Math.round(r.quantity_planted * improvedRate) : null
      return { ...r, speciesName, substituteOptions, selectedSubstituteName: substituteName, improvedRate, reduction, improvedDefectQty }
    })
  }, [siteRows, selectedSubstitutes, subMap])

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

  const contractorNames = useMemo(() => {
    const names = siteRows.map((r) => r.contractor_name).filter((n): n is string => !!n)
    return [...new Set(names)]
  }, [siteRows])

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
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">현장 하자율 예측 및 대체 수종 시뮬레이션</h1>
        </div>
        <div className="flex items-center gap-2">
          <button disabled className="flex items-center gap-1.5 bg-white/10 text-white/50 text-xs px-3 py-1.5 rounded border border-white/20 cursor-not-allowed">
            <Sparkles className="h-3.5 w-3.5" />AI 분석 생성
          </button>
          <button onClick={handleExportTemplate} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors">
            <Upload className="h-3.5 w-3.5" />파일 내보내기
          </button>
          <button onClick={() => window.location.reload()} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />새로고침
          </button>
          <button onClick={() => subFileInputRef.current?.click()} disabled={isUploading}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors disabled:opacity-50">
            <Settings className="h-3.5 w-3.5" />{isUploading ? '업로드 중...' : '대체수종 등록'}
          </button>
          <input ref={subFileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleSubFileChange} />
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {uploadStatus && (
          <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center justify-between ${uploadStatus.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            <span>{uploadStatus.msg}</span>
            <button onClick={() => setUploadStatus(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}

        {/* 현장 기본 정보 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">현장 기본 정보</h2>
          <div className="flex gap-4">
            <div className="w-1/2 border rounded-lg overflow-visible bg-white">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-2.5 bg-gray-100 font-medium text-gray-500 w-24 text-xs">현장코드</td>
                    <td className="px-3 py-1.5 relative">
                      <div className="relative">
                        <input type="text" value={codeInput} placeholder="현장코드 입력"
                          onChange={(e) => { setCodeInput(e.target.value); setCodeDropdownOpen(true) }}
                          onFocus={() => setCodeDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setCodeDropdownOpen(false), 150)}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-green-500 focus:bg-white text-gray-700 placeholder-gray-400" />
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
                        <input type="text" value={nameInput} placeholder="현장명 입력"
                          onChange={(e) => { setNameInput(e.target.value); setNameDropdownOpen(true) }}
                          onFocus={() => setNameDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setNameDropdownOpen(false), 150)}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-green-500 focus:bg-white text-gray-700 placeholder-gray-400" />
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

            {/* KPI 카드 3개 — 동일 크기 */}
            <div className="flex-1 grid grid-cols-3 gap-3">
              <div className="border rounded-lg bg-white px-4 py-3">
                <div className="text-xs text-gray-500 mb-1">기존 예상 하자율</div>
                <div className="flex items-center gap-2 flex-wrap">
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
              <div className="border rounded-lg bg-white px-4 py-3">
                <div className="text-xs text-gray-500 mb-1">개선 후 하자율 <span className="text-green-600">(대체 적용 시)</span></div>
                <div className="flex items-center gap-2 flex-wrap">
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
              <div className="border rounded-lg bg-white px-4 py-3">
                <div className="text-xs text-gray-500 mb-1">저감 효과</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {reductionEffect != null && reductionEffect > 0 ? (
                    <>
                      <TrendingDown className="h-5 w-5 text-green-500" />
                      <span className="text-2xl font-bold text-green-600">{(reductionEffect * 100).toFixed(2)}%p</span>
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

        {/* 전체 리스크 요약 */}
        <div className="border rounded-lg bg-white px-4 py-3">
          <div className="text-xs font-semibold text-gray-600 mb-2">전체 리스크 요약</div>
          <div className="grid grid-cols-4 gap-3">
            <div className="border border-red-200 rounded-lg px-4 py-2 text-center">
              <div className="text-xs text-red-500 font-medium">고위험 수종</div>
              <div className="text-xl font-bold text-red-600">{riskCounts.high} <span className="text-sm font-normal">종</span></div>
            </div>
            <div className="border border-orange-200 rounded-lg px-4 py-2 text-center">
              <div className="text-xs text-orange-500 font-medium">중위험 수종</div>
              <div className="text-xl font-bold text-orange-500">{riskCounts.mid} <span className="text-sm font-normal">종</span></div>
            </div>
            <div className="border border-green-200 rounded-lg px-4 py-2 text-center">
              <div className="text-xs text-green-600 font-medium">저위험 수종</div>
              <div className="text-xl font-bold text-green-600">{riskCounts.low} <span className="text-sm font-normal">종</span></div>
            </div>
            <div className="border border-blue-200 rounded-lg px-4 py-2 text-center">
              <div className="text-xs text-blue-600 font-medium">대체 추천 가능 수종</div>
              <div className="text-xl font-bold text-blue-600">{substituteAvailableCount} <span className="text-sm font-normal">종</span></div>
            </div>
          </div>
        </div>

        {/* AI 분석 요약 (UI 틀) */}
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

        {/* 시뮬레이션 테이블 */}
        <div className="border rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">수종별 하자율 저감 시뮬레이션</span>
              <span className="text-xs text-gray-400">{loadingRows ? '데이터 불러오는 중...' : `총 ${tableRows.length}종`}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {[{ dot: 'bg-red-500', label: '고위험' }, { dot: 'bg-orange-400', label: '중위험' }, { dot: 'bg-green-500', label: '저위험' }, { dot: 'bg-gray-300', label: '유지 관리' }].map((item) => (
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
                ) : tableRows.map((row, idx) => {
                  const risk = riskConfig(row.expected_defect_rate)
                  const isLowRisk = row.risk_level === '저위험'
                  const hasSubOptions = row.substituteOptions.length > 0
                  const originalRatePct = row.expected_defect_rate != null ? (row.expected_defect_rate * 100).toFixed(2) + '%' : '-'
                  const improvedRatePct = row.improvedRate != null ? (row.improvedRate * 100).toFixed(2) + '%' : '-'
                  const reductionPct = row.reduction != null && row.reduction > 0 ? '▼ ' + (row.reduction * 100).toFixed(2) + '%p' : '-'

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
                              onChange={(e) => setSelectedSubstitutes((prev) => ({ ...prev, [row.speciesName]: e.target.value }))}
                              className="text-xs border border-dashed border-gray-400 rounded px-2 py-1 pr-6 appearance-none bg-white focus:outline-none focus:border-green-500 min-w-[120px]"
                            >
                              <option value="">대체 수종 선택</option>
                              {row.substituteOptions.map((opt) => (
                                <option key={opt.name} value={opt.name}>
                                  {opt.isAuto ? '▷ ' : ''}{opt.name} ({(opt.rate * 100).toFixed(1)}%){opt.isAuto ? ' *추천' : ''}
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
                      <td className="px-3 py-2 text-gray-400">{row.selectedSubstituteName ? '즉시 교체 검토' : '-'}</td>
                    </tr>
                  )
                })}
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
