# Species Stats Tab — 수종 관리 수목 현황 탭 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수종 관리 페이지에 "수목 현황" 탭을 추가해, 수종별 식재 주수·하자율·리스크·관리 방향을 테이블로 제공하고 수종 등록 시 실시간 반영되도록 한다.

**Architecture:** 기존 서버 컴포넌트인 `species/page.tsx`를 탭 컨테이너로 재구성하고, 목록 탭(`SpeciesListTab`)과 현황 탭(`SpeciesStatsTab`)을 클라이언트 컴포넌트로 분리한다. `page.tsx`에서 두 탭에 필요한 데이터를 한 번에 fetch해 props로 내려주며, `revalidatePath('/species')`가 이미 존재하므로 수종 등록 즉시 서버 재렌더로 반영된다.

**Tech Stack:** Next.js App Router (서버/클라이언트 컴포넌트), Supabase, Tailwind CSS, shadcn/ui, lucide-react

---

## 파일 구조

| 파일 | 역할 | 변경 여부 |
|------|------|-----------|
| `src/app/(dashboard)/species/page.tsx` | 서버 컴포넌트 — 데이터 fetch + 탭 레이아웃 | **수정** |
| `src/app/(dashboard)/species/species-list-tab.tsx` | 기존 수종 목록 테이블 (page.tsx에서 분리) | **신규** |
| `src/app/(dashboard)/species/species-stats-tab.tsx` | 수목 현황 탭 — 필터·검색·테이블 | **신규** |
| `src/app/(dashboard)/species/species-tabs.tsx` | 탭 전환 클라이언트 컴포넌트 | **신규** |
| `src/app/(dashboard)/species/create-species-dialog.tsx` | 수종 등록 다이얼로그 | **변경 없음** |
| `src/app/(dashboard)/species/toggle-button.tsx` | 활성/비활성 토글 버튼 | **변경 없음** |
| `src/app/(dashboard)/species/delete-button.tsx` | 삭제 버튼 | **변경 없음** |

---

## Task 1: species-list-tab.tsx 생성 (기존 목록 UI 분리)

**Files:**
- Create: `src/app/(dashboard)/species/species-list-tab.tsx`

기존 `page.tsx`의 목록 테이블 JSX를 그대로 이 컴포넌트로 추출한다.

- [ ] **Step 1: species-list-tab.tsx 파일 생성**

```tsx
// src/app/(dashboard)/species/species-list-tab.tsx
import { SpeciesToggleButton } from './toggle-button'
import { SpeciesDeleteButton } from './delete-button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type SpeciesGroup = { group_name: string } | null
type Species = {
  id: string
  species_name_ko: string
  species_name_en: string | null
  species_code: string
  scientific_name: string | null
  is_active: boolean
  species_groups: SpeciesGroup | SpeciesGroup[]
}

type Props = {
  species: Species[]
  isSuperadmin: boolean
}

export function SpeciesListTab({ species, isSuperadmin }: Props) {
  const active = species.filter((s) => s.is_active)
  const inactive = species.filter((s) => !s.is_active)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          수종 목록
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            활성 {active.length}종 · 비활성 {inactive.length}종
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {species.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>수종명(한글)</TableHead>
                <TableHead>수종코드</TableHead>
                <TableHead>수종명(영문)</TableHead>
                <TableHead>학명</TableHead>
                <TableHead>그룹</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {species.map((s) => {
                const group = Array.isArray(s.species_groups)
                  ? s.species_groups[0]
                  : s.species_groups
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.species_name_ko}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{s.species_code}</TableCell>
                    <TableCell>{s.species_name_en ?? '-'}</TableCell>
                    <TableCell className="italic text-sm">{s.scientific_name ?? '-'}</TableCell>
                    <TableCell>{group?.group_name ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? 'default' : 'outline'}>
                        {s.is_active ? '활성' : '비활성'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <SpeciesToggleButton id={s.id} isActive={s.is_active} />
                        {isSuperadmin && <SpeciesDeleteButton id={s.id} />}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">등록된 수종이 없습니다.</p>
            <p className="text-xs mt-1">우측 상단 &apos;수종 등록&apos; 버튼으로 추가하세요.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: 저장 확인** — 파일이 올바르게 생성됐는지 확인한다.

---

## Task 2: species-stats-tab.tsx 생성 (수목 현황 탭 UI)

**Files:**
- Create: `src/app/(dashboard)/species/species-stats-tab.tsx`

리스크 기준: 위험 ≥35%, 주의 20~35%, 보통 10~20%, 양호 <10%

- [ ] **Step 1: species-stats-tab.tsx 파일 생성**

```tsx
// src/app/(dashboard)/species/species-stats-tab.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type SpeciesStat = {
  speciesNameKo: string
  groupName: string | null
  totalQty: number
  defectRate: number  // 0.0 ~ 1.0 소수
}

