import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  YearlyDefectChart,
  SeasonDefectChart,
  ContractorDefectChart,
  SpeciesDefectChart,
} from './charts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

function riskBadge(rate: number) {
  if (rate >= 0.35) return <Badge className="bg-red-500 hover:bg-red-500 text-white">Level 4</Badge>
  if (rate >= 0.20) return <Badge className="bg-orange-500 hover:bg-orange-500 text-white">Level 3</Badge>
  if (rate >= 0.10) return <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white">Level 2</Badge>
  return <Badge className="bg-green-500 hover:bg-green-500 text-white">Level 1</Badge>
}

async function getAnalyticsData() {
  const supabase = await createClient()

  const [yearlyRes, itemsRes, contractorRes] = await Promise.all([
    supabase
      .from('agg_metrics_by_year')
      .select('year, total_quantity, total_defect_quantity, defect_rate')
      .order('year'),
    supabase
      .from('inspection_items')
      .select(`
        site_id,
        quantity_inspected,
        defect_quantity,
        inspection_rounds ( season_code ),
        contractors ( contractor_name ),
        species ( species_name_ko )
      `),
    supabase
      .from('agg_metrics_by_contractor')
      .select('total_quantity, total_defect_quantity, defect_rate, contractors(contractor_name)')
      .order('defect_rate', { ascending: false }),
  ])

  // 연도별
  const yearlyData = (yearlyRes.data ?? []).map((d) => ({
    year: d.year,
    defect_rate: d.defect_rate ?? 0,
    total_quantity: d.total_quantity,
    total_defect_quantity: d.total_defect_quantity,
  }))

  const items = itemsRes.data ?? []

  // 계절별
  const seasonMap = new Map<string, { inspected: number; defect: number }>()
  for (const item of items) {
    const round = Array.isArray(item.inspection_rounds) ? item.inspection_rounds[0] : item.inspection_rounds
    const season = round?.season_code
    if (!season) continue
    const prev = seasonMap.get(season) ?? { inspected: 0, defect: 0 }
    seasonMap.set(season, {
      inspected: prev.inspected + (item.quantity_inspected ?? 0),
      defect: prev.defect + (item.defect_quantity ?? 0),
    })
  }
  const seasonOrder = ['spring', 'summer', 'fall', 'winter']
  const seasonData = seasonOrder
    .filter((s) => seasonMap.has(s))
    .map((s) => {
      const { inspected, defect } = seasonMap.get(s)!
      return { label: s, defect_rate: inspected > 0 ? defect / inspected : 0 }
    })

  // 시공사별
  let contractorData: { name: string; defect_rate: number; total_quantity: number }[] = []
  if (contractorRes.data && contractorRes.data.length > 0) {
    contractorData = contractorRes.data.map((d) => {
      const c = Array.isArray(d.contractors) ? d.contractors[0] : d.contractors
      return { name: c?.contractor_name ?? '알 수 없음', defect_rate: d.defect_rate ?? 0, total_quantity: d.total_quantity }
    })
  } else {
    const cMap = new Map<string, { name: string; inspected: number; defect: number }>()
    for (const item of items) {
      const c = Array.isArray(item.contractors) ? item.contractors[0] : item.contractors
      const name = c?.contractor_name ?? '알 수 없음'
      const prev = cMap.get(name) ?? { name, inspected: 0, defect: 0 }
      cMap.set(name, {
        name,
        inspected: prev.inspected + (item.quantity_inspected ?? 0),
        defect: prev.defect + (item.defect_quantity ?? 0),
      })
    }
    contractorData = [...cMap.values()]
      .map((v) => ({ name: v.name, defect_rate: v.inspected > 0 ? v.defect / v.inspected : 0, total_quantity: v.inspected }))
      .sort((a, b) => b.defect_rate - a.defect_rate)
  }

  // 현장별
  const siteMap = new Map<string, { name: string; inspected: number; defect: number }>()
  for (const item of items) {
    const sid = item.site_id as string
    if (!sid) continue
    const prev = siteMap.get(sid) ?? { name: sid, inspected: 0, defect: 0 }
    siteMap.set(sid, {
      name: prev.name,
      inspected: prev.inspected + (item.quantity_inspected ?? 0),
      defect: prev.defect + (item.defect_quantity ?? 0),
    })
  }
  const siteIds = [...siteMap.keys()]
  if (siteIds.length > 0) {
    const { data: siteNames } = await supabase.from('sites').select('id, site_name').in('id', siteIds)
    for (const s of siteNames ?? []) {
      const prev = siteMap.get(s.id)
      if (prev) siteMap.set(s.id, { ...prev, name: s.site_name })
    }
  }
  const siteData = [...siteMap.values()]
    .map((v) => ({ name: v.name, defect_rate: v.inspected > 0 ? v.defect / v.inspected : 0, inspected: v.inspected, defect: v.defect }))
    .sort((a, b) => b.defect_rate - a.defect_rate)

  // 수종별
  const spMap = new Map<string, { inspected: number; defect: number }>()
  for (const item of items) {
    const sp = Array.isArray(item.species) ? item.species[0] : item.species
    const name = sp?.species_name_ko ?? '알 수 없음'
    const prev = spMap.get(name) ?? { inspected: 0, defect: 0 }
    spMap.set(name, {
      inspected: prev.inspected + (item.quantity_inspected ?? 0),
      defect: prev.defect + (item.defect_quantity ?? 0),
    })
  }
  const speciesData = [...spMap.entries()]
    .map(([name, v]) => ({ name, defect_rate: v.inspected > 0 ? v.defect / v.inspected : 0, inspected: v.inspected, defect: v.defect }))
    .sort((a, b) => b.defect_rate - a.defect_rate)

  // 요약 통계
  const totalInspected = items.reduce((s, i) => s + (i.quantity_inspected ?? 0), 0)
  const totalDefect = items.reduce((s, i) => s + (i.defect_quantity ?? 0), 0)
  const overallRate = totalInspected > 0 ? totalDefect / totalInspected : null
  const highRiskSites = siteData.filter((s) => s.defect_rate >= 0.35).length

  return { yearlyData, seasonData, contractorData, siteData, speciesData, totalInspected, totalDefect, overallRate, highRiskSites }
}

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const {
    yearlyData, seasonData, contractorData, siteData, speciesData,
    totalInspected, totalDefect, overallRate, highRiskSites,
  } = await getAnalyticsData()

  const hasData = siteData.length > 0 || yearlyData.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">분석</h2>
        <p className="text-muted-foreground">하자율 통계 및 리스크 분석 현황입니다.</p>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <p className="text-sm">분석할 점검 데이터가 없습니다.</p>
          <p className="text-xs mt-1">점검 관리와 식재 기록을 먼저 등록하세요.</p>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">총 점검 수량</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalInspected > 0 ? totalInspected.toLocaleString() : '-'}</p>
                <p className="text-xs text-muted-foreground">주</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">총 하자 수량</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalDefect > 0 ? totalDefect.toLocaleString() : '-'}</p>
                <p className="text-xs text-muted-foreground">주</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">전체 하자율</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${overallRate !== null && overallRate >= 0.35 ? 'text-red-500' : ''}`}>
                  {overallRate !== null ? `${(overallRate * 100).toFixed(1)}%` : '-'}
                </p>
                <p className="text-xs text-muted-foreground">전체 점검 기준</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">고위험 현장</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${highRiskSites > 0 ? 'text-red-500' : ''}`}>
                  {highRiskSites > 0 ? highRiskSites : '-'}
                </p>
                <p className="text-xs text-muted-foreground">하자율 35% 이상</p>
              </CardContent>
            </Card>
          </div>

          {/* 차트 2열 */}
          <div className="grid gap-6 md:grid-cols-2">
            {yearlyData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">연도별 하자율 추이</CardTitle>
                </CardHeader>
                <CardContent>
                  <YearlyDefectChart data={yearlyData} />
                </CardContent>
              </Card>
            )}
            {seasonData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">계절별 하자율</CardTitle>
                </CardHeader>
                <CardContent>
                  <SeasonDefectChart data={seasonData} />
                </CardContent>
              </Card>
            )}
            {contractorData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">시공사별 하자율</CardTitle>
                </CardHeader>
                <CardContent>
                  <ContractorDefectChart data={contractorData} />
                </CardContent>
              </Card>
            )}
            {speciesData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">수종별 하자율 <span className="text-sm font-normal text-muted-foreground">(상위 15종)</span></CardTitle>
                </CardHeader>
                <CardContent>
                  <SpeciesDefectChart data={speciesData} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* 현장별 테이블 */}
          {siteData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  현장별 하자율
                  <span className="ml-2 text-sm font-normal text-muted-foreground">총 {siteData.length}개 현장</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>순위</TableHead>
                      <TableHead>현장명</TableHead>
                      <TableHead className="text-right">점검 수량</TableHead>
                      <TableHead className="text-right">하자 수량</TableHead>
                      <TableHead className="text-right">하자율</TableHead>
                      <TableHead>리스크 등급</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {siteData.map((site, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium">{site.name}</TableCell>
                        <TableCell className="text-right">{site.inspected.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{site.defect.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className={site.defect_rate >= 0.35 ? 'text-red-500' : site.defect_rate >= 0.20 ? 'text-orange-500' : ''}>
                            {(site.defect_rate * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell>{riskBadge(site.defect_rate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* 수종별 테이블 */}
          {speciesData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  수종별 하자율
                  <span className="ml-2 text-sm font-normal text-muted-foreground">총 {speciesData.length}종</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>순위</TableHead>
                      <TableHead>수종명</TableHead>
                      <TableHead className="text-right">점검 수량</TableHead>
                      <TableHead className="text-right">하자 수량</TableHead>
                      <TableHead className="text-right">하자율</TableHead>
                      <TableHead>리스크 등급</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {speciesData.map((sp, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium">{sp.name}</TableCell>
                        <TableCell className="text-right">{sp.inspected.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{sp.defect.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className={sp.defect_rate >= 0.35 ? 'text-red-500' : sp.defect_rate >= 0.20 ? 'text-orange-500' : ''}>
                            {(sp.defect_rate * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell>{riskBadge(sp.defect_rate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
