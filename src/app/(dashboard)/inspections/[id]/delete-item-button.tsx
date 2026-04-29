'use client'

import { useTransition } from 'react'
import { deleteInspectionItem } from '@/app/actions/inspection-items'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DeleteItemButton({ id, roundId }: { id: string; roundId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-destructive"
      disabled={pending}
      onClick={() => {
        if (!confirm('이 항목을 삭제하시겠습니까?')) return
        startTransition(() => deleteInspectionItem(id, roundId))
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}