type RiskLevel = '위험' | '주의' | '보통' | '양호'

function getRisk(rate: number): RiskLevel {
  if (rate >= 0.35) return '위험'
  if (rate >= 0.20) return '주의'
  if (rate >= 0.10) return '보통'
  return '양호'
}

function getRiskColor(risk: RiskLevel) {
  switch (risk) {
    case '위험': return { text: 'text-red-500', bg: 'bg-red-500', dot: 'bg-red-500' }
    case '주의': return { text: 'text-orange-400', bg: 'bg-orange-400', dot: 'bg-orange-400' }
    case '보통': return { text: 'text-blue-500', bg: 'bg-blue-500', dot: 'bg-blue-500' }
    case '양호': return { text: 'text-green-500', bg: 'bg-green-500', dot: 'bg-green-500' }
  }
}

function getManagement(risk: RiskLevel): string {
  switch (risk) {
    case '위험': return '대체 수종 검토 필요'
    case '주의': return '모니터링 강화'
    case '보통': return '정기 관리'
    case '양호': return '적극 권장'
  }
}

const RISK_FILTERS: Array<{ label: string; value: RiskLevel | '전체' }> = [
  { label: '전체', value: '전체' },
  { label: '위험', value: '위험' },
  { label: '주의', value: '주의' },
  { label: '보통', value: '보통' },
  { label: '양호', value: '양호' },
]

type Props = {
  stats: SpeciesStat[]
}

