'use client'

import { useTransition } from 'react'
import { toggleContractorActive } from '@/app/actions/contractors'
import { Button } from '@/components/ui/button'

export function ContractorToggleButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      disabled={pending}
      onClick={() => startTransition(() => toggleContractorActive(id, !isActive))}
    >
      {pending ? '처리 중...' : isActive ? '비활성화' : '활성화'}
    </Button>
  )
}
