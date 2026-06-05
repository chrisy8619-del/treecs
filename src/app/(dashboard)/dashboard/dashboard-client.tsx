'use client'

import { useState, useMemo, useRef, useTransition } from 'react'
import * as XLSX from 'xlsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  RefreshCw, Upload, TrendingUp, Coins, TreePine, Leaf,
  Target, Search, FileDown, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { uploadDefectAnalysisBatch, type DefectAnalysisRow } from '@/app/actions/upload'
import { BATCH_SIZE } from '@/lib/upload-config'

// ─── 타입 ────────────────────────────────────────────────
export type SiteOption = {
  id: string
  site_name: string
  site_code: string
  region: string | null
  occupancy_date: string | null
  start_date: string | null
  org_name: string | null
}

export type PlantingRow = {
  id: string
  site_id: string
  quantity_planted: number
  unit_price: number | null
  expected_defect_rate: number | null
  expected_defect_qty: number | null
  expected_reserve_cost: number | null
  risk_level: string | null
  notes: string | null
  contractor_name: string | null
  species_name: string | null
  height_m: number | null
  width_m: number | null
  rootball_r: number | null
  caliper: number | null
}

type Props = {
  sites: SiteOption[]
  allPlantings: PlantingRow[]
}

type RiskFilter = 'all' | '고위험' | '중위험' | '저위험'

// ─── 헬퍼 ────────────────────────────────────────────────
function riskConfig(rate: number | null) {
  if (rate === null) return { label: '-', color: 'text-gray-400', dot: 'bg-gray-300', badge: 'bg-gray-100 text-gray-600' }
  if (rate >= 0.20) return { label: '고위험', color: 'text-red-600', dot: 'bg-red-500', badge: 'bg-red-100 text-red-700' }
  if (rate >= 0.10) return { label: '중위험', color: 'text-yellow-600', dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700' }
  return { label: '저위험', color: 'text-green-600', dot: 'bg-green-500', badge: 'bg-green-100 text-green-700' }
}

function overallRisk(rate: number | null) {
  if (rate === null) return { label: '-', icon: '🌿', bg: 'bg-gray-100 text-gray-700' }
  if (rate >= 0.20) return { label: '고위험', icon: '🔴', bg: 'bg-red-100 text-red-700' }
  if (rate >= 0.10) return { label: '중위험', icon: '🟡', bg: 'bg-yellow-100 text-yellow-700' }
  return { label: '저위험', icon: '🟢', bg: 'bg-green-100 text-green-700' }
}

function recommendedAction(rate: number | null): string {
  if (rate === null) return '-'
  if (rate >= 0.20) return '즉시 교체 검토'
  if (rate >= 0.10) return '모니터링 강화'
  return '유지 관리'
}

// 숫자 안전 변환
function safeNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

// 하자율 예측 분석 시트 파싱 (새 flat 테이블 구조)
// 1행: 헤더, 2행~: 데이터
// 컬럼 순서: 날짜(A), 현장코드(B), 현장명(C), 준공일(D), 식재시기(E), 협력사(F),
//            수종명(G), 수고 H(m)(H), 수관폭 W(m)(I), 흉고직경 B(cm)(J), 근원직경 R(cm)(K),
//            수량(L), 하자수량(M), 지역(N), 단가(O), 계절(수식)(P), 규격(Q),
//            리스크등급(R), 권장조치(S), 세부조치(T), 예상 예비비(d)(U)
// 단가 문자열 파싱 ("6,000,000" → 6000000, "단가없음" → null)
function parseUnitPrice(v: unknown): number | null {
  if (v == null || v === '') return null
  const s = String(v).replace(/,/g, '').trim()
  if (!s || /[가-힣a-zA-Z]/.test(s)) return null
  const n = Number(s)
  return isNaN(n) || n <= 0 ? null : n
}

function parseDefectSheet(sheet: XLSX.WorkSheet): {
  rows: DefectAnalysisRow[]
} {
  const rawAll: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null })

  // 컬럼명 앞뒤 공백 제거 후 재매핑 (원데이터 컬럼명에 공백이 있을 수 있음)
  const raw = rawAll.map((r) => {
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      cleaned[k.trim()] = typeof v === 'string' ? v.trim() : v
    }
    return cleaned
  })

  const rows: DefectAnalysisRow[] = raw
    .filter((r) => r['현장명'] || r['현장코드'] || r['수종명'])
    .map((r) => ({
      날짜: r['날짜'] as string | number | undefined ?? undefined,
      현장코드: r['현장코드'] != null ? String(r['현장코드']).trim() : undefined,
      현장명: r['현장명'] != null ? String(r['현장명']).trim() : undefined,
      준공일: r['준공일'] as string | number | undefined ?? undefined,
      식재시기: r['식재시기'] as string | number | undefined ?? undefined,
      협력사: r['협력사'] != null ? String(r['협력사']).trim() : undefined,
      수종명: r['수종명'] != null ? String(r['수종명']).trim() : undefined,
      '수고 H(m)': safeNum(r['수고 H(m)']),
      '수관폭 W(m)': safeNum(r['수관폭 W(m)']),
      '흉고직경 B(cm)': safeNum(r['흉고직경 B(cm)']),
      '근원직경 R(cm)': safeNum(r['근원직경 R(cm)']),
      수량: safeNum(r['수량']),
      하자수량: safeNum(r['하자수량']),
      지역: r['지역'] != null ? String(r['지역']).trim() : undefined,
      단가: parseUnitPrice(r['단가']) ?? undefined,
      '계절(수식)': r['계절(수식)'] != null ? String(r['계절(수식)']).trim() : undefined,
      규격: r['규격'] != null ? String(r['규격']).trim() : undefined,
      리스크등급: r['리스크등급'] != null ? String(r['리스크등급']).trim() : undefined,
      권장조치: r['권장조치'] != null ? String(r['권장조치']).trim() : undefined,
      세부조치: r['세부조치'] != null ? String(r['세부조치']).trim() : undefined,
      '예상 예비비(₩)': safeNum(r['예상 예비비(₩)']),
      '예상 예비비(d)': safeNum(r['예상 예비비(d)']),
    }))

  return { rows }
}

