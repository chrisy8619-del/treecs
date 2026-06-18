'use client'

import { useState, useMemo } from 'react'
import { Leaf, Star, Search } from 'lucide-react'
import { adjustedRate } from '@/lib/defect-rate'

// ─── 타입 ───────────────────────────────────────────────────────────
export type AltSpeciesRec = {
  species_name: string
  region: string
  season: string
  substitute1: string | null
  substitute2: string | null
  substitute3: string | null
}

export type SpeciesStatForFinder = {
  speciesNameKo: string
  groupName: string | null
  totalQty: number
  defectRate: number
}

type Season = '봄' | '여름' | '가을' | '겨울'
type Purpose = '전체' | '상록' | '꽃나무' | '녹음수'
type SizeClass = '전체' | '소형' | '중형' | '대형'
type SpecialCond = '해당 없음' | '내염성' | '내한성' | '내건성' | '음지'

// ─── 상수 ─────────────────────────────────────────────────────────
const SEASONS: Season[] = ['봄', '여름', '가을', '겨울']

const REGION_GROUPS: { label: string; regions: string[] }[] = [
  { label: '수도권 (서울/경기/인천)', regions: ['서울', '경기', '인천'] },
  { label: '충청권 (충남/충북/세종)', regions: ['충남', '충북', '세종'] },
  { label: '강원', regions: ['강원'] },
  { label: '영남권 (부산/울산/경남)', regions: ['부산', '울산', '경남'] },
  { label: '대구/경북', regions: ['대구', '경북'] },
  { label: '호남권 (광주/전남/전북)', regions: ['광주', '전남', '전북'] },
]

const PURPOSES: { id: Purpose; label: string }[] = [
  { id: '전체', label: '전체' },
  { id: '상록', label: '상록' },
  { id: '꽃나무', label: '꽃나무' },
  { id: '녹음수', label: '녹음수' },
]

const SIZE_OPTIONS: { id: SizeClass; label: string }[] = [
  { id: '전체', label: '전체 규격' },
  { id: '소형', label: '소형 (R6 이하 / H2.0 이하)' },
  { id: '중형', label: '중형 (R8~R10 / H2.5~3.0)' },
  { id: '대형', label: '대형 (R12 이상 / H3.5 이상)' },
]

const SPECIAL_OPTIONS: SpecialCond[] = ['해당 없음', '내염성', '내한성', '내건성', '음지']

