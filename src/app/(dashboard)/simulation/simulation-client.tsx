'use client'
/**
 * 시뮬레이터 메인 클라이언트 컴포넌트(현장 선택 → 식재목록 → 대체수종 추천/담기 → 비교).
 *
 * 호출 주체 : dashboard-tabs-client.tsx(시뮬레이터 탭). 데이터는 simulation/page.tsx SSR이
 *             props(sites/substitutions/speciesAvgRate/altRecs)로 주입.
 * 반환/전송 : - 담기/삭제/확정 → actions/cart.ts(upsertCartItem·removeCartItem·clearCart·
 *               confirmCart·bulkUpsertCartItems) 호출 → revalidate('/simulation')
 *             - 대체수종 맵 엑셀 업로드 → actions/substitution.ts(uploadSubstitutions)
 *             - 현장 선택 시 /api/plantings-by-site·/api/cart-by-site fetch로 지연 조회
 * 의존성   : @/lib/substitute-recommender(ruleBasedRecommender: DB맵→지역계절표→저위험 폴백),
 *             @/lib/species-knowledge, @/lib/season-utils, ./cart-panel(CartPanel)
 * 데이터흐름: page.tsx SSR → [이 파일: 추천 계산·표 렌더·담기 UI] → cart 액션 → revalidate
 *
 * 주의: 하자율 표시는 SSR에서 이미 보정된 값(expected_defect_rate)을 사용. 여기서 재계산하지 않음.
 */

import { useState, useMemo, useCallback, useRef, useEffect, useOptimistic, useTransition } from 'react'
import Image from 'next/image'
import * as XLSX from 'xlsx'
import {
  RefreshCw, Upload, Settings, Search, Sparkles, ChevronDown,
  TrendingDown, TreePine, Leaf, AlertTriangle, Target, HelpCircle,
} from 'lucide-react'
import { uploadSubstitutions } from '@/app/actions/substitution'
import {
  upsertCartItem,
  removeCartItem,
  clearCart,
  confirmCart,
  bulkUpsertCartItems,
} from '@/app/actions/cart'
import type { CartItem, CartItemInput } from '@/app/actions/cart-types'
import { resolveSeasonCode, SEASON_CODE_TO_KO, SEASON_ORDER, KOREAN_SEASONS } from '@/lib/season-utils'
import { getRecommendedSubstitutes, mapRegion } from '@/lib/species-knowledge'
import { ruleBasedRecommender, getSpeciesRiskFromRate } from '@/lib/substitute-recommender'
import { CartPanel } from './cart-panel'

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
  unit_price: number | null
  expected_defect_rate: number | null
  expected_defect_qty: number | null
  expected_reserve_cost: number | null
  risk_level: string | null
  planting_season: string | null
  planting_date: string | null
  contractor_name: string | null
  notes: string | null
}

export type SubstitutionMap = {
  original_species_name: string
  substitute_species_name: string
  improved_defect_rate: number
}

export type AltSpeciesRec = {
  species_name: string
  region: string
  season: string
  substitute1: string | null
  substitute2: string | null
  substitute3: string | null
}

type Props = {
  sites: SiteOption[]
  substitutions: SubstitutionMap[]
  speciesAvgRate: Record<string, number>  // 전체 데이터 기준 수종별 평균 하자율
  altRecs: AltSpeciesRec[]  // 지역·계절 기반 대체 수종 추천 데이터
  hideHeader?: boolean
}

