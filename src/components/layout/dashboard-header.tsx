'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { usePathname } from 'next/navigation'

const pageTitles: Record<string, string> = {
  '/analytics': '대시보드',
  '/dashboard': '현장 하자율 예측 분석',
  '/plantings': '식재 기록',
  '/sites': '현장 관리',
  '/contractors': '시공사 관리',
  '/species': '수종 관리',
  '/settings': '설정',
}

export function DashboardHeader() {
  const pathname = usePathname()
  const base = '/' + pathname.split('/')[1]
  const title = pageTitles[pathname] ?? pageTitles[base] ?? '대시보드'

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-sm font-semibold">{title}</h1>
    </header>
  )
}
