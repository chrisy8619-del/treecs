'use client'

import { useTransition } from 'react'
import { updateSiteStatus } from '@/app/actions/sites'
import { Button } from '@/components/ui/button'

const nextStatus: Record<string, { value: string; label: string }> = {
  active: { value: 'closed', label: '완료 처리' },
  pending: { value: 'active', label: '진행 시작' },
  closed: { value: 'active', label: '재개' },
}

export function SiteStatusButton({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition()
  const next = nextStatus[status]
  if (!next) return null

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      disabled={pending}
      onClick={() => startTransition(() => updateSiteStatus(id, next.value))}
    >
      {pending ? '처리 중...' : next.label}
    </Button>
  )
}
