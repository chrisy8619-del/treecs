'use client'

import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCw, Upload, TrendingUp, Coins, TreePine, Leaf, Target, Search } from 'lucide-react'

// ─── 타입 ───────────────────────────────────────────────
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

// ─── 헬퍼 ───────────────────────────────────────────────
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

// ─── 컴포넌트 ────────────────────────────────────────────
export function DashboardClient({ sites, allPlantings }: Props) {
  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id ?? '')
  const [codeInput, setCodeInput] = useState(sites[0]?.site_code ?? '')
  const [nameInput, setNameInput] = useState(sites[0]?.site_name ?? '')
  const [codeDropdownOpen, setCodeDropdownOpen] = useState(false)
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)

  // 선택된 현장
  const site = useMemo(() => sites.find((s) => s.id === selectedSiteId) ?? sites[0] ?? null, [sites, selectedSiteId])

  // 현장에 해당하는 수목 데이터
  const rows = useMemo(
    () => allPlantings.filter((r) => r.site_id === (site?.id ?? '')),
    [allPlantings, site]
  )

  // 코드 입력 필터링
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
  }

  // 집계값
  const totalQty = rows.reduce((s, r) => s + r.quantity_planted, 0)
  const totalDefectQty = rows.reduce((s, r) => s + (r.expected_defect_qty ?? 0), 0)
  const totalReserve = rows.reduce((s, r) => s + (Number(r.expected_reserve_cost) ?? 0), 0)

  const qtyWithRate = rows.reduce((s, r) => r.expected_defect_rate != null ? s + r.quantity_planted : s, 0)
  const weightedSum = rows.reduce((s, r) => r.expected_defect_rate != null ? s + r.expected_defect_rate * r.quantity_planted : s, 0)
  const avgRate = qtyWithRate > 0 ? weightedSum / qtyWithRate : null

  const riskCounts = { high: 0, mid: 0, low: 0 }
  for (const r of rows) {
    if (r.risk_level === '고위험') riskCounts.high++
    else if (r.risk_level === '중위험') riskCounts.mid++
    else if (r.risk_level === '저위험') riskCounts.low++
  }
  const unitMatchCount = rows.filter((r) => r.unit_price != null).length
  const overall = overallRisk(avgRate)
  const avgRatePct = avgRate !== null ? (avgRate * 100).toFixed(2) + '%' : '-'
  const totalReserveStr = totalReserve > 0 ? '₩' + totalReserve.toLocaleString() : '-'
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
          <button className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors">
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
            {/* 좌측: 현장 정보 테이블 */}
            <div className="flex-1 border rounded-lg overflow-visible bg-white">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    {/* 현장코드 — 입력 가능 */}
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
                              <button
                                key={s.id}
                                onMouseDown={() => selectSite(s)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 flex items-center gap-2"
                              >
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
                    {/* 현장명 — 입력 가능 */}
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
                              <button
                                key={s.id}
                                onMouseDown={() => selectSite(s)}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 flex items-center gap-2"
                              >
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

            {/* 우측: KPI 카드 */}
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

        {/* ── 툴바 ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <span className="text-gray-600 font-medium text-xs">전체 리스크 판정</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${overall.bg}`}>
              {overall.icon} {overall.label}
            </span>
            {overall.label === '중위험' && (
              <span className="text-xs text-gray-500">※ 중위험 · 주의 관리 필요</span>
            )}
            <span className="mx-1 text-gray-200">|</span>
            <span className="flex items-center gap-1 text-xs text-red-600">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> 고위험 {riskCounts.high}종
            </span>
            <span className="flex items-center gap-1 text-xs text-yellow-600">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" /> 중위험 {riskCounts.mid}종
            </span>
            <span className="flex items-center gap-1 text-xs text-green-600">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> 저위험 {riskCounts.low}종
            </span>
            <span className="mx-1 text-gray-200">|</span>
            <span className="text-xs text-gray-500">단가 자동매칭 {unitMatchCount}건</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 bg-[#1a3a2a] hover:bg-[#2a5a3e] text-white text-xs px-3 py-1.5 rounded transition-colors">
              + 수목 추가
            </button>
            <button className="flex items-center gap-1.5 border text-gray-700 hover:bg-gray-50 text-xs px-3 py-1.5 rounded transition-colors">
              📄 엑셀 가져오기
            </button>
            <button className="flex items-center gap-1.5 border text-gray-700 hover:bg-gray-50 text-xs px-3 py-1.5 rounded transition-colors">
              ⚙ 항목 설정
            </button>
          </div>
        </div>

        {/* ── 수목 테이블 ── */}
        <div className="border rounded-lg overflow-hidden bg-white">
          {sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
              <p>현장 데이터가 없습니다.</p>
              <p className="text-xs mt-1">설정 → 업로드에서 하자율 예측 분석 엑셀을 업로드하세요.</p>
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
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center py-12 text-gray-400 text-sm">
                        이 현장에 수목 데이터가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, idx) => {
                      const risk = riskConfig(row.expected_defect_rate)
                      const ratePct = row.expected_defect_rate !== null
                        ? (row.expected_defect_rate * 100).toFixed(2) + '%'
                        : '-'
                      const unitPrice = row.unit_price != null ? '₩' + Number(row.unit_price).toLocaleString() : '-'
                      const reserveCost = row.expected_reserve_cost != null ? '₩' + Number(row.expected_reserve_cost).toLocaleString() : '-'

                      return (
                        <TableRow key={row.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                          <TableCell className="text-center text-xs text-gray-500 py-2.5">{idx + 1}</TableCell>
                          <TableCell className="text-xs font-medium text-gray-900 py-2.5">{row.species_name ?? '-'}</TableCell>
                          <TableCell className="text-xs text-right text-gray-900 py-2.5">{row.quantity_planted.toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-center text-gray-700 py-2.5">{row.height_m ?? ''}</TableCell>
                          <TableCell className="text-xs text-center text-gray-700 py-2.5">{row.width_m ?? ''}</TableCell>
                          <TableCell className="text-xs text-center text-gray-700 py-2.5">{row.caliper ?? ''}</TableCell>
                          <TableCell className="text-xs text-center text-gray-700 py-2.5">{row.rootball_r ?? ''}</TableCell>
                          <TableCell className="text-xs text-right text-gray-900 py-2.5">{unitPrice}</TableCell>
                          <TableCell className="text-xs text-right py-2.5">
                            <span className={row.expected_defect_rate !== null ? risk.color : 'text-gray-400'}>
                              {ratePct}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-right text-gray-900 py-2.5">
                            {row.expected_defect_qty ?? '-'}
                          </TableCell>
                          <TableCell className="text-xs text-right text-gray-900 py-2.5">{reserveCost}</TableCell>
                          <TableCell className="text-xs text-center py-2.5">
                            {row.expected_defect_rate !== null ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                                {risk.label}
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600 py-2.5">
                            {recommendedAction(row.expected_defect_rate)}
                          </TableCell>
                          <TableCell className="text-xs text-gray-400 py-2.5">{row.notes ?? ''}</TableCell>
                          <TableCell className="text-xs text-gray-400 py-2.5"></TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
              {rows.length > 0 && (
                <div className="px-4 py-2 border-t flex items-center justify-between text-xs text-gray-500 bg-gray-50">
                  <span>전체 {rows.length}건</span>
                  <span>10 / 페이지</span>
                </div>
              )}
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
              <div className="text-xl font-bold text-gray-900">
                {totalQty > 0 ? totalQty.toLocaleString() + ' 주' : '-'}
              </div>
            </div>
          </div>

          <div className="h-10 border-l" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <Leaf className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500">예상 하자수량</div>
              <div className="text-xl font-bold text-gray-900">
                {totalDefectQty > 0 ? totalDefectQty.toLocaleString() + ' 주' : '-'}
              </div>
            </div>
          </div>

          <div className="h-10 border-l" />

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
              <svg className="h-8 w-8" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                {avgRate !== null && (
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
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

          {/* 리스크 등급 분포 도넛 */}
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
                      const el = (
                        <circle key={i} cx="18" cy="18" r="15.9" fill="none"
                          stroke={seg.color} strokeWidth="4"
                          strokeDasharray={`${dash} ${circ - dash}`}
                          strokeDashoffset={-offset + circ * 0.25}
                        />
                      )
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
