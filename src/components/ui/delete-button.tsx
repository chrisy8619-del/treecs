'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DeleteButtonProps {
  onDelete: () => Promise<void>
  label?: string
}

export function DeleteButton({ onDelete, label = '삭제' }: DeleteButtonProps) {
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (confirm) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground whitespace-nowrap">정말 삭제?</span>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 px-2 text-xs"
          disabled={isPending}
          onClick={() => startTransition(async () => { await onDelete(); setConfirm(false) })}
        >
          {isPending ? '...' : '확인'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setConfirm(false)}
        >
          취소
        </Button>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
      onClick={() => setConfirm(true)}
      title={label}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}