function riskConfig(rate: number | null) {
  if (rate === null) return { label: '-', color: 'text-gray-400', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-300' }
  if (rate >= 0.20) return { label: '고위험', color: 'text-red-600', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  if (rate >= 0.10) return { label: '중위험', color: 'text-orange-500', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' }
  return { label: '저위험', color: 'text-green-600', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
}

// 표 헤더 셀 정의 — hint가 있으면 라벨 옆에 도움말(?) 아이콘 + hover 툴팁을 표시한다.
type TableHeader = { label: string; hint?: string }

const TABLE_HEADERS: TableHeader[] = [
  { label: 'No.' },
  { label: '원수종' },
  { label: '수량 (주)' },
  { label: '하자율(현재기준)', hint: '이 현장에서 실제 발생한 하자율입니다. 표본(식재 수량)이 적으면 값이 크게 흔들릴 수 있습니다.' },
  { label: '수목하자율', hint: '전체 현장 데이터로 보정한 평균 하자율입니다. 리스크 등급과 대체 수종 적용은 이 값을 기준으로 판정합니다.' },
  { label: '리스크 등급' },
  { label: '대체 수종 선택' },
  { label: '개선 하자율' },
  { label: '저감 효과' },
  { label: '개선 후 예상 하자수량' },
  { label: '권장 조치' },
  { label: '세부 조치' },
]

// 어두운 표 헤더(bg-[#1a3a2a]) 위에 흰색 hover 툴팁을 띄우는 도움말 아이콘.
function HeaderHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <HelpCircle className="h-3 w-3 text-white/60 hover:text-white cursor-help" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-normal leading-snug text-gray-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white" />
      </span>
    </span>
  )
}

export function SimulationClient({ sites, substitutions, speciesAvgRate, altRecs, hideHeader }: Props) {
  const subFileInputRef = useRef<HTMLInputElement>(null)

  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    () => (sites.find((s) => s.site_name.includes('만촌')) ?? sites[0])?.id ?? ''
  )
  const [codeInput, setCodeInput] = useState(
    () => (sites.find((s) => s.site_name.includes('만촌')) ?? sites[0])?.site_code ?? ''
  )
  const [nameInput, setNameInput] = useState(
    () => (sites.find((s) => s.site_name.includes('만촌')) ?? sites[0])?.site_name ?? ''
  )
  const [codeDropdownOpen, setCodeDropdownOpen] = useState(false)
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const [siteRows, setSiteRows] = useState<PlantingRow[]>([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // ── 장바구니(서버 권위) 상태 ──
  // cartItems 가 서버 진실. 화면 표시는 낙관적 버전(optimisticItems) 사용.
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [cartStatus, setCartStatus] = useState<'draft' | 'confirmed'>('draft')
  const [isCartPending, startCartTransition] = useTransition()
  const [optimisticItems, applyOptimistic] = useOptimistic(
    cartItems,
    (state: CartItem[], action: { type: 'upsert'; item: CartItem } | { type: 'remove'; name: string } | { type: 'clear' }) => {
      if (action.type === 'clear') return []
      if (action.type === 'remove') return state.filter((i) => i.originalSpeciesName !== action.name)
      const rest = state.filter((i) => i.originalSpeciesName !== action.item.originalSpeciesName)
      return [...rest, action.item]
    }
  )

  // 기존 소비 코드(tableRows 등)가 참조하는 selectedSubstitutes 맵을 cartItems에서 파생.
  // → tableRows/improvedWeightedRate/improvedTotalCost 계산 로직은 시그니처 무손실로 그대로 동작.
  const selectedSubstitutes = useMemo(
    () => Object.fromEntries(optimisticItems.map((i) => [i.originalSpeciesName, i.substituteSpeciesName])),
    [optimisticItems]
  )

  useEffect(() => {
    if (!selectedSiteId) return
    setLoadingRows(true)
    setSiteRows([])
    setCartItems([])
    setCartStatus('draft')
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

  // 현장 변경 시 해당 현장의 draft 장바구니 로드 (DB 영속·공유)
  useEffect(() => {
    if (!selectedSiteId) return
    fetch(`/api/cart-by-site?site_id=${selectedSiteId}`)
      .then((r) => r.json())
      .then((data: { cart: { status: 'draft' | 'confirmed'; items: CartItem[] } | null }) => {
        if (data.cart) {
          setCartItems(data.cart.items)
          setCartStatus(data.cart.status)
        } else {
          setCartItems([])
          setCartStatus('draft')
        }
      })
      .catch(() => {
        setCartItems([])
        setCartStatus('draft')
      })
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

  // 지역·계절 기반 대체 수종 추천 맵 (현장 지역 + 식재 계절 매칭)
  const altRecMap = useMemo(() => {
    const currentSite = sites.find((s) => s.id === selectedSiteId)
    if (!currentSite) return new Map<string, string[]>()

    // 지역 권역 매핑: 엑셀 지역명과 현장 region 매핑
    const siteRegionRaw = currentSite.region ?? ''
    const matchedRegions: string[] = []
    if (siteRegionRaw.includes('부산') || siteRegionRaw.includes('울산') || siteRegionRaw.includes('경남') || siteRegionRaw.includes('대구') || siteRegionRaw.includes('경북')) {
      matchedRegions.push('부산', '울산', '경남', '대구', '경북')
    } else if (siteRegionRaw.includes('광주') || siteRegionRaw.includes('전남') || siteRegionRaw.includes('전북')) {
      matchedRegions.push('광주', '전남', '전북')
    } else if (siteRegionRaw.includes('서울') || siteRegionRaw.includes('경기') || siteRegionRaw.includes('인천') || siteRegionRaw.includes('충남') || siteRegionRaw.includes('충북') || siteRegionRaw.includes('세종') || siteRegionRaw.includes('강원')) {
      matchedRegions.push('서울', '경기', '인천', '충남', '충북', '세종', '강원')
    } else {
      // 매핑 불가 시 전체 사용
      matchedRegions.push(...altRecs.map((r) => r.region))
    }

    // 현장 내 수종별 계절 (planting_season → 한국어 계절, 영어 코드/한국어 모두 지원)
    const seasonMap = new Map<string, string>()
    for (const row of siteRows) {
      if (!row.species_name || !row.planting_season) continue
      const val = row.planting_season
      const ko = SEASON_CODE_TO_KO[val] ?? (KOREAN_SEASONS.has(val) ? val : null)
      if (ko && !seasonMap.has(row.species_name)) seasonMap.set(row.species_name, ko)
    }

    const map = new Map<string, string[]>()
    for (const rec of altRecs) {
      if (!matchedRegions.includes(rec.region)) continue
      const seasonForSpecies = seasonMap.get(rec.species_name)
      // 계절 데이터가 있으면 계절 일치 여부 확인, 없으면 모두 포함
      if (seasonForSpecies && rec.season !== seasonForSpecies) continue
      const candidates = [rec.substitute1, rec.substitute2, rec.substitute3].filter((s): s is string => !!s && s !== rec.species_name)
      const existing = map.get(rec.species_name) ?? []
      const merged = [...new Set([...existing, ...candidates])]
      map.set(rec.species_name, merged.slice(0, 3))
    }
    return map
  }, [altRecs, sites, selectedSiteId, siteRows])

  // 수목하자율 기준 리스크 등급 헬퍼 (speciesAvgRate 값 → '고위험'|'중위험'|'저위험'|null)
  const getSpeciesRisk = useCallback(
    (name: string | null): string | null => getSpeciesRiskFromRate(speciesAvgRate, name),
    [speciesAvgRate]
  )

  // 현장 내 저위험 수종을 고위험/중위험 수종의 대체 후보로 자동 추천 (수목하자율 기준).
  // 후보풀·랭킹 산출은 substitute-recommender 경계로 분리(향후 회귀 모델 교체 지점).
  const subMap = useMemo(
    () => ruleBasedRecommender({ dbSubMap, altRecMap, siteRows, speciesAvgRate }),
    [dbSubMap, altRecMap, siteRows, speciesAvgRate]
  )

  // ── 장바구니 액션 핸들러 ──
  // 특정 원수종 + 대체수종명으로 CartItemInput 구성 (현장 식재 행에서 스냅샷 추출)
  const buildCartInput = useCallback(
    (originalName: string, substituteName: string): CartItemInput | null => {
      const row = siteRows.find((r) => r.species_name === originalName)
      const candidates = subMap.get(originalName) ?? []
      const candidate = candidates.find((c) => c.name === substituteName)
      const rankIdx = candidates.findIndex((c) => c.name === substituteName)
      const originalRate =
        speciesAvgRate[originalName] != null ? speciesAvgRate[originalName] : row?.expected_defect_rate ?? null
      return {
        originalSpeciesName: originalName,
        substituteSpeciesName: substituteName,
        quantity: row?.quantity_planted ?? null,
        unitPrice: row?.unit_price ?? null,
        originalRate,
        improvedRate: candidate?.rate ?? speciesAvgRate[substituteName] ?? null,
        candidateRank: rankIdx >= 0 ? rankIdx + 1 : null,
        source: candidate?.isAuto === false ? 'db' : 'auto',
      }
    },
    [siteRows, subMap, speciesAvgRate]
  )

  // 담기/교체 — 낙관적 반영 후 서버 권위로 확정
  const handleAddToCart = useCallback(
    (originalName: string, substituteName: string) => {
      if (!selectedSiteId || !substituteName) return
      const input = buildCartInput(originalName, substituteName)
      if (!input) return
      const optimistic: CartItem = {
        ...input,
        id: `optimistic-${originalName}`,
        reductionRate: input.originalRate != null && input.improvedRate != null ? input.originalRate - input.improvedRate : null,
        improvedDefectQty: input.quantity != null && input.improvedRate != null ? Math.round(input.quantity * input.improvedRate) : null,
        improvedReserveCost: null,
      }
      startCartTransition(async () => {
        applyOptimistic({ type: 'upsert', item: optimistic })
        const res = await upsertCartItem(selectedSiteId, input)
        if (res.success) {
          setCartItems(res.cart.items)
          setCartStatus(res.cart.status)
        }
      })
    },
    [selectedSiteId, buildCartInput, applyOptimistic]
  )

  // 항목 제거
  const handleRemoveFromCart = useCallback(
    (originalName: string) => {
      if (!selectedSiteId) return
      startCartTransition(async () => {
        applyOptimistic({ type: 'remove', name: originalName })
        const res = await removeCartItem(selectedSiteId, originalName)
        if (res.success) {
          setCartItems(res.cart.items)
          setCartStatus(res.cart.status)
        }
      })
    },
    [selectedSiteId, applyOptimistic]
  )

  // 카트 비우기
  const handleClearCart = useCallback(() => {
    if (!selectedSiteId) return
    startCartTransition(async () => {
      applyOptimistic({ type: 'clear' })
      const res = await clearCart(selectedSiteId)
      if (res.success) {
        setCartItems(res.cart.items)
        setCartStatus(res.cart.status)
      }
    })
  }, [selectedSiteId, applyOptimistic])

  // 카트 확정 (draft → confirmed)
  const handleConfirmCart = useCallback(() => {
    if (!selectedSiteId) return
    startCartTransition(async () => {
      const res = await confirmCart(selectedSiteId)
      if (res.success) {
        setCartItems(res.cart.items)
        setCartStatus(res.cart.status)
      }
    })
  }, [selectedSiteId])

  const tableRows = useMemo(() => {
    return siteRows.map((r) => {
      const speciesName = r.species_name ?? ''
      const substituteName = selectedSubstitutes[speciesName] ?? null
      const substituteOptions = subMap.get(speciesName) ?? []
      const selectedSub = substituteOptions.find((s) => s.name === substituteName)
      // 수목하자율(전체 DB 기준)을 기준 하자율로 사용
      const originalRate = speciesAvgRate[speciesName] != null ? speciesAvgRate[speciesName] : r.expected_defect_rate
      const improvedRate = selectedSub?.rate ?? null
      const reduction = originalRate != null && improvedRate != null ? originalRate - improvedRate : null
      const improvedDefectQty = improvedRate != null ? Math.round(r.quantity_planted * improvedRate) : null
      // 개선 후 예상 하자 관리비용: 단가 × 개선 후 하자수량
      const improvedReserveCost = r.unit_price != null && improvedDefectQty != null
        ? r.unit_price * improvedDefectQty
        : null
      return { ...r, speciesName, substituteOptions, selectedSubstituteName: substituteName, improvedRate, reduction, improvedDefectQty, improvedReserveCost }
    })
  }, [siteRows, selectedSubstitutes, subMap, speciesAvgRate])

  const originalTotalQty = siteRows.reduce((s, r) => s + r.quantity_planted, 0)

  const originalWeightedRate = useMemo(() => {
    // 수목하자율 기준 가중평균: speciesAvgRate 없는 행은 expected_defect_rate 폴백
    const withRate = siteRows.filter((r) => {
      const name = r.species_name ?? ''
      return speciesAvgRate[name] != null || r.expected_defect_rate != null
    })
    const totalQty = withRate.reduce((s, r) => s + r.quantity_planted, 0)
    if (totalQty === 0) return null
    return withRate.reduce((s, r) => {
      const name = r.species_name ?? ''
      const rate = speciesAvgRate[name] != null ? speciesAvgRate[name] : r.expected_defect_rate!
      return s + rate * r.quantity_planted
    }, 0) / totalQty
  }, [siteRows, speciesAvgRate])

  const improvedWeightedRate = useMemo(() => {
    // 수목하자율 기준: 대체 수종 선택 행은 improvedRate, 나머지는 수목하자율
    const rows = tableRows.filter((r) => {
      const rate = speciesAvgRate[r.speciesName] ?? r.expected_defect_rate
      return rate != null
    })
    const totalQty = rows.reduce((s, r) => s + r.quantity_planted, 0)
    if (totalQty === 0) return null
    return rows.reduce((s, r) => {
      const baseRate = speciesAvgRate[r.speciesName] != null ? speciesAvgRate[r.speciesName] : r.expected_defect_rate!
      const rate = r.improvedRate != null ? r.improvedRate : baseRate
      return s + rate * r.quantity_planted
    }, 0) / totalQty
  }, [tableRows, speciesAvgRate])

  const reductionEffect = originalWeightedRate != null && improvedWeightedRate != null
    ? originalWeightedRate - improvedWeightedRate : null

  // 비용 집계
  const originalTotalCost = siteRows.reduce((s, r) => s + (r.expected_reserve_cost ?? 0), 0)
  // 개선 후 비용: 대체 선택된 행은 improvedReserveCost, 나머지는 기존 비용
  const improvedTotalCost = useMemo(() => {
    const hasAnySubstitute = tableRows.some((r) => r.improvedReserveCost != null)
    if (!hasAnySubstitute) return null
    return tableRows.reduce((s, r) => {
      if (r.improvedReserveCost != null) return s + r.improvedReserveCost
      return s + (r.expected_reserve_cost ?? 0)
    }, 0)
  }, [tableRows])
  const costReduction = originalTotalCost > 0 && improvedTotalCost != null
    ? originalTotalCost - improvedTotalCost : null

  // 수종명 기준 중복 제거 후 리스크 집계 (수목하자율 기준)
  const riskCounts = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of siteRows) {
      const key = r.species_name ?? `__no_name_${r.id}`
      if (!seen.has(key)) {
        const risk = getSpeciesRisk(r.species_name)
        seen.set(key, risk ?? r.risk_level ?? '')
      }
    }
    let high = 0, mid = 0, low = 0
    for (const level of seen.values()) {
      if (level === '고위험') high++
      else if (level === '중위험') mid++
      else if (level === '저위험') low++
    }
    return { high, mid, low }
  }, [siteRows])

  // 수종명 기준 중복 제거 후 대체 추천 가능 수종 수 집계
  const substituteAvailableCount = useMemo(() => {
    const uniqueSpecies = new Set(
      siteRows.map((r) => r.species_name).filter((n): n is string => !!n)
    )
    return [...uniqueSpecies].filter((name) => subMap.has(name)).length
  }, [siteRows, subMap])

  const contractorNames = useMemo(() => {
    const names = siteRows.map((r) => r.contractor_name).filter((n): n is string => !!n)
    return [...new Set(names)]
  }, [siteRows])

  // AI 분석 상태
  const [aiAnalysis, setAiAnalysis] = useState<{
    riskLevel: string
    recommendReason: string
    effectSummary: string
    actionGuide: string
    seasonalImpact: string
    seasonStats: { season: string; rate: number; qty: number; label: string }[]
  } | null>(null)
  const [aiGenerating, setAiGenerating] = useState(false)

  // 대체 수종 선택이 변경될 때마다 AI 분석 자동 업데이트 (최신 집계값 반영)
  useEffect(() => {
    if (!aiAnalysis) return
    computeAiAnalysis()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [improvedWeightedRate, reductionEffect, costReduction])

  function computeAiAnalysis() {
    if (siteRows.length === 0) return

    // 수종명 기준 중복 제거 (수량 합산, 하자율은 수목하자율 기준)
    const speciesAgg = new Map<string, { qty: number; season: string | null }>()
    for (const r of siteRows) {
      const key = r.species_name ?? `__no_name_${r.id}`
      const prev = speciesAgg.get(key) ?? { qty: 0, season: r.planting_season }
      speciesAgg.set(key, {
        qty: prev.qty + r.quantity_planted,
        season: prev.season ?? r.planting_season,
      })
    }
    const uniqueSpecies = Array.from(speciesAgg.entries()).map(([name, v]) => {
      const avgRate = speciesAvgRate[name]
      const risk = getSpeciesRisk(name)
      return {
        name,
        qty: v.qty,
        rate: avgRate != null ? avgRate : 0,
        risk,
        season: v.season,
      }
    })

    // 현재 선택된 대체 수종 반영 후 하자율 계산
    const selectedEntries = Object.entries(selectedSubstitutes).filter(([, v]) => !!v)
    const hasSelection = selectedEntries.length > 0

    // 위험도: 현재 선택 적용 후 가중평균 하자율로 리스크 수준 판정
    const currentRate = improvedWeightedRate ?? originalWeightedRate
    let riskLevel = ''
    if (currentRate == null) {
      riskLevel = '데이터가 부족하여 위험도를 판정할 수 없습니다.'
    } else if (hasSelection) {
      const level = currentRate >= 0.20 ? '고위험' : currentRate >= 0.10 ? '중위험' : '저위험'
      riskLevel = `대체 수종 적용 후 전체 예상 하자율 ${(currentRate * 100).toFixed(2)}% — ${level} 수준입니다.`
    } else {
      const level = currentRate >= 0.20 ? '고위험' : currentRate >= 0.10 ? '중위험' : '저위험'
      riskLevel = `현재 전체 예상 하자율 ${(currentRate * 100).toFixed(2)}% — ${level} 수준입니다.`
    }

    // 현장 지역 정보
    const currentSite = sites.find((s) => s.id === selectedSiteId)
    const siteRegion = mapRegion(currentSite?.region)

    // 추천 사유: 선택된 수종별 개선 근거 또는 미선택 고위험 수종 + 지식DB 추천
    let recommendReason = ''
    if (hasSelection) {
      const lines = selectedEntries.map(([origName, subName]) => {
        const origRow = uniqueSpecies.find((s) => s.name === origName)
        const subOpts = subMap.get(origName) ?? []
        const subOpt = subOpts.find((s) => s.name === subName)
        if (!origRow || !subOpt) return null
        const diff = origRow.rate - subOpt.rate
        return `${origName}(${(origRow.rate * 100).toFixed(1)}%) → ${subName}(${(subOpt.rate * 100).toFixed(1)}%): ${(diff * 100).toFixed(1)}%p 개선`
      }).filter((l): l is string => !!l)
      recommendReason = lines.length > 0
        ? lines.join('  /  ')
        : '선택된 대체 수종의 하자율 데이터가 없습니다.'
    } else {
      const highMid = uniqueSpecies.filter((s) => (s.risk === '고위험' || s.risk === '중위험') && subMap.has(s.name))
      const highMidAll = uniqueSpecies.filter((s) => s.risk === '고위험' || s.risk === '중위험')

      // 지식DB 기반 추천: 고위험/중위험 수종별로 최대 3종 추천
      const knowledgeLines = highMidAll.slice(0, 3).map((s) => {
        const recs = getRecommendedSubstitutes(s.name, siteRegion, 3)
        if (recs.length === 0) return null
        const recNames = recs.map((r) => r.name).join(' · ')
        return `${s.name}: ${recNames} 추천`
      }).filter((l): l is string => !!l)

      if (highMid.length > 0 || knowledgeLines.length > 0) {
        const parts: string[] = []
        if (highMid.length > 0) {
          parts.push(`${highMid.slice(0, 3).map((s) => s.name).join(', ')} 등 ${highMid.length}종에 등록된 대체 수종 후보 있음`)
        }
        if (knowledgeLines.length > 0) {
          parts.push(...knowledgeLines)
        }
        recommendReason = parts.join('  /  ')
      } else if (highMidAll.length > 0) {
        // 대체 후보는 없지만 고위험/중위험 수종은 있는 경우
        const knowledgeFallback = highMidAll.slice(0, 3).map((s) => {
          const recs = getRecommendedSubstitutes(s.name, siteRegion, 3)
          if (recs.length === 0) return null
          return `${s.name}: ${recs.map((r) => r.name).join(' · ')} 추천 (지역: ${siteRegion})`
        }).filter((l): l is string => !!l)
        recommendReason = knowledgeFallback.length > 0
          ? knowledgeFallback.join('  /  ')
          : '고위험·중위험 수종에 대한 대체 후보가 없습니다. 대체수종 등록 메뉴를 통해 등록하세요.'
      } else {
        recommendReason = '고위험·중위험 수종에 대한 대체 후보가 없습니다. 대체수종 등록 메뉴를 통해 등록하세요.'
      }
    }

    // 예상 절감 효과: 현재 선택 기준 실제 절감율/절감액
    let effectSummary = ''
    if (hasSelection && reductionEffect != null && reductionEffect > 0) {
      const reducedQty = Math.round((originalWeightedRate ?? 0) * originalTotalQty) - Math.round((improvedWeightedRate ?? 0) * originalTotalQty)
      effectSummary = `현재 선택 기준 하자율 ${(reductionEffect * 100).toFixed(2)}%p 절감 (예상 하자수량 ${reducedQty}주 감소)`
      if (costReduction != null && costReduction > 0) {
        effectSummary += ` / 하자 관리비용 ₩${costReduction.toLocaleString()} 절감`
      }
    } else if (hasSelection) {
      effectSummary = '선택된 대체 수종의 하자율이 원수종보다 높거나 동일합니다. 다른 수종을 선택해보세요.'
    } else {
      const highMidSpecies = uniqueSpecies.filter((s) => s.risk === '고위험' || s.risk === '중위험')
      const withSub = highMidSpecies.filter((s) => subMap.has(s.name))
      const totalAllQty = uniqueSpecies.reduce((s, r) => s + r.qty, 0)
      const improvedSum = uniqueSpecies.reduce((s, r) => {
        if (r.risk === '고위험' || r.risk === '중위험') {
          const opts = subMap.get(r.name) ?? []
          if (opts.length > 0) {
            const best = opts.reduce((a, b) => a.rate < b.rate ? a : b)
            return s + best.rate * r.qty
          }
        }
        return s + r.rate * r.qty
      }, 0)
      const avgOriginal = totalAllQty > 0 ? uniqueSpecies.reduce((s, r) => s + r.rate * r.qty, 0) / totalAllQty : 0
      const avgImproved = totalAllQty > 0 ? improvedSum / totalAllQty : null
      const effectPct = avgImproved != null ? ((avgOriginal - avgImproved) * 100).toFixed(1) : null
      if (highMidSpecies.length === 0) {
        effectSummary = '고위험·중위험 수종이 없어 대체 검토가 필요하지 않습니다.'
      } else if (effectPct != null && Number(effectPct) > 0) {
        effectSummary = `최적 대체 수종 일괄 적용 시 전체 평균 하자율 약 ${effectPct}%p 개선 가능 (${withSub.length}/${highMidSpecies.length}종 대체 후보 있음)`
      } else {
        effectSummary = `고위험·중위험 ${highMidSpecies.length}종이 확인됩니다. 대체 수종 등록 후 절감 효과를 분석할 수 있습니다.`
      }
    }

    // 권장 조치: 미선택 고위험 수종 권고
    let actionGuide = ''
    const unselectedHighRisk = uniqueSpecies.filter((s) => {
      if (s.risk !== '고위험' && s.risk !== '중위험') return false
      if (selectedSubstitutes[s.name]) return false
      return true
    })
    if (unselectedHighRisk.length === 0 && hasSelection) {
      actionGuide = '모든 고위험·중위험 수종에 대체 수종이 선택되었습니다. 선택 내용을 검토 후 현장에 적용하세요.'
    } else if (unselectedHighRisk.length > 0) {
      const urgent = unselectedHighRisk.filter((s) => s.risk === '고위험').slice(0, 3)
      const mid = unselectedHighRisk.filter((s) => s.risk === '중위험').slice(0, 2)
      const parts: string[] = []
      if (urgent.length > 0) parts.push(`즉시 교체 검토 필요: ${urgent.map((s) => s.name).join(', ')}`)
      if (mid.length > 0) parts.push(`모니터링 강화: ${mid.map((s) => s.name).join(', ')}`)
      actionGuide = parts.join(' / ')
      if (unselectedHighRisk.length > 5) actionGuide += ` 외 ${unselectedHighRisk.length - 5}종`
    } else {
      const { high: highCount, mid: midCount, low: lowCount } = riskCounts
      const totalSpeciesCount = highCount + midCount + lowCount
      if (highCount === 0 && midCount === 0) {
        actionGuide = `전 수종 저위험(${lowCount}종) — 정기 점검 위주로 관리하십시오.`
      } else {
        actionGuide = `고위험 ${highCount}종·중위험 ${midCount}종에 대한 대체 수종 선택을 권장합니다. 저위험 ${lowCount}종(${totalSpeciesCount > 0 ? (lowCount / totalSpeciesCount * 100).toFixed(0) : 0}%)은 정기 점검으로 유지하십시오.`
      }
    }

    // 식재 시기 영향 분석 (버튼 클릭 시에만 계산)
    const rowsWithSeason = siteRows.map((r) => ({
      ...r,
      resolvedSeason: resolveSeasonCode(
        // DB에 영어 코드('spring') 또는 한국어('봄') 모두 처리
        r.planting_season
          ? (SEASON_CODE_TO_KO[r.planting_season] ?? (KOREAN_SEASONS.has(r.planting_season) ? r.planting_season : null))
          : null,
        r.planting_date,
      ),
    }))
    const seasonBuckets: Record<string, { qty: number; defectQty: number; species: Map<string, { qty: number; defectQty: number }> }> = {}
    for (const r of rowsWithSeason) {
      if (!r.resolvedSeason) continue
      // expected_defect_rate 없으면 수목하자율(speciesAvgRate) 폴백
      const effectiveRate = r.expected_defect_rate ?? (r.species_name ? speciesAvgRate[r.species_name] : null)
      if (effectiveRate == null) continue
      const s = r.resolvedSeason
      if (!seasonBuckets[s]) seasonBuckets[s] = { qty: 0, defectQty: 0, species: new Map() }
      const rowDefectQty = r.expected_defect_qty ?? Math.round(r.quantity_planted * effectiveRate)
      seasonBuckets[s].qty += r.quantity_planted
      seasonBuckets[s].defectQty += rowDefectQty
      const spName = r.species_name ?? '알 수 없음'
      const prev = seasonBuckets[s].species.get(spName) ?? { qty: 0, defectQty: 0 }
      seasonBuckets[s].species.set(spName, { qty: prev.qty + r.quantity_planted, defectQty: prev.defectQty + rowDefectQty })
    }
    const seasonStats = SEASON_ORDER
      .filter((k) => seasonBuckets[k])
      .map((k) => {
        const v = seasonBuckets[k]
        const rate = v.qty > 0 ? v.defectQty / v.qty : 0
        const topSpecies = Array.from(v.species.entries())
          .map(([name, sv]) => ({ name, rate: sv.qty > 0 ? sv.defectQty / sv.qty : 0 }))
          .sort((a, b) => b.rate - a.rate)
          .slice(0, 2)
          .map((s) => s.name)
        return { season: k, label: SEASON_CODE_TO_KO[k] ?? k, rate, qty: v.qty, topSpecies }
      })
    // 입주 시기별 고정 분석 문구
    const SEASONAL_IMPACT_BY_OCCUPANCY: Record<string, string> = {
      winter: `① 겨울 입주 현장 (가을 식재 시행)\n\n가을철 식재 후 입주 시점이 동절기에 해당하는 현장의 경우, 수목의 활착이 완료되기 이전에 혹한 및 동결 환경에 노출됨으로써 동해(凍害) 피해 발생 가능성이 현저히 높아진다. 이에 따라 내한성(耐寒性)이 취약한 수종—블루엔젤, 대왕참나무 등 동해 민감종—의 가을 식재는 지양하는 것이 바람직하며, 해당 수종은 내한성이 확보된 대체 수종으로 우선 적용하여 동절기 하자를 사전에 억제하는 식재 계획을 수립하였다.`,
      fall: `② 가을 입주 현장 (여름 식재 시행)\n\n가을 입주 현장에서 하절기 식재가 시행된 경우, 고온 다습한 환경과 강한 일사(日射)로 인해 수분 증산량이 급격히 증가하여 건조 피해 및 열해(熱害) 발생 위험이 높다. 이를 방지하기 위해 식재 직후부터 입주 시점까지 정기적인 관수(灌水) 및 토양 수분 유지 관리를 병행하되, 근본적인 하자 저감을 위해 내건성(耐乾性) 및 내열성(耐熱性)이 우수한 수종을 대체 식재 수종으로 우선 선정·적용하는 방향으로 식재 계획을 조정하였다.`,
      summer: `③ 여름 입주 현장 (봄 식재 시행)\n\n봄철 식재 후 여름 입주가 이루어지는 현장은 식재 시점의 온도 조건이 비교적 온화하여 활착에 유리한 환경을 형성한다. 다만, 수목의 생육 안정성을 장기적으로 확보하기 위해서는 해당 지역의 기후 특성과 계절적 생육 조건에 부합하는 적합 수종 선정이 필수적이다. 이에 지역 생태 환경 및 봄철 식재 적정 수종 기준을 검토하여 현장 여건에 최적화된 대체 수종을 선별·적용함으로써 식재 품질의 균일성을 확보하는 계획을 반영하였다.`,
      spring: `④ 봄 입주 현장 (동절기 식재 시행)\n\n봄철 입주를 목표로 동절기에 식재가 시행되는 경우, 저온으로 인한 수목 고사(枯死) 위험을 최소화하기 위해 볏짚 피복, 수간 보온재 감기, 방풍망 설치 등 동해 방지를 위한 보온 조치를 의무적으로 병행하여야 한다. 아울러 동절기 저온 환경에서도 뿌리 활착 능력이 우수하고 내한성이 강한 수종을 대체 식재 수종으로 우선 도입함으로써, 혹한기 식재에 따른 하자 발생률을 효과적으로 저감하는 식재 계획을 수립하였다.`,
    }

    // 선택 현장의 입주일로 입주 계절 판별
    const selectedSite = sites.find((s) => s.id === selectedSiteId)
    const occupancyDate = selectedSite?.occupancy_date ? new Date(selectedSite.occupancy_date) : null
    let occupancySeason: string | null = null
    if (occupancyDate && !isNaN(occupancyDate.getTime())) {
      const m = occupancyDate.getMonth() + 1
      if (m >= 3 && m <= 5) occupancySeason = 'spring'
      else if (m >= 6 && m <= 8) occupancySeason = 'summer'
      else if (m >= 9 && m <= 11) occupancySeason = 'fall'
      else occupancySeason = 'winter'
    }

    // 식재 계절 = 입주 계절의 한 계절 전 (가을 식재 → 겨울 입주 등)
    const OCCUPANCY_TO_PLANTING_SEASON: Record<string, string> = {
      spring: 'winter', summer: 'spring', fall: 'summer', winter: 'fall',
    }

    let seasonalImpact: string
    if (occupancySeason && SEASONAL_IMPACT_BY_OCCUPANCY[occupancySeason]) {
      // 입주시기에 해당하는 계절 분석 한 가지만 표시
      seasonalImpact = SEASONAL_IMPACT_BY_OCCUPANCY[occupancySeason]
    } else {
      // 입주일이 없는 현장: 분석 불가 안내 (4계절 일괄 표시하지 않음)
      seasonalImpact = '현장 입주일(준공일) 데이터가 없어 입주시기 기준 식재 시기 분석을 수행할 수 없습니다. 현장 정보에 입주일을 등록해주세요.'
    }

    // 막대 차트도 입주시기에 대응하는 식재 계절 하나만 표시
    const plantingSeasonForOccupancy = occupancySeason
      ? OCCUPANCY_TO_PLANTING_SEASON[occupancySeason]
      : null
    const filteredSeasonStats = plantingSeasonForOccupancy
      ? seasonStats.filter((s) => s.season === plantingSeasonForOccupancy)
      : []

    setAiAnalysis({ riskLevel, recommendReason, effectSummary, actionGuide, seasonalImpact, seasonStats: filteredSeasonStats })
  }

  function generateAiAnalysis() {
    if (siteRows.length === 0) return
    setAiGenerating(true)
    setAiAnalysis(null)
    setTimeout(() => {
      computeAiAnalysis()
      setAiGenerating(false)
    }, 800)
  }

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

  // 고위험 대체 수종 일괄 적용 (장바구니 일괄 담기)
  function handleBulkApply() {
    if (!selectedSiteId) return
    const inputs: CartItemInput[] = []
    for (const row of tableRows) {
      const speciesAvgRateVal = row.speciesName && speciesAvgRate[row.speciesName] != null
        ? speciesAvgRate[row.speciesName] : null
      const isHighRisk = speciesAvgRateVal != null && speciesAvgRateVal >= 0.20
      if (!isHighRisk) continue
      if (row.substituteOptions.length === 0) continue
      if (!selectedSubstitutes[row.speciesName]) {
        const input = buildCartInput(row.speciesName, row.substituteOptions[0].name)
        if (input) inputs.push(input)
      }
    }
    if (inputs.length === 0) return
    startCartTransition(async () => {
      const res = await bulkUpsertCartItems(selectedSiteId, inputs)
      if (res.success) {
        setCartItems(res.cart.items)
        setCartStatus(res.cart.status)
      }
    })
  }

  const actionButtons = (
    <div className="flex items-center gap-2">
      <button
        onClick={generateAiAnalysis}
        disabled={aiGenerating || siteRows.length === 0}
        className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        <Sparkles className={`h-3.5 w-3.5 ${aiGenerating ? 'animate-spin' : ''}`} />
        {aiGenerating ? '분석 중...' : 'AI 분석 생성'}
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
  )

  return (
    <div className={hideHeader ? '' : 'space-y-0 -m-6'}>
      {!hideHeader && (
      <div className="bg-[#1a3a2a] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/10 flex items-center justify-center shrink-0">
            <Image src="/logo.png" alt="TreeCS" width={32} height={32} className="object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">조경 AI플랫폼 대시보드</h1>
        </div>
        {actionButtons}
      </div>
      )}
      {hideHeader && (
      <div className="bg-[#1a3a2a] text-white px-6 py-2.5 flex items-center justify-end">
        {actionButtons}
      </div>
      )}

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

            {/* KPI 카드 3개 */}
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
                <div className="text-xs text-gray-500 mb-1">개선 후 예상 하자율 <span className="text-green-600">(대체 적용 시)</span></div>
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
                <div className="text-xs text-gray-500 mb-1">절감 효과(%)</div>
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
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-600">전체 리스크 요약</span>
            <div className="flex items-center gap-1.5 ml-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                고위험 ≥ 20%
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                중위험 10~19%
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                저위험 &lt; 10%
              </span>
            </div>
          </div>
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

        {/* AI 분석 요약 */}
        <div className="border rounded-lg bg-white overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center gap-2">
            <Sparkles className={`h-4 w-4 ${aiAnalysis ? 'text-green-500' : 'text-gray-400'}`} />
            <span className="text-sm font-semibold text-gray-700">AI 분석 요약</span>
            {!aiAnalysis && !aiGenerating && (
              <span className="text-xs text-gray-400 ml-1">(AI 분석 생성 버튼 클릭 후 활성화 — 대체 수종 선택 시 자동 업데이트)</span>
            )}
            {aiGenerating && (
              <span className="text-xs text-blue-500 ml-1 animate-pulse">분석 생성 중...</span>
            )}
            {aiAnalysis && (
              <span className="text-xs text-green-600 ml-1">분석 완료 (대체 수종 변경 시 자동 갱신)</span>
            )}
          </div>
          <div className="grid grid-cols-4 divide-x text-xs">
            {/* 위험도 */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-orange-500' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>위험도</span>
              </div>
              {aiGenerating ? (
                <div className="space-y-1.5">
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                </div>
              ) : aiAnalysis ? (
                <p className="text-gray-700 leading-relaxed">{aiAnalysis.riskLevel}</p>
              ) : (
                <p className="text-gray-400 leading-relaxed">대체 수종 선택 결과를 반영한 현재 위험도를 표시합니다.</p>
              )}
            </div>

            {/* 추천 사유 */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-blue-500' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>추천 사유</span>
              </div>
              {aiGenerating ? (
                <div className="space-y-1.5">
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-3/5" />
                </div>
              ) : aiAnalysis ? (
                <p className="text-gray-700 leading-relaxed">{aiAnalysis.recommendReason}</p>
              ) : (
                <p className="text-gray-400 leading-relaxed">선택된 대체 수종의 하자율 개선 근거를 제시합니다.</p>
              )}
            </div>

            {/* 예상 절감 효과 */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingDown className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-green-500' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>예상 절감 효과</span>
              </div>
              {aiGenerating ? (
                <div className="space-y-1.5">
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                </div>
              ) : aiAnalysis ? (
                <p className="text-gray-700 leading-relaxed">{aiAnalysis.effectSummary}</p>
              ) : (
                <p className="text-gray-400 leading-relaxed">현재 선택 기준 실제 절감율 및 절감액을 안내합니다.</p>
              )}
            </div>

            {/* 권장 조치 */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <TreePine className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-emerald-600' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>권장 조치</span>
              </div>
              {aiGenerating ? (
                <div className="space-y-1.5">
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                  <div className="h-2.5 bg-gray-200 rounded animate-pulse w-3/5" />
                </div>
              ) : aiAnalysis ? (
                <p className="text-gray-700 leading-relaxed">{aiAnalysis.actionGuide}</p>
              ) : (
                <p className="text-gray-400 leading-relaxed">미선택 고위험 수종에 대한 권고 조치를 안내합니다.</p>
              )}
            </div>
          </div>

          {/* 식재 시기 영향 분석 — 하단 확장 영역 */}
          {(aiAnalysis || aiGenerating) && (
            <div className="border-t px-4 py-3 text-xs">
              <div className="flex items-center gap-1.5 mb-2">
                <Leaf className={`h-3.5 w-3.5 ${aiAnalysis ? 'text-green-500' : 'text-gray-400'}`} />
                <span className={`font-semibold ${aiAnalysis ? 'text-gray-700' : 'text-gray-600'}`}>식재 시기 영향 분석 — 시기별 하자 원인 분석 및 개선 방향</span>
              </div>
              {aiGenerating ? (
                <div className="flex gap-8">
                  <div className="space-y-1.5 flex-1">
                    <div className="h-2.5 bg-gray-200 rounded animate-pulse w-full" />
                    <div className="h-2.5 bg-gray-200 rounded animate-pulse w-4/5" />
                  </div>
                  <div className="space-y-1.5 w-48">
                    <div className="h-3 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>
              ) : aiAnalysis ? (
                <div className="flex gap-8 items-start">
                  <div className="text-gray-700 leading-relaxed flex-1 space-y-3">
                    {aiAnalysis.seasonalImpact.split('\n\n').map((para, i) => (
                      <p key={i} className={i === 0 ? 'font-semibold text-gray-800' : ''}>{para}</p>
                    ))}
                  </div>
                  {aiAnalysis.seasonStats.length > 0 && (
                    <div className="space-y-1.5 w-52 shrink-0">
                      <p className="text-[11px] text-gray-400 mb-1">식재 계절 하자율 (입주시기 기준)</p>
                      {(() => {
                        // 입주시기에 대응하는 식재 계절 1건만 표시 — 하자율 수준 기준 색상
                        return aiAnalysis.seasonStats.map((s) => {
                          const isHigh = s.rate >= 0.20
                          const isMid = s.rate >= 0.10 && s.rate < 0.20
                          const barColor = isHigh ? 'bg-red-400' : isMid ? 'bg-orange-400' : 'bg-green-400'
                          const textColor = isHigh ? 'text-red-600' : isMid ? 'text-orange-500' : 'text-gray-600'
                          // 폭: 25%를 만점으로 환산 (시각적 비교 기준)
                          const widthPct = Math.min(Math.round((s.rate / 0.25) * 100), 100)
                          return (
                            <div key={s.season} className="flex items-center gap-2">
                              <span className="w-6 text-gray-500 shrink-0">{s.label}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                                <div
                                  className={`h-3 rounded-full transition-all duration-500 ${barColor}`}
                                  style={{ width: `${widthPct}%` }}
                                />
                              </div>
                              <span className={`w-10 text-right font-medium shrink-0 ${textColor}`}>
                                {(s.rate * 100).toFixed(1)}%
                              </span>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* 시뮬레이션 테이블 */}
        <div className="border rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">수종별 하자율 저감 시뮬레이션</span>
              <span className="text-xs text-gray-400">{loadingRows ? '데이터 불러오는 중...' : `총 ${tableRows.length}종`}</span>
            </div>
            <div className="flex items-center gap-3">
              {tableRows.length > 0 && (
                <button
                  onClick={handleBulkApply}
                  className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded transition-colors font-medium"
                >
                  <Sparkles className="h-3 w-3" />
                  고위험 대체 수종 일괄 적용
                </button>
              )}
              <div className="flex items-center gap-3 text-xs">
                {[{ dot: 'bg-red-500', label: '고위험' }, { dot: 'bg-orange-400', label: '중위험' }, { dot: 'bg-green-500', label: '저위험' }, { dot: 'bg-gray-300', label: '유지 관리' }].map((item) => (
                  <div key={item.label} className="flex items-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${item.dot}`} />
                    <span className="text-gray-500">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1a3a2a] text-white">
                  {TABLE_HEADERS.map((h) => (
                    <th key={h.label} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {h.label}
                        {h.hint && <HeaderHint text={h.hint} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-gray-400">
                      {loadingRows ? '데이터 불러오는 중...' : '현장을 선택하면 수목 데이터가 표시됩니다.'}
                    </td>
                  </tr>
                ) : tableRows.map((row, idx) => {
                  const speciesAvgRateVal = row.speciesName && speciesAvgRate[row.speciesName] != null
                    ? speciesAvgRate[row.speciesName] : null
                  const risk = riskConfig(speciesAvgRateVal)
                  // 수목하자율 기준 고위험(≥20%)만 대체 수종 선택 표시
                  const isHighRisk = speciesAvgRateVal != null && speciesAvgRateVal >= 0.20
                  const hasSubOptions = row.substituteOptions.length > 0
                  const speciesAvgRatePct = speciesAvgRateVal != null
                    ? (speciesAvgRateVal * 100).toFixed(2) + '%' : '-'
                  const originalRatePct = row.expected_defect_rate != null ? (row.expected_defect_rate * 100).toFixed(2) + '%' : '-'
                  const improvedRatePct = row.improvedRate != null ? (row.improvedRate * 100).toFixed(2) + '%' : '-'
                  const reductionPct = row.reduction != null && row.reduction > 0 ? '▼ ' + (row.reduction * 100).toFixed(2) + '%p' : '-'

                  return (
                    <tr key={row.id} className={idx % 2 === 1 ? 'bg-gray-50' : ''}>
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">{row.speciesName || '-'}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.quantity_planted.toLocaleString()}</td>
                      <td className={`px-3 py-2 text-right font-medium text-gray-700`}>{originalRatePct}</td>
                      <td className={`px-3 py-2 text-right font-medium ${risk.color}`}>{speciesAvgRatePct}</td>
                      <td className="px-3 py-2">
                        {speciesAvgRateVal != null ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${risk.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                            {risk.label}
                          </span>
                        ) : row.expected_defect_rate != null ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${riskConfig(row.expected_defect_rate).badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${riskConfig(row.expected_defect_rate).dot}`} />
                            {riskConfig(row.expected_defect_rate).label}
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-3 py-2">
                        {isHighRisk ? (
                          hasSubOptions ? (
                            <div className="flex items-center gap-1.5">
                              <div className="relative">
                                <select
                                  value={row.selectedSubstituteName ?? ''}
                                  disabled={cartStatus === 'confirmed' || isCartPending}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    if (val) handleAddToCart(row.speciesName, val)
                                    else handleRemoveFromCart(row.speciesName)
                                  }}
                                  className="text-xs border border-dashed border-red-400 rounded px-2 py-1 pr-6 appearance-none bg-white focus:outline-none focus:border-red-500 min-w-[130px] disabled:opacity-60"
                                >
                                  <option value="">{row.speciesName} 대체 수종 선택</option>
                                  {row.substituteOptions.map((opt) => (
                                    <option key={opt.name} value={opt.name}>
                                      {opt.isAuto ? '▷ ' : ''}{opt.name} ({(opt.rate * 100).toFixed(1)}%){opt.isAuto ? ' *추천' : ''}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                              </div>
                              {row.selectedSubstituteName && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-green-50 text-green-700 border-green-200 whitespace-nowrap">
                                  담김
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-red-400 px-2 py-1 bg-red-50 rounded border border-red-200">
                              대체 수종 미등록
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-gray-400 px-2 py-1 bg-gray-100 rounded">
                            유지 관리
                          </span>
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
                        ) : isHighRisk ? (
                          <span className="px-2 py-0.5 rounded text-xs text-gray-500 bg-gray-100">대체 수종 선택</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs text-gray-400 bg-gray-100">유지 관리</span>
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

        {/* 대체 결정 장바구니 패널 */}
        {siteRows.length > 0 && (
          <CartPanel
            items={optimisticItems}
            status={cartStatus}
            pending={isCartPending}
            subMap={subMap}
            originalWeightedRate={originalWeightedRate}
            improvedWeightedRate={improvedWeightedRate}
            reductionEffect={reductionEffect}
            costReduction={costReduction}
            onReplace={handleAddToCart}
            onRemove={handleRemoveFromCart}
            onClear={handleClearCart}
            onConfirm={handleConfirmCart}
          />
        )}
      </div>
    </div>
  )
}
