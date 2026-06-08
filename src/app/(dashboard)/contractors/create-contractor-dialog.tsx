'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { createContractor } from '@/app/actions/contractors'
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

export function CreateContractorDialog({ organizations }: { organizations: Organization[] }) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const [state, action, pending] = useActionState(createContractor, {
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
        협력사 등록
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>협력사 등록</DialogTitle>
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
              <Label htmlFor="contractor_name">시공사명 *</Label>
              <Input id="contractor_name" name="contractor_name" autoComplete="off" placeholder="예: (주)그린조경" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractor_code">시공사코드 *</Label>
              <Input id="contractor_code" name="contractor_code" autoComplete="off" placeholder="예: GC-001" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">담당자명</Label>
              <Input id="contact_name" name="contact_name" autoComplete="off" placeholder="예: 홍길동" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_phone">연락처</Label>
              <Input id="contact_phone" name="contact_phone" autoComplete="off" placeholder="예: 010-0000-0000" />
            </div>
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