// 수종별 분류 매핑 (상록/낙엽 + 침엽/활엽)
const SPECIES_TYPE_MAP: Record<string, string> = {
  '에메랄드골드': '상록침엽', '에메랄드그린': '상록침엽', '서양측백': '상록침엽',
  '주목': '상록침엽', '선주목': '상록침엽', '주목(선주목)': '상록침엽',
  '소나무': '상록침엽', '소나무(둥근형)': '상록침엽', '소나무(조형)': '상록침엽', '소나무(특수목)': '상록침엽',
  '잣나무': '상록침엽', '섬잣나무': '상록침엽', '스트로브잣나무': '상록침엽',
  '전나무': '상록침엽', '전나무(젓나무)': '상록침엽', '독일가문비': '상록침엽',
  '편백': '상록침엽', '실화백': '상록침엽', '향나무': '상록침엽', '가이즈까향나무': '상록침엽',
  '스카이로켓향나무': '상록침엽', '반송': '상록침엽', '오엽송': '상록침엽',
  '금송': '상록침엽', '반펜치블루': '상록침엽', '문그로우': '상록침엽', '블루엔젤': '상록침엽',
  '곰솔': '상록침엽', '백송': '상록침엽', '측백나무': '상록침엽',
  '동백나무': '상록활엽', '애기동백': '상록활엽', '애기동백나무': '상록활엽',
  '후박나무': '상록활엽', '후피향나무': '상록활엽', '태산목': '상록활엽',
  '가시나무': '상록활엽', '굴거리나무': '상록활엽', '좀굴거리나무': '상록활엽',
  '돈나무': '상록활엽', '은목서': '상록활엽', '금목서': '상록활엽',
  '홍가시나무': '상록활엽', '호랑가시나무': '상록활엽', '사철나무': '상록활엽',
  '꽝꽝나무': '상록활엽', '아왜나무': '상록활엽', '다정큼나무': '상록활엽',
  '먼나무': '상록활엽', '소사나무': '상록활엽',
  '느티나무': '낙엽활엽교목', '팽나무': '낙엽활엽교목', '팽나무(제주)': '낙엽활엽교목',
  '회화나무': '낙엽활엽교목', '은행나무': '낙엽활엽교목',
  '메타세쿼이아': '낙엽침엽', '메타세퀘이아': '낙엽침엽',
  '낙우송': '낙엽침엽',
  '왕벚나무': '낙엽봄꽃', '겹벚나무': '낙엽봄꽃', '수양벚나무': '낙엽봄꽃',
  '목련': '낙엽봄꽃', '백목련': '낙엽봄꽃', '함박꽃나무': '낙엽봄꽃',
  '산수유': '낙엽봄꽃', '이팝나무': '낙엽봄꽃', '때죽나무': '낙엽봄꽃',
  '귀룽나무': '낙엽봄꽃', '박태기나무': '낙엽봄꽃', '수수꽃다리': '낙엽봄꽃',
  '꽃복숭아': '낙엽봄꽃', '살구나무': '낙엽봄꽃', '매화나무': '낙엽봄꽃',
  '서부해당화': '낙엽봄꽃', '앵도나무': '낙엽봄꽃',
  '배롱나무': '낙엽여름꽃', '무궁화': '낙엽여름꽃', '모감주나무': '낙엽여름꽃',
  '칠자화': '낙엽여름꽃',
  '단풍나무': '낙엽단풍', '당단풍': '낙엽단풍', '홍단풍': '낙엽단풍',
  '청단풍': '낙엽단풍', '공작단풍': '낙엽단풍', '중국단풍': '낙엽단풍',
  '신나무': '낙엽단풍', '복자기': '낙엽단풍', '캐나다단풍': '낙엽단풍',
  '계수나무': '낙엽단풍', '자작나무': '낙엽단풍', '마가목': '낙엽단풍',
  '대왕참나무': '낙엽활엽교목', '상수리나무': '낙엽활엽교목', '물푸레나무': '낙엽활엽교목',
  '목백합': '낙엽활엽교목', '튜립나무': '낙엽활엽교목', '층층나무': '낙엽활엽교목',
  '서어나무': '낙엽활엽교목', '칠엽수': '낙엽활엽교목', '노각나무': '낙엽활엽교목',
  '쉬나무': '낙엽활엽교목', '피나무': '낙엽활엽교목', '느릅나무': '낙엽활엽교목',
  '미루나무': '낙엽활엽교목', '미국풍나무': '낙엽활엽교목', '헛개나무': '낙엽활엽교목',
  '고로쇠나무': '낙엽활엽교목', '수양버들': '낙엽활엽교목', '삼색버들': '낙엽활엽교목',
  '가래나무': '낙엽활엽교목', '오죽': '대나무류', '대나무': '대나무류',
  '당종려나무': '야자류', '종려나무': '야자류',
  '감나무': '유실수', '대추나무': '유실수', '모과나무': '유실수',
  '사과나무': '유실수', '복숭아': '유실수', '자두': '유실수', '자엽자두': '유실수',
  '뽕나무': '유실수', '보리수': '유실수', '아로니아': '유실수',
  '꽃사과': '유실수', '산사나무': '유실수', '산딸나무': '유실수',
  '팥배나무': '낙엽활엽교목', '윤노리나무': '낙엽활엽교목', '개회나무': '낙엽봄꽃',
  '쪽동백': '낙엽봄꽃', '자엽안개나무': '낙엽활엽교목',
  '참빗살나무': '낙엽활엽교목', '화살나무': '낙엽활엽관목',
  '홍매자나무': '낙엽활엽관목', '멀구슬나무': '낙엽활엽교목',
}

// purpose 필터 로직
function matchPurpose(type: string, purpose: Purpose): boolean {
  if (purpose === '전체') return true
  if (purpose === '상록') return type.startsWith('상록')
  if (purpose === '꽃나무') return type.includes('봄꽃') || type.includes('여름꽃')
  if (purpose === '녹음수') return type.includes('활엽교목') || type === '낙엽침엽'
  return true
}

// 하자율 보정은 공통 유틸(@/lib/defect-rate)의 adjustedRate를 사용한다.
const DEFAULT_AVG = 0.15

