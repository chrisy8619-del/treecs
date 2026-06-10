'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { usePathname } from 'next/navigation'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/simulation': { title: '대시보드', subtitle: '하자율 분석 현황 및 수종별 시뮬레이션' },
  '/dashboard': { title: '현장 정보', subtitle: '등록된 현장 현황 및 상세 정보' },
  '/plantings': { title: '식재 기록', subtitle: '현장별 수목 식재 데이터 관리' },
  '/sites': { title: '현장 관리', subtitle: '현장 등록 및 수정' },
  '/contractors': { title: '협력사 관리', subtitle: '시공사 및 협력사 정보 관리' },
  '/species': { title: '수종 관리', subtitle: '수종 마스터 데이터 관리' },
  '/settings': { title: '설정', subtitle: '계정 및 시스템 설정' },
  '/risk-analysis': { title: '현장 리스크 분석', subtitle: '현장별 하자 리스크 등급 분석' },
}

export function DashboardHeader() {
  const pathname = usePathname()
  const base = '/' + pathname.split('/')[1]
  const page = pageTitles[pathname] ?? pageTitles[base] ?? { title: '분석', subtitle: '' }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex flex-col leading-none">
        <h1 className="text-sm font-semibold text-foreground">{page.title}</h1>
        {page.subtitle && (
          <p className="text-xs text-muted-foreground hidden sm:block">{page.subtitle}</p>
        )}
      </div>
    </header>
  )
}
