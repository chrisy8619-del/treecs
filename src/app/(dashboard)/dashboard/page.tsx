import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TreePine, ClipboardList, AlertTriangle, TrendingDown } from 'lucide-react'

async function getDashboardStats() {
  const supabase = await createClient()

  const [plantingResult, inspectionResult, defectResult, highRiskResult] = await Promise.all([
    supabase.from('planting_records').select('quantity_planted'),
    supabase.from('inspection_rounds').select('id', { count: 'exact', head: true }),
    supabase.from('inspection_items').select('quantity_inspected, defect_quantity'),
    // 현장별 합산 후 하자율 35% 이상 현장 수
    supabase.from('inspection_items').select('site_id, quantity_inspected, defect_quantity'),
  ])

  const totalPlanted = (plantingResult.data ?? []).reduce(
    (sum, r) => sum + (r.quantity_planted ?? 0), 0
  )

  const inspectionCount = inspectionResult.count ?? 0

  const allItems = defectResult.data ?? []
  const totalInspected = allItems.reduce((sum, r) => sum + (r.quantity_inspected ?? 0), 0)
  const totalDefect = allItems.reduce((sum, r) => sum + (r.defect_quantity ?? 0), 0)
  const avgDefectRate = totalInspected > 0 ? totalDefect / totalInspected : null

  // 현장별 집계 → 하자율 35% 이상 현장
  const siteMap = new Map<string, { inspected: number; defect: number }>()
  for (const item of (highRiskResult.data ?? [])) {
    const prev = siteMap.get(item.site_id) ?? { inspected: 0, defect: 0 }
    siteMap.set(item.site_id, {
      inspected: prev.inspected + (item.quantity_inspected ?? 0),
      defect: prev.defect + (item.defect_quantity ?? 0),
    })
  }
  const highRiskCount = [...siteMap.values()].filter(
    ({ inspected, defect }) => inspected > 0 && defect / inspected >= 0.35
  ).length

  return { totalPlanted, inspectionCount, avgDefectRate, highRiskCount }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { totalPlanted, inspectionCount, avgDefectRate, highRiskCount } = await getDashboardStats()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">안녕하세요</h2>
        <p className="text-muted-foreground">{user.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 식재 수량</CardTitle>
            <TreePine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalPlanted > 0 ? totalPlanted.toLocaleString() : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalPlanted > 0 ? '주' : '데이터 없음'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">점검 횟수</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {inspectionCount > 0 ? inspectionCount.toLocaleString() : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {inspectionCount > 0 ? '회' : '데이터 없음'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 하자율</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgDefectRate !== null ? `${(avgDefectRate * 100).toFixed(1)}%` : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {avgDefectRate !== null ? '전체 점검 기준' : '데이터 없음'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">고위험 현장</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {highRiskCount > 0 ? highRiskCount : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {highRiskCount > 0 ? '하자율 35% 이상' : '데이터 없음'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