// 순위 배지 색상
function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'bg-yellow-400 text-white'
  if (rank === 2) return 'bg-gray-300 text-gray-700'
  if (rank === 3) return 'bg-amber-600 text-white'
  return 'bg-gray-100 text-gray-500'
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────
type Props = {
  altRecs: AltSpeciesRec[]
  speciesStats: SpeciesStatForFinder[]
}

type RecommendResult = {
  rank: number
  name: string
  type: string
  avgQty: number
  defectRate: number
  adjustedRate: number
  isTopPick: boolean
  score: number
}

export function SpeciesFinderTab({ altRecs, speciesStats }: Props) {
  const [season, setSeason] = useState<Season>('봄')
  const [regionGroup, setRegionGroup] = useState<string>(REGION_GROUPS[0].label)
  const [purpose, setPurpose] = useState<Purpose>('전체')
  const [sizeClass, setSizeClass] = useState<SizeClass>('전체')
  const [specialCond, setSpecialCond] = useState<SpecialCond>('해당 없음')
  const [searched, setSearched] = useState(false)
  const [results, setResults] = useState<RecommendResult[]>([])

  // 수종별 하자율 맵
  const statsMap = useMemo(() => {
    const m = new Map<string, SpeciesStatForFinder>()
    for (const s of speciesStats) m.set(s.speciesNameKo, s)
    return m
  }, [speciesStats])

  // 선택 지역 목록
  const selectedRegions = useMemo(() => {
    return REGION_GROUPS.find((g) => g.label === regionGroup)?.regions ?? []
  }, [regionGroup])

  function handleSearch() {
    // 1. 해당 지역+계절에 대체수종으로 등장하는 수종 집계
    const candidateScore = new Map<string, number>()

    for (const rec of altRecs) {
      if (!selectedRegions.includes(rec.region)) continue
      if (rec.season !== season) continue
      const subs = [rec.substitute1, rec.substitute2, rec.substitute3].filter((s): s is string => !!s)
      subs.forEach((name, idx) => {
        const score = 3 - idx  // 1순위=3점, 2순위=2점, 3순위=1점
        candidateScore.set(name, (candidateScore.get(name) ?? 0) + score)
      })
    }

    // 2. 수종 분류 필터
    const filtered = Array.from(candidateScore.entries()).filter(([name]) => {
      const type = SPECIES_TYPE_MAP[name] ?? '기타'
      return matchPurpose(type, purpose)
    })

    // 3. 하자율 기반 정렬 (낮은 순) + 추천 점수 복합
    const withStats = filtered.map(([name, score]) => {
      const stat = statsMap.get(name)
      const qty = stat?.totalQty ?? 0
      const defectQty = stat ? Math.round(stat.defectRate * stat.totalQty) : 0
      const adjusted = stat ? adjustedRate(defectQty, qty) : DEFAULT_AVG
      const defectRate = stat?.defectRate ?? DEFAULT_AVG
      return {
        name,
        type: SPECIES_TYPE_MAP[name] ?? '기타',
        avgQty: Math.round(qty / Math.max(1, speciesStats.filter((s) => s.speciesNameKo === name).length)),
        defectRate,
        adjustedRate: adjusted,
        score,
        isTopPick: false,
      }
    }).sort((a, b) => {
      // 하자율 낮은 순 우선, 동률이면 추천점수 높은 순
      if (Math.abs(a.adjustedRate - b.adjustedRate) > 0.005) return a.adjustedRate - b.adjustedRate
      return b.score - a.score
    }).slice(0, 5).map((r, i) => ({ ...r, rank: i + 1, isTopPick: i < 3 }))

    setResults(withStats)
    setSearched(true)
  }

  const seasonLabel = `${season} 입주 · ${regionGroup.split('(')[0].trim()} · Top ${results.length || 5}`

  return (
    <div className="flex gap-5">
      {/* 좌측 조건 입력 패널 */}
      <div className="w-[280px] shrink-0 bg-white border rounded-xl p-5 space-y-5 self-start">
        <div className="flex items-center gap-2">
          <Leaf className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold text-gray-800">현장 조건 입력</span>
        </div>

        {/* 입주 예정 계절 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">입주 예정 계절</label>
          <div className="flex gap-2 flex-wrap">
            {SEASONS.map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  season === s
                    ? 'bg-[#1a3a2a] text-white border-[#1a3a2a]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* 현장 지역 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">현장 지역</label>
          <select
            value={regionGroup}
            onChange={(e) => setRegionGroup(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-green-500 text-gray-700"
          >
            {REGION_GROUPS.map((g) => (
              <option key={g.label} value={g.label}>{g.label}</option>
            ))}
          </select>
        </div>

        {/* 식재 목적 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">식재 목적</label>
          <div className="flex gap-2 flex-wrap">
            {PURPOSES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPurpose(p.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                  purpose === p.id
                    ? 'bg-[#1a3a2a] text-white border-[#1a3a2a]'
                    : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 선호 규격 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">선호 규격</label>
          <select
            value={sizeClass}
            onChange={(e) => setSizeClass(e.target.value as SizeClass)}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-green-500 text-gray-700"
          >
            {SIZE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* 특이 조건 */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">특이 조건</label>
          <select
            value={specialCond}
            onChange={(e) => setSpecialCond(e.target.value as SpecialCond)}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-green-500 text-gray-700"
          >
            {SPECIAL_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        {/* 추천 버튼 */}
        <button
          onClick={handleSearch}
          className="w-full flex items-center justify-center gap-2 bg-[#1a3a2a] hover:bg-[#24503a] text-white text-sm font-semibold py-3 rounded-xl transition-colors"
        >
          <Search className="h-4 w-4" />
          맞춤 수종 추천받기
        </button>
      </div>

      {/* 우측 추천 결과 */}
      <div className="flex-1 bg-white border rounded-xl overflow-hidden self-start">
        {/* 헤더 */}
        <div className="px-5 py-3.5 border-b flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">추천 결과</span>
          {searched && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#1a3a2a] font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                {season} 입주
              </span>
              <span className="text-xs text-gray-500">·</span>
              <span className="text-xs text-gray-500">{regionGroup.split('(')[0].trim()}</span>
              <span className="text-xs text-gray-500">·</span>
              <span className="text-xs text-gray-500">Top {results.length}</span>
            </div>
          )}
        </div>

        {/* 결과 없는 상태 */}
        {!searched && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-2">
            <Leaf className="h-10 w-10 text-gray-200" />
            <p className="text-sm">현장 조건을 입력하고 추천받기 버튼을 누르세요.</p>
            <p className="text-xs text-gray-300">3년간 하자 데이터 기반으로 최적 수종을 추천해드립니다</p>
          </div>
        )}

        {searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-2">
            <p className="text-sm">조건에 맞는 추천 수종이 없습니다.</p>
            <p className="text-xs text-gray-300">지역 또는 계절 조건을 변경해보세요.</p>
          </div>
        )}

        {/* 결과 목록 */}
        {searched && results.length > 0 && (
          <div className="divide-y">
            {results.map((r) => {
              const defectPct = (r.adjustedRate * 100).toFixed(2)
              return (
                <div key={r.name} className="flex items-center px-5 py-4 hover:bg-gray-50 transition-colors">
                  {/* 순위 배지 */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mr-4 ${rankBadgeClass(r.rank)}`}>
                    {r.rank}
                  </div>

                  {/* 수종 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{r.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {r.type}
                      {r.avgQty > 0 && ` · 평균 식재 ${r.avgQty.toLocaleString()}주`}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {r.type && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                          r.type.startsWith('상록') ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {r.type}
                        </span>
                      )}
                      {r.isTopPick && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-yellow-50 text-yellow-700 border-yellow-200">
                          <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                          최적 추천
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 하자율 */}
                  <div className="text-right shrink-0">
                    <div className={`text-xl font-bold ${r.adjustedRate < 0.10 ? 'text-green-600' : r.adjustedRate < 0.20 ? 'text-orange-500' : 'text-red-500'}`}>
                      {defectPct}%
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">기준 하자율</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 하단 안내 */}
        {searched && results.length > 0 && (
          <div className="px-5 py-2.5 bg-gray-50 border-t text-[10px] text-gray-400">
            ※ 하자율은 전체 식재 데이터 기반 보정 하자율입니다. 현장 조건에 따라 실제 결과는 다를 수 있습니다.
          </div>
        )}
      </div>
    </div>
  )
}
