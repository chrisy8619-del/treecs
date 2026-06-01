'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { generateSampleAnalysisData } from '@/app/actions/upload'
import { FlaskConical, CheckCircle2, XCircle } from 'lucide-react'

export function SampleDataButton() {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  function handleGenerate() {
    startTransition(async () => {
      const res = await generateSampleAnalysisData()
      if (res.success) {
        setStatus('success')
        setMessage(`샘플 데이터 ${res.successCount}건 생성 완료${res.failCount > 0 ? ` (${res.failCount}건 실패)` : ''} — 새로고침`)
        setTimeout(() => window.location.reload(), 1000)
      } else {
        setStatus('error')
        setMessage(res.errors.join(' / ') || '생성 실패')
        setTimeout(() => setStatus('idle'), 8000)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'success' && (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> {message}
        </span>
      )}
      {status === 'error' && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5" /> {message}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={isPending}
        className="text-xs"
      >
        <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
        {isPending ? '생성 중...' : '샘플 데이터 생성'}
      </Button>
    </div>
  )
}
