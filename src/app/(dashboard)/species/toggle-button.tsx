'use client'

import { useTransition } from 'react'
import { toggleSpeciesActive } from '@/app/actions/species'
import { Button } from '@/components/ui/button'

export function SpeciesToggleButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      disabled={pending}
      onClick={() => startTransition(() => toggleSpeciesActive(id, !isActive))}
    >
      {pending ? '처리 중...' : isActive ? '비활성화' : '활성화'}
    </Button>
  )
}
