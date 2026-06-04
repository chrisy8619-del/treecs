import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCw, Upload, TrendingUp, Coins, TreePine, Leaf, Target } from 'lucide-react'

// 리스크 등급 헬퍼
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

async function getDashboardData() {
  const supabase = await createClient()

  // 현장 목록 (가장 최근 planting_records 가 있는 현장 우선)
  const { data: sites } = await supabase
    .from('sites')
    .select(`
      id, site_name, site_code, region, occupancy_date, start_date,
      organizations ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(10)

  // 시공사 목록
  const { data: contractors } = await supabase
    .from('contractors')
    .select('id, contractor_name, contractor_code')
    .eq('is_active', true)
    .limit(1)

  // 첫 번째 현장 기준으로 planting_records 조회
  const firstSite = sites?.[0]

  if (!firstSite) {
    return { site: null, contractor: null, rows: [], totalQty: 0, avgRate: null, totalReserve: 0, riskCounts: { high: 0, mid: 0, low: 0 } }
  }

  const { data: records } = await supabase
    .from('planting_records')
    .select(`
      id,
      quantity_planted,
      unit_price,
      expected_defect_rate,
      expected_defect_qty,
      expected_reserve_cost,
      risk_level,
      notes,
      contractors ( contractor_name ),
      species ( species_name_ko ),
      spec_codes ( height_m, width_m, rootball_r, caliper )
    `)
    .eq('site_id', firstSite.id)
    .order('created_at', { ascending: true })

  const rows = records ?? []
  const totalQty = rows.reduce((s, r) => s + (r.quantity_planted ?? 0), 0)

  // 평균 하자율: 수량 가중 평균
  const weightedSum = rows.reduce((s, r) => {
    const rate = r.expected_defect_rate ?? null
    return rate !== null ? s + rate * (r.quantity_planted ?? 0) : s
  }, 0)
  const qtyWithRate = rows.reduce((s, r) => r.expected_defect_rate != null ? s + (r.quantity_planted ?? 0) : s, 0)
  const avgRate = qtyWithRate > 0 ? weightedSum / qtyWithRate : null

  const totalReserve = rows.reduce((s, r) => s + (Number(r.expected_reserve_cost) ?? 0), 0)

  const riskCounts = { high: 0, mid: 0, low: 0 }
  for (const r of rows) {
    if (r.risk_level === '고위험') riskCounts.high++
    else if (r.risk_level === '중위험') riskCounts.mid++
    else if (r.risk_level === '저위험') riskCounts.low++
  }

  // 시공사: planting_records 중 첫 번째
  const contractorName = rows[0]?.contractors
    ? (Array.isArray(rows[0].contractors) ? rows[0].contractors[0]?.contractor_name : (rows[0].contractors as { contractor_name: string })?.contractor_name)
    : (contractors?.[0]?.contractor_name ?? null)

  return {
    site: firstSite,
    contractorName,
    rows,
    totalQty,
    avgRate,
    totalReserve,
    riskCounts,
  }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { site, contractorName, rows, totalQty, avgRate, totalReserve, riskCounts } = await getDashboardData()

  const org = site?.organizations
    ? (Array.isArray(site.organizations) ? site.organizations[0] : site.organizations) as { name: string } | null
    : null

  const overall = overallRisk(avgRate)
  const avgRatePct = avgRate !== null ? (avgRate * 100).toFixed(2) + '%' : '-'
  const totalReserveStr = totalReserve > 0 ? '₩' + totalReserve.toLocaleString() : '-'

  // 단가 자동매칭 건수 (unit_price 있는 행)
  const unitMatchCount = rows.filter(r => r.unit_price != null).length

  return (
    <div className="space-y-0 -m-6">
      {/* 상단 헤더 — 진한 녹색 */}
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
          <button className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
            새로고침
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* 현장 기본 정보 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">현장 기본 정보</h2>
          {site ? (
            <div className="flex gap-4">
              {/* 좌측: 현장 정보 그리드 */}
              <div className="flex-1 border rounded-lg overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b">
                      <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 w-24 text-xs">현장코드</td>
                      <td className="px-4 py-2.5 text-gray-900 text-xs">{site.site_code}</td>
                      <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 w-20 text-xs border-l">시공사</td>
                      <td className="px-4 py-2.5 text-gray-900 text-xs">{contractorName ?? '-'}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs">현장명</td>
                      <td className="px-4 py-2.5 text-gray-900 text-xs font-medium">{site.site_name}</td>
                      <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs border-l">협력사</td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">-</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs">준공일</td>
                      <td className="px-4 py-2.5 text-gray-900 text-xs">{site.occupancy_date ?? '-'}</td>
                      <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs border-l">지역</td>
                      <td className="px-4 py-2.5 text-gray-900 text-xs">{site.region ?? '-'}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs">식재시기</td>
                      <td className="px-4 py-2.5 text-gray-900 text-xs">{site.start_date ?? '-'}</td>
                      <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-600 text-xs border-l">총 수량</td>
                      <td className="px-4 py-2.5 text-gray-900 text-xs font-medium">
                        {totalQty > 0 ? totalQty.toLocaleString() + ' 주' : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 우측: KPI 카드 2개 */}
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
          ) : (
            <div className="border rounded-lg bg-white px-6 py-8 text-center text-sm text-gray-400">
              현장 데이터가 없습니다. 현장을 먼저 등록하세요.
            </div>
          )}
        </div>

        {/* 툴바 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600 font-medium text-xs">전체 리스크 판정</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${overall.bg}`}>
              {overall.icon} {overall.label}
            </span>
            {overall.label === '중위험' && (
              <span className="text-xs text-gray-500">※ 중위험 · 주의 관리 필요</span>
            )}
            <span className="mx-2 text-gray-200">|</span>
            <span className="flex items-center gap-1 text-xs text-red-600">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" /> 고위험 {riskCounts.high}종
            </span>
            <span className="flex items-center gap-1 text-xs text-yellow-600">
              <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" /> 중위험 {riskCounts.mid}종
            </span>
            <span className="flex items-center gap-1 text-xs text-green-600">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> 저위험 {riskCounts.low}종
            </span>
            <span className="mx-2 text-gray-200">|</span>
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

        {/* 메인 테이블 */}
        <div className="border rounded-lg overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1a3a2a] hover:bg-[#1a3a2a]">
                <TableHead className="text-white text-xs font-semibold w-10 text-center py-3">No.</TableHead>
                <TableHead className="text-white text-xs font-semibold">수종명</TableHead>
                <TableHead className="text-white text-xs font-semibold text-right">수량</TableHead>
                <TableHead className="text-white text-xs font-semibold text-center" colSpan={4}>
                  규격 (단위: m)
                </TableHead>
                <TableHead className="text-white text-xs font-semibold text-right">단가(자동,₩)</TableHead>
                <TableHead className="text-white text-xs font-semibold text-right">예상 하자율</TableHead>
                <TableHead className="text-white text-xs font-semibold text-right">예상 하자수량</TableHead>
                <TableHead className="text-white text-xs font-semibold text-right">예상 예비비(₩)</TableHead>
                <TableHead className="text-white text-xs font-semibold text-center">리스크 등급</TableHead>
                <TableHead className="text-white text-xs font-semibold">권장 조치</TableHead>
                <TableHead className="text-white text-xs font-semibold">세부 조치(필요시 입력)</TableHead>
                <TableHead className="text-white text-xs font-semibold">비고</TableHead>
              </TableRow>
              <TableRow className="bg-[#2a5a3e] hover:bg-[#2a5a3e]">
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1 text-center">수고 H(m)</TableHead>
                <TableHead className="text-green-100 text-xs py-1 text-center">수관폭 W(m)</TableHead>
                <TableHead className="text-green-100 text-xs py-1 text-center">흉고직경 B(cm)</TableHead>
                <TableHead className="text-green-100 text-xs py-1 text-center">근원직경 R(cm)</TableHead>
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1" />
                <TableHead className="text-green-100 text-xs py-1" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} className="text-center py-12 text-gray-400 text-sm">
                    수목 데이터가 없습니다. 엑셀 업로드 또는 수목 추가로 데이터를 입력하세요.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => {
                  const specCodes = Array.isArray(row.spec_codes) ? row.spec_codes[0] : row.spec_codes as { height_m?: number; width_m?: number; rootball_r?: number; caliper?: number } | null
                  const speciesName = Array.isArray(row.species) ? row.species[0]?.species_name_ko : (row.species as { species_name_ko: string } | null)?.species_name_ko
                  const rate = row.expected_defect_rate ?? null
                  const risk = riskConfig(rate)
                  const ratePct = rate !== null ? (rate * 100).toFixed(2) + '%' : '-'
                  const unitPrice = row.unit_price != null ? '₩' + Number(row.unit_price).toLocaleString() : '-'
                  const reserveCost = row.expected_reserve_cost != null ? '₩' + Number(row.expected_reserve_cost).toLocaleString() : '-'

                  // 권장 조치
                  let action = '-'
                  if (rate !== null) {
                    if (rate >= 0.20) action = '즉시 교체 검토'
                    else if (rate >= 0.10) action = '모니터링 강화'
                    else action = '유지 관리'
                  }

                  return (
                    <TableRow key={row.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                      <TableCell className="text-center text-xs text-gray-500 py-2.5">{idx + 1}</TableCell>
                      <TableCell className="text-xs font-medium text-gray-900 py-2.5">{speciesName ?? '-'}</TableCell>
                      <TableCell className="text-xs text-right text-gray-900 py-2.5">{row.quantity_planted.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-center text-gray-700 py-2.5">{specCodes?.height_m ?? ''}</TableCell>
                      <TableCell className="text-xs text-center text-gray-700 py-2.5">{specCodes?.width_m ?? ''}</TableCell>
                      <TableCell className="text-xs text-center text-gray-700 py-2.5">{specCodes?.caliper ?? ''}</TableCell>
                      <TableCell className="text-xs text-center text-gray-700 py-2.5">{specCodes?.rootball_r ?? ''}</TableCell>
                      <TableCell className="text-xs text-right text-gray-900 py-2.5">{unitPrice}</TableCell>
                      <TableCell className="text-xs text-right py-2.5">
                        <span className={rate !== null ? risk.color : 'text-gray-400'}>{ratePct}</span>
                      </TableCell>
                      <TableCell className="text-xs text-right text-gray-900 py-2.5">
                        {row.expected_defect_qty ?? '-'}
                      </TableCell>
                      <TableCell className="text-xs text-right text-gray-900 py-2.5">{reserveCost}</TableCell>
                      <TableCell className="text-xs text-center py-2.5">
                        {rate !== null ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${risk.badge}`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                            {risk.label}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-600 py-2.5">{action}</TableCell>
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
              <div className="flex items-center gap-1">
                <span>10 / 페이지</span>
                <span className="ml-2">1</span>
              </div>
            </div>
          )}
        </div>

        {/* 하단 요약 바 */}
        <div className="border rounded-lg bg-white px-6 py-4 flex items-center gap-8">
          {/* 총 수목 수량 */}
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

          {/* 예상 하자수량 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              <Leaf className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <div className="text-xs text-gray-500">예상 하자수량</div>
              <div className="text-xl font-bold text-gray-900">
                {rows.reduce((s, r) => s + (r.expected_defect_qty ?? 0), 0) > 0
                  ? rows.reduce((s, r) => s + (r.expected_defect_qty ?? 0), 0).toLocaleString() + ' 주'
                  : '-'}
              </div>
            </div>
          </div>

          <div className="h-10 border-l" />

          {/* 예상 하자율(평균) */}
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

          {/* 총 예비비 */}
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
                {/* 간이 도넛 SVG */}
                <svg viewBox="0 0 36 36" className="h-16 w-16">
                  {(() => {
                    const total = riskCounts.high + riskCounts.mid + riskCounts.low
                    if (total === 0) {
                      return <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                    }
                    const highPct = (riskCounts.high / total) * 100
                    const midPct = (riskCounts.mid / total) * 100
                    const lowPct = (riskCounts.low / total) * 100
                    const r = 15.9
                    const circ = 2 * Math.PI * r

                    let offset = 0
                    const segments = [
                      { pct: highPct, color: '#ef4444' },
                      { pct: midPct, color: '#eab308' },
                      { pct: lowPct, color: '#22c55e' },
                    ]
                    return segments.map((seg, i) => {
                      const dash = (seg.pct / 100) * circ
                      const gap = circ - dash
                      const el = (
                        <circle
                          key={i}
                          cx="18" cy="18" r={r}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth="4"
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset + circ * 0.25}
                          strokeLinecap="butt"
                        />
                      )
                      offset += dash
                      return el
                    })
                  })()}
                </svg>
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-gray-600">고위험 {riskCounts.high}종 ({riskCounts.high + riskCounts.mid + riskCounts.low > 0 ? Math.round(riskCounts.high / (riskCounts.high + riskCounts.mid + riskCounts.low) * 100) : 0}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />
                    <span className="text-gray-600">중위험 {riskCounts.mid}종 ({riskCounts.high + riskCounts.mid + riskCounts.low > 0 ? Math.round(riskCounts.mid / (riskCounts.high + riskCounts.mid + riskCounts.low) * 100) : 0}%)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-gray-600">저위험 {riskCounts.low}종 ({riskCounts.high + riskCounts.mid + riskCounts.low > 0 ? Math.round(riskCounts.low / (riskCounts.high + riskCounts.mid + riskCounts.low) * 100) : 0}%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