export function SpeciesStatsTab({ stats }: Props) {
  const [filter, setFilter] = useState<RiskLevel | '전체'>('전체')
  const [search, setSearch] = useState('')

  const filtered = stats
    .filter((s) => filter === '전체' || getRisk(s.defectRate) === filter)
    .filter((s) => s.speciesNameKo.includes(search))
    .sort((a, b) => b.defectRate - a.defectRate)

  // 프로그레스 바 최대값: 가장 높은 하자율 기준 (최소 0.5)
  const maxRate = Math.max(...stats.map((s) => s.defectRate), 0.5)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">수목 현황</CardTitle>
        <p className="text-xs text-muted-foreground">전체 수종 하자율 분석 · 리스크 4단계 분류</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 필터 + 검색 */}
        <div className="flex items-center gap-2 flex-wrap">
          {RISK_FILTERS.map(({ label, value }) => {
            const isActive = filter === value
            const riskColor =
              value !== '전체' ? getRiskColor(value as RiskLevel) : null
            return (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                  isActive
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                }`}
              >
                {riskColor && (
                  <span className={`w-2 h-2 rounded-full ${riskColor.dot}`} />
                )}
                {label}
              </button>
            )
          })}
          <input
            type="text"
            placeholder="수종명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-2 h-8 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 w-40"
          />
        </div>

        {/* 테이블 */}
        {filtered.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/5">수종명</TableHead>
                <TableHead className="w-1/6">분류</TableHead>
                <TableHead className="w-1/8">식재 주수</TableHead>
                <TableHead className="w-1/8">하자율</TableHead>
                <TableHead className="w-1/4">비율</TableHead>
                <TableHead className="w-1/10">리스크</TableHead>
                <TableHead>관리 방향</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const risk = getRisk(s.defectRate)
                const color = getRiskColor(risk)
                const barWidth = (s.defectRate / maxRate) * 100
                const ratePercent = (s.defectRate * 100).toFixed(2)

                return (
                  <TableRow key={s.speciesNameKo}>
                    <TableCell className="font-medium">{s.speciesNameKo}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {s.groupName ?? '-'}
                    </TableCell>
                    <TableCell className="text-sm">{s.totalQty.toLocaleString()}주</TableCell>
                    <TableCell className={`font-semibold ${color.text}`}>
                      {ratePercent}%
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 w-32 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`absolute left-0 top-0 h-full rounded-full ${color.bg}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {(s.defectRate * 100).toFixed(1)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${color.text}`}>{risk}</span>
                    </TableCell>
                    <TableCell className={`text-sm ${color.text}`}>
                      {getManagement(risk)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">
              {stats.length === 0
                ? '식재 기록이 있는 수종이 없습니다.'
                : '검색 조건에 맞는 수종이 없습니다.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: 저장 확인** — 파일이 올바르게 생성됐는지 확인한다.

---

## Task 3: species-tabs.tsx 생성 (탭 전환 클라이언트 컴포넌트)

**Files:**
- Create: `src/app/(dashboard)/species/species-tabs.tsx`

settings-layout.tsx의 탭 패턴을 그대로 따른다. `useState`로 탭 전환, 두 탭 컴포넌트에 props 전달.

- [ ] **Step 1: species-tabs.tsx 파일 생성**

```tsx
// src/app/(dashboard)/species/species-tabs.tsx
'use client'

import { useState } from 'react'
import { List, BarChart2 } from 'lucide-react'
import { SpeciesListTab } from './species-list-tab'
import { SpeciesStatsTab, type SpeciesStat } from './species-stats-tab'

type SpeciesGroup = { group_name: string } | null
type Species = {
  id: string
  species_name_ko: string
  species_name_en: string | null
  species_code: string
  scientific_name: string | null
  is_active: boolean
  species_groups: SpeciesGroup | SpeciesGroup[]
}

type Props = {
  species: Species[]
  stats: SpeciesStat[]
  isSuperadmin: boolean
}

type TabId = 'list' | 'stats'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'list', label: '수종 목록', icon: <List className="h-4 w-4" /> },
  { id: 'stats', label: '수목 현황', icon: <BarChart2 className="h-4 w-4" /> },
]

export function SpeciesTabs({ species, stats, isSuperadmin }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('list')

  return (
    <div className="space-y-4">
      {/* 탭 버튼 */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      {activeTab === 'list' && (
        <SpeciesListTab species={species} isSuperadmin={isSuperadmin} />
      )}
      {activeTab === 'stats' && (
        <SpeciesStatsTab stats={stats} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 저장 확인** — 파일이 올바르게 생성됐는지 확인한다.

---

## Task 4: page.tsx 수정 (데이터 fetch 확장 + 탭 컨테이너 연결)

**Files:**
- Modify: `src/app/(dashboard)/species/page.tsx`

`planting_records`에서 수종별 식재량·하자율을 집계해 `SpeciesStat[]`로 변환 후 `SpeciesTabs`에 전달한다. 기존 목록 렌더 JSX는 `SpeciesListTab`으로 이관됐으므로 제거한다.

- [ ] **Step 1: page.tsx 전체 교체**

```tsx
// src/app/(dashboard)/species/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateSpeciesDialog } from './create-species-dialog'
import { SpeciesTabs } from './species-tabs'
import type { SpeciesStat } from './species-stats-tab'

export default async function SpeciesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: species }, { data: groups }, { data: profile }, { data: plantingData }] =
    await Promise.all([
      supabase
        .from('species')
        .select('id, species_name_ko, species_name_en, species_code, scientific_name, is_active, species_groups(group_name)')
        .order('species_name_ko'),
      supabase
        .from('species_groups')
        .select('id, group_name, group_code')
        .order('group_name'),
      supabase.from('profiles').select('role').eq('id', user.id).single(),
      supabase
        .from('planting_records')
        .select('quantity_planted, expected_defect_qty, species(species_name_ko, species_groups(group_name))')
        .not('expected_defect_qty', 'is', null),
    ])

  const isSuperadmin = profile?.role === 'superadmin'

  // 수종별 집계 → SpeciesStat[]
  const aggMap = new Map<string, { groupName: string | null; totalQty: number; totalDefectQty: number }>()
  for (const row of plantingData ?? []) {
    const sp = Array.isArray(row.species) ? row.species[0] : row.species
    const name = (sp as { species_name_ko: string; species_groups?: { group_name: string } | null } | null)?.species_name_ko
    if (!name) continue
    const groupRaw = (sp as { species_groups?: { group_name: string } | { group_name: string }[] | null })?.species_groups
    const groupName = Array.isArray(groupRaw) ? (groupRaw[0]?.group_name ?? null) : (groupRaw?.group_name ?? null)
    const prev = aggMap.get(name) ?? { groupName, totalQty: 0, totalDefectQty: 0 }
    aggMap.set(name, {
      groupName: prev.groupName ?? groupName,
      totalQty: prev.totalQty + (row.quantity_planted ?? 0),
      totalDefectQty: prev.totalDefectQty + (row.expected_defect_qty ?? 0),
    })
  }

  const stats: SpeciesStat[] = Array.from(aggMap.entries())
    .filter(([, v]) => v.totalQty > 0)
    .map(([speciesNameKo, v]) => ({
      speciesNameKo,
      groupName: v.groupName,
      totalQty: v.totalQty,
      defectRate: v.totalDefectQty / v.totalQty,
    }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">수종 관리</h2>
          <p className="text-muted-foreground">수목 수종 마스터 데이터를 관리합니다.</p>
        </div>
        <CreateSpeciesDialog groups={groups ?? []} />
      </div>

      <SpeciesTabs
        species={species ?? []}
        stats={stats}
        isSuperadmin={isSuperadmin}
      />
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 타입 에러 확인**

`npx tsc --noEmit` 실행 후 에러가 없는지 확인한다. 타입 에러가 있으면 수정한다.

- [ ] **Step 3: 개발 서버에서 동작 확인**

`npm run dev` 실행 후 `/species` 페이지에서:
1. "수종 목록" 탭이 기본으로 열리고 기존 테이블이 정상 표시되는지 확인
2. "수목 현황" 탭 클릭 시 수종별 하자율 테이블이 표시되는지 확인
3. 리스크 필터(전체/위험/주의/보통/양호) 클릭 시 필터링되는지 확인
4. 수종명 검색 인풋에 입력 시 즉시 필터링되는지 확인
5. 수종 등록 다이얼로그에서 새 수종 등록 후 목록 탭에 즉시 반영되는지 확인

- [ ] **Step 4: 커밋**

```bash
git add src/app/(dashboard)/species/page.tsx \
        src/app/(dashboard)/species/species-list-tab.tsx \
        src/app/(dashboard)/species/species-stats-tab.tsx \
        src/app/(dashboard)/species/species-tabs.tsx
git commit -m "feat: 수종 관리 페이지 수목 현황 탭 추가"
```

---

## 자가 검토 (Self-Review)

### 스펙 커버리지
- [x] 수종 목록 탭 유지 — Task 1
- [x] 수목 현황 탭 신규 추가 — Task 2, 3
- [x] 수종명·분류·식재 주수·하자율·비율 바·리스크·관리 방향 컬럼 — Task 2
- [x] 리스크 필터 버튼 (전체/위험/주의/보통/양호) — Task 2
- [x] 수종명 검색 — Task 2
- [x] 수종 등록 후 실시간 반영 (`revalidatePath` 기존 존재) — Task 4

### 타입 일관성
- `SpeciesStat` 타입은 Task 2에서 정의, Task 3·4에서 import해 사용 — 일치 확인
- `Species` 타입은 Task 1·3에서 동일 구조 사용 — 일치 확인

### 플레이스홀더
- TBD, TODO 없음 — 확인
