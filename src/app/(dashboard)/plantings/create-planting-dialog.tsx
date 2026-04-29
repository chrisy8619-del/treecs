'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { createPlantingRecord } from '@/app/actions/plantings'
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
type Contractor = { id: string; contractor_name: string; contractor_code: string }
type Species = { id: string; species_name_ko: string; species_code: string }
type SpecCode = { id: string; spec_label_raw: string }

type Props = {
  sites: Site[]
  contractors: Contractor[]
  species: Species[]
  specCodes: SpecCode[]
}

const selectClass =
  'flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function CreatePlantingDialog({ sites, contractors, species, specCodes }: Props) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const [state, action, pending] = useActionState(createPlantingRecord, {
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
        식재 등록
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>식재 기록 등록</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={action} className="space-y-4">

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="site_id">현장 *</Label>
              <select id="site_id" name="site_id" required className={selectClass}>
                <option value="">현장 선택</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.site_name} ({s.site_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractor_id">시공사 *</Label>
              <select id="contractor_id" name="contractor_id" required className={selectClass}>
                <option value="">시공사 선택</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contractor_name} ({c.contractor_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="species_id">수종 *</Label>
              <select id="species_id" name="species_id" required className={selectClass}>
                <option value="">수종 선택</option>
                {species.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.species_name_ko} ({sp.species_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="spec_code_id">규격 *</Label>
              <select id="spec_code_id" name="spec_code_id" required className={selectClass}>
                <option value="">규격 선택</option>
                {specCodes.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.spec_label_raw}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity_planted">수량 (주) *</Label>
              <Input
                id="quantity_planted"
                name="quantity_planted"
                type="number"
                min={1}
                placeholder="0"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planting_date">식재일</Label>
              <Input id="planting_date" name="planting_date" type="date" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="occupancy_basis_date">준공 기산일</Label>
            <Input id="occupancy_basis_date" name="occupancy_basis_date" type="date" />
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