// 엑셀 양식 생성 (새 flat 구조 — 현장 데이터 포함)
// 컬럼 순서: 날짜, 현장코드, 현장명, 준공일, 식재시기, 협력사, 수종명,
//            수고 H(m), 수관폭 W(m), 흉고직경 B(cm), 근원직경 R(cm),
//            수량, 하자수량, 지역, 단가, 계절(수식), 규격, 리스크등급, 권장조치, 세부조치, 예상 예비비(d)
function buildTemplateWorkbook(site: SiteOption | null, rows: PlantingRow[]) {
  const wb = XLSX.utils.book_new()

  const siteCode = site?.site_code ?? ''
  const siteName = site?.site_name ?? ''
  const region = site?.region ?? ''
  const occupancy = site?.occupancy_date ?? ''
  const startDate = site?.start_date ?? ''

  const HEADERS = [
    '날짜', '현장코드', '현장명', '준공일', '식재시기', '협력사',
    '수종명', '수고 H(m)', '수관폭 W(m)', '흉고직경 B(cm)', '근원직경 R(cm)',
    '수량', '하자수량', '지역', '단가', '계절(수식)', '규격',
    '리스크등급', '권장조치', '세부조치', '예상 예비비(₩)',
  ]

  const aoa: unknown[][] = [HEADERS]

  if (rows.length > 0) {
    rows.forEach((row) => {
      const qty = row.quantity_planted
      const defectQty = row.expected_defect_qty ?? ''
      const rate = row.expected_defect_rate
      const riskLabel = rate != null
        ? (rate >= 0.2 ? '고위험' : rate >= 0.1 ? '중위험' : '저위험')
        : ''

      aoa.push([
        '',           // 날짜
        siteCode,
        siteName,
        occupancy,
        startDate,
        '',           // 협력사
        row.species_name ?? '',
        row.height_m ?? '',
        row.width_m ?? '',
        row.caliper ?? '',
        row.rootball_r ?? '',
        qty,
        defectQty,
        region,
        row.unit_price ?? '',
        '',           // 계절(수식)
        [row.height_m ? `H${row.height_m}` : '', row.width_m ? `W${row.width_m}` : '', row.caliper ? `B${row.caliper}` : '', row.rootball_r ? `R${row.rootball_r}` : ''].filter(Boolean).join('×') || '',
        riskLabel,
        recommendedAction(rate),
        row.notes ?? '',
        row.expected_reserve_cost ?? '',
      ])
    })
  } else {
    // 빈 샘플 1행
    aoa.push([
      '', siteCode, siteName, occupancy, startDate, '',
      '수종명 입력', 2.0, 1.5, '', 8, 100, '', region, 55000, '', 'H2.0×W1.5×R8',
      '', '모니터링 강화', '', '',
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 16 },
    { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, '하자율 예측분석')
  return wb
}

// ─── 컴포넌트 ─────────────────────────────────────────────
export function DashboardClient({ sites, allPlantings }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  // 현장 선택
  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id ?? '')
  const [codeInput, setCodeInput] = useState(sites[0]?.site_code ?? '')
  const [nameInput, setNameInput] = useState(sites[0]?.site_name ?? '')
  const [codeDropdownOpen, setCodeDropdownOpen] = useState(false)
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)

  // 필터 / 페이지네이션
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  // 엑셀 업로드 상태
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null)

  // 선택된 현장
  const site = useMemo(() => sites.find((s) => s.id === selectedSiteId) ?? sites[0] ?? null, [sites, selectedSiteId])

  // 현장 수목 전체
  const siteRows = useMemo(
    () => allPlantings.filter((r) => r.site_id === (site?.id ?? '')),
    [allPlantings, site]
  )

  // 드롭다운 필터
  const codeMatches = useMemo(
    () => sites.filter((s) => s.site_code.toLowerCase().includes(codeInput.toLowerCase())).slice(0, 10),
    [sites, codeInput]
  )
  const nameMatches = useMemo(
    () => sites.filter((s) => s.site_name.toLowerCase().includes(nameInput.toLowerCase())).slice(0, 10),
    [sites, nameInput]
  )

  function selectSite(s: SiteOption) {
    setSelectedSiteId(s.id)
    setCodeInput(s.site_code)
    setNameInput(s.site_name)
    setCodeDropdownOpen(false)
    setNameDropdownOpen(false)
    setPage(1)
    setRiskFilter('all')
  }

  // 리스크 필터 적용
  const filteredRows = useMemo(() => {
    if (riskFilter === 'all') return siteRows
    return siteRows.filter((r) => r.risk_level === riskFilter)
  }, [siteRows, riskFilter])

  // 페이지네이션
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize]
  )

  // 필터/페이지 변경 시 page 리셋
  function handleRiskFilter(f: RiskFilter) {
    setRiskFilter(f)
    setPage(1)
  }
  function handlePageSize(n: number) {
    setPageSize(n)
    setPage(1)
  }

  // 집계 (필터 적용 전 전체 기준)
  const totalQty = siteRows.reduce((s, r) => s + r.quantity_planted, 0)
  const totalDefectQty = siteRows.reduce((s, r) => s + (r.expected_defect_qty ?? 0), 0)
  const totalReserve = siteRows.reduce((s, r) => s + (Number(r.expected_reserve_cost) ?? 0), 0)
  const qtyWithRate = siteRows.reduce((s, r) => r.expected_defect_rate != null ? s + r.quantity_planted : s, 0)
  const weightedSum = siteRows.reduce((s, r) => r.expected_defect_rate != null ? s + r.expected_defect_rate * r.quantity_planted : s, 0)
  const avgRate = qtyWithRate > 0 ? weightedSum / qtyWithRate : null
  const riskCounts = { high: 0, mid: 0, low: 0 }
  for (const r of siteRows) {
    if (r.risk_level === '고위험') riskCounts.high++
    else if (r.risk_level === '중위험') riskCounts.mid++
    else if (r.risk_level === '저위험') riskCounts.low++
  }
  const unitMatchCount = siteRows.filter((r) => r.unit_price != null).length
  const overall = overallRisk(avgRate)
  const avgRatePct = avgRate !== null ? (avgRate * 100).toFixed(2) + '%' : '-'
  const totalReserveStr = totalReserve > 0 ? '₩' + totalReserve.toLocaleString() : '-'

  // ── 엑셀 양식 다운로드 ──
  function handleDownloadTemplate() {
    const wb = buildTemplateWorkbook(site, siteRows)
    const fileName = site ? `하자율예측_${site.site_code}_양식.xlsx` : '하자율예측분석_양식.xlsx'
    XLSX.writeFile(wb, fileName)
  }

  // ── 엑셀 업로드 ──
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setUploadStatus({ type: 'error', msg: '.xlsx 또는 .xls 파일만 지원합니다.' })
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const { rows } = parseDefectSheet(sheet)

      if (rows.length === 0) {
        setUploadStatus({ type: 'error', msg: '수목 데이터가 없습니다. 헤더 행(1행) 이후에 데이터를 입력하세요.' })
        return
      }
      const hasSite = rows.some((r) => r.현장코드 || r.현장명)
      if (!hasSite) {
        setUploadStatus({ type: 'error', msg: '현장코드 또는 현장명이 없습니다. 양식을 확인하세요.' })
        return
      }

      startTransition(async () => {
        // 배치 처리 — BATCH_SIZE행씩 나눠 순차 호출
        const batches: DefectAnalysisRow[][] = []
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          batches.push(rows.slice(i, i + BATCH_SIZE))
        }

        let totalSuccess = 0
        let totalFail = 0

        for (let bi = 0; bi < batches.length; bi++) {
          setBatchProgress({ current: bi + 1, total: batches.length })
          const batchRes = await uploadDefectAnalysisBatch(batches[bi], bi, batches.length)
          totalSuccess += batchRes.successCount
          totalFail += batchRes.failCount
        }

        setBatchProgress(null)
        if (totalSuccess > 0) {
          setUploadStatus({ type: 'success', msg: `${totalSuccess}건 업로드 완료${totalFail > 0 ? ` (${totalFail}건 실패)` : ''} — 새로고침 중...` })
          setTimeout(() => window.location.reload(), 1200)
        } else {
          setUploadStatus({ type: 'error', msg: '업로드 실패 — 파일 형식을 확인하세요.' })
        }
      })
    }
    reader.readAsArrayBuffer(file)
    // input 초기화
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-0 -m-6">
      {/* ── 상단 헤더 ── */}
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">신규 현장 하자율 예측 분석</h1>
          <p className="text-xs text-green-200 mt-0.5">
            수종별 + 규격(H·W·B·R) 입력 → 조합형 단가 자동조회 · 예상 하자율/예비비 자동 산출
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            파일내보내기
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            새로고침
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* ── 현장 기본 정보 ── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">현장 기본 정보</h2>
          <div className="flex gap-4">
            <div className="flex-1 border rounded-lg overflow-visible bg-white">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-2.5 bg-gray-100 font-medium text-gray-500 w-24 text-xs">현장코드</td>
                    <td className="px-3 py-1.5 relative" colSpan={3}>
                      <div className="relative">
                        <input
                          type="text"
                          value={codeInput}
                          placeholder="현장코드 입력"
                          onChange={(e) => { setCodeInput(e.target.value); setCodeDropdownOpen(true) }}
                          onFocus={() => setCodeDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setCodeDropdownOpen(false), 150)}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-green-500 focus:bg-white text-gray-700 placeholder-gray-400"
                        />
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300 pointer-events-none" />
                        {codeDropdownOpen && codeMatches.length > 0 && (
                          <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {codeMatches.map((s) => (
                              <button key={s.id} onMouseDown={() => selectSite(s)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 flex items-center gap-2">
                                <span className="font-mono text-gray-500 w-20 shrink-0">{s.site_code}</span>
                                <span className="text-gray-800">{s.site_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2.5 bg-gray-100 font-medium text-gray-500 text-xs">현장명</td>
                    <td className="px-3 py-1.5 relative" colSpan={3}>
                      <div className="relative">
                        <input
                          type="text"
                          value={nameInput}
                          placeholder="현장명 입력"
                          onChange={(e) => { setNameInput(e.target.value); setNameDropdownOpen(true) }}
                          onFocus={() => setNameDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setNameDropdownOpen(false), 150)}
                          className="w-full text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-green-500 focus:bg-white text-gray-700 placeholder-gray-400"
                        />
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-300 pointer-events-none" />
                        {nameDropdownOpen && nameMatches.length > 0 && (
                          <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {nameMatches.map((s) => (
                              <button key={s.id} onMouseDown={() => selectSite(s)}
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
                  <tr className="border-b">
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs">준공일</td>
                    <td className="px-4 py-2.5 text-gray-900 text-xs">{site?.occupancy_date ?? '-'}</td>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs border-l">지역</td>
                    <td className="px-4 py-2.5 text-gray-900 text-xs">{site?.region ?? '-'}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs">식재시기</td>
                    <td className="px-4 py-2.5 text-gray-900 text-xs">{site?.start_date ?? '-'}</td>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs border-l">총 수량</td>
                    <td className="px-4 py-2.5 text-gray-900 text-xs font-medium">
                      {totalQty > 0 ? totalQty.toLocaleString() + ' 주' : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* KPI 카드 */}
            <div className="flex gap-3">
              <div className="border rounded-lg bg-white px-5 py-4 flex items-center gap-4 min-w-[170px]">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                  <Target className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">예상 하자율</div>
                  <div className="text-2xl font-bold text-gray-900">{avgRatePct}</div>
                </div>
                <TrendingUp className="h-8 w-8 text-green-400 ml-1" />
              </div>
              <div className="border rounded-lg bg-white px-5 py-4 flex items-center gap-4 min-w-[200px]">
                <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center">
                  <Coins className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">총 예비비</div>
                  <div className="text-xl font-bold text-gray-900">{totalReserveStr}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 툴바 (리스크 필터 포함) ── */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-600 font-medium text-xs">전체 리스크 판정</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${overall.bg}`}>
              {overall.icon} {overall.label}
            </span>
            {overall.label !== '-' && overall.label !== '저위험' && (
              <span className="text-xs text-gray-500">※ {overall.label} · 주의 관리 필요</span>
            )}
            <span className="mx-1 text-gray-200">|</span>
            {/* 리스크 필터 버튼 */}
            {([
              { key: 'all', label: '전체', count: siteRows.length, active: 'bg-gray-800 text-white', inactive: 'border text-gray-600 hover:bg-gray-50' },
              { key: '고위험', label: '고위험', count: riskCounts.high, active: 'bg-red-500 text-white', inactive: 'border border-red-200 text-red-600 hover:bg-red-50', dot: 'bg-red-500' },
              { key: '중위험', label: '중위험', count: riskCounts.mid, active: 'bg-yellow-400 text-white', inactive: 'border border-yellow-200 text-yellow-600 hover:bg-yellow-50', dot: 'bg-yellow-400' },
              { key: '저위험', label: '저위험', count: riskCounts.low, active: 'bg-green-500 text-white', inactive: 'border border-green-200 text-green-600 hover:bg-green-50', dot: 'bg-green-500' },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => handleRiskFilter(f.key as RiskFilter)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${riskFilter === f.key ? f.active : f.inactive}`}
              >
                {'dot' in f && <span className={`inline-block w-1.5 h-1.5 rounded-full ${riskFilter === f.key ? 'bg-white' : f.dot}`} />}
                {f.label} {f.count}종
              </button>
            ))}
            <span className="mx-1 text-gray-200">|</span>
            <span className="text-xs text-gray-500">단가 자동매칭 {unitMatchCount}건</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 bg-[#1a3a2a] hover:bg-[#2a5a3e] text-white text-xs px-3 py-1.5 rounded transition-colors">
              + 수목 추가
            </button>
            {/* 엑셀 가져오기 */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                className="flex items-center gap-1.5 border text-gray-700 hover:bg-gray-50 text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50"
              >
                📄 {isPending ? '업로드 중...' : '엑셀 가져오기'}
              </button>
              <button
                onClick={handleDownloadTemplate}
                title="현재 현장 데이터 기반 양식 다운로드"
                className="flex items-center gap-1 border text-gray-600 hover:bg-gray-50 text-xs px-2 py-1.5 rounded transition-colors"
              >
                <FileDown className="h-3.5 w-3.5" />
                양식
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            <button className="flex items-center gap-1.5 border text-gray-700 hover:bg-gray-50 text-xs px-3 py-1.5 rounded transition-colors">
              ⚙ 항목 설정
            </button>
          </div>
        </div>

        {/* 배치 진행률 */}
        {batchProgress && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-blue-800">
                업로드 중... {batchProgress.current} / {batchProgress.total} 배치
              </span>
              <span className="text-blue-500">{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* 업로드 결과 메시지 */}
        {uploadStatus && (
          <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center justify-between ${uploadStatus.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            <span>{uploadStatus.msg}</span>
            <button onClick={() => setUploadStatus(null)} className="ml-4 text-gray-400 hover:text-gray-600">✕</button>
          </div>
        )}

        {/* ── 수목 테이블 ── */}
        <div className="border rounded-lg overflow-hidden bg-white">
          {sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm gap-2">
              <p>현장 데이터가 없습니다.</p>
              <p className="text-xs">우측 상단 &apos;엑셀 가져오기&apos; 또는 &apos;양식&apos; 버튼으로 데이터를 업로드하세요.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#1a3a2a] hover:bg-[#1a3a2a]">
                    <TableHead className="text-white text-xs font-semibold w-10 text-center py-3">No.</TableHead>
                    <TableHead className="text-white text-xs font-semibold">수종명</TableHead>
                    <TableHead className="text-white text-xs font-semibold text-right">수량</TableHead>
                    <TableHead className="text-white text-xs font-semibold text-center" colSpan={4}>규격 (단위: m)</TableHead>
                    <TableHead className="text-white text-xs font-semibold text-right">단가(자동,₩)</TableHead>
                    <TableHead className="text-white text-xs font-semibold text-right">예상 하자율</TableHead>
                    <TableHead className="text-white text-xs font-semibold text-right">예상 하자수량</TableHead>
                    <TableHead className="text-white text-xs font-semibold text-right">예상 예비비(₩)</TableHead>
                    <TableHead className="text-white text-xs font-semibold text-center">리스크 등급</TableHead>
                    <TableHead className="text-white text-xs font-semibold">권장 조치</TableHead>
                    <TableHead className="text-white text-xs font-semibold">세부 조치</TableHead>
                    <TableHead className="text-white text-xs font-semibold">비고</TableHead>
                  </TableRow>
                  <TableRow className="bg-[#2a5a3e] hover:bg-[#2a5a3e]">
                    {['', '', '', '수고 H(m)', '수관폭 W(m)', '흉고직경 B(cm)', '근원직경 R(cm)', '', '', '', '', '', '', '', ''].map((h, i) => (
                      <TableHead key={i} className="text-green-100 text-xs py-1 text-center">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center py-12 text-gray-400 text-sm">
                        {riskFilter !== 'all' ? `${riskFilter} 수목이 없습니다.` : '이 현장에 수목 데이터가 없습니다.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((row, idx) => {
                      const globalIdx = (page - 1) * pageSize + idx
                      const risk = riskConfig(row.expected_defect_rate)
                      const ratePct = row.expected_defect_rate !== null
                        ? (row.expected_defect_rate * 100).toFixed(2) + '%' : '-'
                      const unitPrice = row.unit_price != null ? '₩' + Number(row.unit_price).toLocaleString() : '-'
                      const reserveCost = row.expected_reserve_cost != null ? '₩' + Number(row.expected_reserve_cost).toLocaleString() : '-'

                      return (
                        <TableRow key={row.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                          <TableCell className="text-center text-xs text-gray-500 py-2.5">{globalIdx + 1}</TableCell>
                          <TableCell className="text-xs font-medium text-gray-900 py-2.5">{row.species_name ?? '-'}</TableCell>
                          <TableCell className="text-xs text-right text-gray-900 py-2.5">{row.quantity_planted.toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-center text-gray-700 py-2.5">{row.height_m ?? ''}</TableCell>
                          <TableCell className="text-xs text-center text-gray-700 py-2.5">{row.width_m ?? ''}</TableCell>
                          <TableCell className="text-xs text-center text-gray-700 py-2.5">{row.caliper ?? ''}</TableCell>
                          <TableCell className="text-xs text-center text-gray-700 py-2.5">{row.rootball_r ?? ''}</TableCell>
                          <TableCell className="text-xs text-right text-gray-900 py-2.5">{unitPrice}</TableCell>
                          <TableCell className="text-xs text-right py-2.5">
                            <span className={row.expected_defect_rate !== null ? risk.color : 'text-gray-400'}>{ratePct}</span>
                          </TableCell>
                          <TableCell className="text-xs text-right text-gray-900 py-2.5">{row.expected_defect_qty ?? '-'}</TableCell>
                          <TableCell className="text-xs text-right text-gray-900 py-2.5">{reserveCost}</TableCell>
                          <TableCell className="text-xs text-center py-2.5">
                            {row.expected_defect_rate !== null ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                                {risk.label}
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600 py-2.5">{recommendedAction(row.expected_defect_rate)}</TableCell>
                          <TableCell className="text-xs text-gray-400 py-2.5">{row.notes ?? ''}</TableCell>
                          <TableCell className="text-xs text-gray-400 py-2.5"></TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>

              {/* 페이지네이션 */}
              <div className="px-4 py-2 border-t flex items-center justify-between text-xs text-gray-500 bg-gray-50">
                <span>
                  전체 {filteredRows.length}건
                  {riskFilter !== 'all' && <span className="ml-1 text-gray-400">(필터: {riskFilter})</span>}
                </span>
                <div className="flex items-center gap-3">
                  {/* 페이지당 건수 */}
                  <div className="flex items-center gap-1">
                    {[10, 20, 50].map((n) => (
                      <button
                        key={n}
                        onClick={() => handlePageSize(n)}
                        className={`px-2 py-0.5 rounded text-xs transition-colors ${pageSize === n ? 'bg-gray-700 text-white' : 'hover:bg-gray-200 text-gray-600'}`}
                      >
                        {n}
                      </button>
                    ))}
                    <span className="ml-1 text-gray-400">/ 페이지</span>
                  </div>
                  {/* 페이지 이동 */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
                        acc.push(p)
                        return acc
                      }, [])
                      .map((p, i) =>
                        p === '...' ? (
                          <span key={`ellipsis-${i}`} className="px-1">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p as number)}
                            className={`w-6 h-6 rounded text-xs transition-colors ${page === p ? 'bg-[#1a3a2a] text-white' : 'hover:bg-gray-200'}`}
                          >
                            {p}
                          </button>
                        )
                      )}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── 하단 요약 바 ── */}
        <div className="border rounded-lg bg-white px-6 py-4 flex items-center gap-8 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <TreePine className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">총 수목 수량</div>
              <div className="text-xl font-bold text-gray-900">{totalQty > 0 ? totalQty.toLocaleString() + ' 주' : '-'}</div>
            </div>
          </div>
          <div className="h-10 border-l" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <Leaf className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500">예상 하자수량</div>
              <div className="text-xl font-bold text-gray-900">{totalDefectQty > 0 ? totalDefectQty.toLocaleString() + ' 주' : '-'}</div>
            </div>
          </div>
          <div className="h-10 border-l" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
              <svg className="h-8 w-8" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                {avgRate !== null && (
                  <circle cx="18" cy="18" r="15.9" fill="none"
                    stroke={avgRate >= 0.20 ? '#ef4444' : avgRate >= 0.10 ? '#eab308' : '#22c55e'}
                    strokeWidth="3"
                    strokeDasharray={`${(avgRate * 100).toFixed(1)} 100`}
                    strokeLinecap="round"
                    transform="rotate(-90 18 18)"
                  />
                )}
              </svg>
            </div>
            <div>
              <div className="text-xs text-gray-500">예상 하자율(평균)</div>
              <div className="text-xl font-bold text-gray-900">{avgRatePct}</div>
            </div>
          </div>
          <div className="h-10 border-l" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-50 flex items-center justify-center">
              <Coins className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500">총 예비비</div>
              <div className="text-xl font-bold text-gray-900">{totalReserveStr}</div>
            </div>
          </div>
          <div className="h-10 border-l ml-auto" />
          {/* 도넛 차트 */}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1 text-center">리스크 등급 분포</div>
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 36 36" className="h-16 w-16">
                  {(() => {
                    const total = riskCounts.high + riskCounts.mid + riskCounts.low
                    if (total === 0) return <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                    const circ = 2 * Math.PI * 15.9
                    const segs = [
                      { pct: riskCounts.high / total, color: '#ef4444' },
                      { pct: riskCounts.mid / total, color: '#eab308' },
                      { pct: riskCounts.low / total, color: '#22c55e' },
                    ]
                    let offset = 0
                    return segs.map((seg, i) => {
                      const dash = seg.pct * circ
                      const el = <circle key={i} cx="18" cy="18" r="15.9" fill="none"
                        stroke={seg.color} strokeWidth="4"
                        strokeDasharray={`${dash} ${circ - dash}`}
                        strokeDashoffset={-offset + circ * 0.25} />
                      offset += dash
                      return el
                    })
                  })()}
                </svg>
                <div className="text-xs space-y-1">
                  {[
                    { color: 'bg-red-500', label: '고위험', count: riskCounts.high },
                    { color: 'bg-yellow-400', label: '중위험', count: riskCounts.mid },
                    { color: 'bg-green-500', label: '저위험', count: riskCounts.low },
                  ].map(({ color, label, count }) => {
                    const total = riskCounts.high + riskCounts.mid + riskCounts.low
                    return (
                      <div key={label} className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
                        <span className="text-gray-600">{label} {count}종 ({total > 0 ? Math.round(count / total * 100) : 0}%)</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
