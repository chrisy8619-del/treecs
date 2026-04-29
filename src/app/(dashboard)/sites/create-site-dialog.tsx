'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { createSite } from '@/app/actions/sites'
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

type Organization = { id: string; name: string; code: string }

const selectClass =
  'flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function CreateSiteDialog({ organizations }: { organizations: Organization[] }) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const [state, action, pending] = useActionState(createSite, {
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
        현장 등록
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>현장 등록</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={action} className="space-y-4">

          <div className="space-y-2">
            <Label htmlFor="organization_id">조직 *</Label>
            <select id="organization_id" name="organization_id" required className={selectClass}>
              <option value="">조직 선택</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="site_name">현장명 *</Label>
              <Input id="site_name" name="site_name" placeholder="예: 한강공원 조경공사" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site_code">현장코드 *</Label>
              <Input id="site_code" name="site_code" placeholder="예: SITE-001" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="region">지역</Label>
              <Input id="region" name="region" placeholder="예: 서울" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project_type">공사 유형</Label>
              <Input id="project_type" name="project_type" placeholder="예: 아파트 조경" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">주소</Label>
            <Input id="address" name="address" placeholder="예: 서울시 영등포구 여의도동" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">착공일</Label>
              <Input id="start_date" name="start_date" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">준공예정일</Label>
              <Input id="end_date" name="end_date" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="occupancy_date">준공일</Label>
              <Input id="occupancy_date" name="occupancy_date" type="date" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">상태</Label>
            <select id="status" name="status" className={selectClass}>
              <option value="active">진행중</option>
              <option value="pending">대기</option>
              <option value="closed">완료</option>
            </select>
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
