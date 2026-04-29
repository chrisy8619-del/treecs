'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { createInspectionRound } from '@/app/actions/inspections'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

type Site = { id: string; site_name: string; site_code: string }

export function CreateInspectionDialog({ sites }: { sites: Site[] }) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const [state, action, pending] = useActionState(createInspectionRound, {
    error: '',
    success: false,
  })

  useEffect(() => {
    if (state.success) {
      setOpen(false)
      formRef.current?.reset()
    }
  }, [state.success])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        점검 등록
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>점검 회차 등록</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={action} className="space-y-4">

          <div className="space-y-2">
            <Label htmlFor="site_id">현장 *</Label>
            <select
              id="site_id"
              name="site_id"
              required
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">현장 선택</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.site_name} ({s.site_code})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inspection_date">점검일자 *</Label>
            <Input id="inspection_date" name="inspection_date" type="date" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inspection_name">점검명</Label>
            <Input id="inspection_name" name="inspection_name" placeholder="예: 2024년 봄철 점검" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="season_code">계절</Label>
              <select
                id="season_code"
                name="season_code"
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">선택</option>
                <option value="spring">봄</option>
                <option value="summer">여름</option>
                <option value="fall">가을</option>
                <option value="winter">겨울</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inspection_basis_type">기산일 기준</Label>
              <select
                id="inspection_basis_type"
                name="inspection_basis_type"
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">선택</option>
                <option value="occupancy">준공일</option>
                <option value="planting">식재일</option>
                <option value="inspection">점검일</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="performed_by">점검자</Label>
            <Input id="performed_by" name="performed_by" placeholder="점검자 이름" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">비고</Label>
            <Input id="notes" name="notes" placeholder="메모" />
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '등록 중...' : '등록'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
