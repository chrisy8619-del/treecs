'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { createSpecies } from '@/app/actions/species'
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

type SpeciesGroup = { id: string; group_name: string; group_code: string }

const selectClass =
  'flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function CreateSpeciesDialog({ groups }: { groups: SpeciesGroup[] }) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const [state, action, pending] = useActionState(createSpecies, {
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
        수종 등록
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수종 등록</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={action} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="species_name_ko">수종명(한글) *</Label>
              <Input id="species_name_ko" name="species_name_ko" autoComplete="off" placeholder="예: 소나무" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="species_code">수종코드 *</Label>
              <Input id="species_code" name="species_code" autoComplete="off" placeholder="예: PINE-001" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="species_name_en">수종명(영문)</Label>
              <Input id="species_name_en" name="species_name_en" autoComplete="off" placeholder="예: Pine" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scientific_name">학명</Label>
              <Input id="scientific_name" name="scientific_name" autoComplete="off" placeholder="예: Pinus densiflora" />
            </div>
          </div>

          {groups.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="species_group_id">수종 그룹</Label>
              <select id="species_group_id" name="species_group_id" className={selectClass}>
                <option value="">그룹 없음</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.group_name} ({g.group_code})
                  </option>
                ))}
              </select>
            </div>
          )}

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
