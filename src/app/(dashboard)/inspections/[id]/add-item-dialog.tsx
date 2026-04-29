'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { upsertInspectionItem } from '@/app/actions/inspection-items'
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

type PlantingRecord = {
  id: string
  site_id: string
  contractor_id: string
  species_id: string
  spec_code_id: string
  quantity_planted: number
  sites: { site_name: string; site_code: string } | null
  contractors: { contractor_name: string } | null
  species: { species_name_ko: string } | null
  spec_codes: { spec_label_raw: string } | null
}

type Props = {
  roundId: string
  siteId: string
  plantingRecords: PlantingRecord[]
}

export function AddItemDialog({ roundId, siteId, plantingRecords }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<PlantingRecord | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const [state, action, pending] = useActionState(upsertInspectionItem, {
    error: '',
    success: false,
  })

  useEffect(() => {
    if (state.success) {
      setOpen(false)
      setSelectedRecord(null)
      formRef.current?.reset()
    }
  }, [state.success])

  const handleRecordChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const record = plantingRecords.find((r) => r.id === e.target.value) ?? null
    setSelectedRecord(record)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" />
        항목 추가
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>점검 항목 추가</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={action} className="space-y-4">
          <input type="hidden" name="inspection_round_id" value={roundId} />
          <input type="hidden" name="site_id" value={siteId} />
          {selectedRecord && (
            <>
              <input type="hidden" name="planting_record_id" value={selectedRecord.id} />
              <input type="hidden" name="contractor_id" value={selectedRecord.contractor_id} />
              <input type="hidden" name="species_id" value={selectedRecord.species_id} />
              <input type="hidden" name="spec_code_id" value={selectedRecord.spec_code_id} />
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="planting_record">식재 기록 선택</Label>
            <select
              id="planting_record"
              onChange={handleRecordChange}
              className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">식재 기록 선택 (선택 시 자동 입력)</option>
              {plantingRecords.map((r) => {
                const sp = r.species?.species_name_ko ?? '-'
                const spec = r.spec_codes?.spec_label_raw ?? '-'
                const con = r.contractors?.contractor_name ?? '-'
                return (
                  <option key={r.id} value={r.id}>
                    {sp} / {spec} / {con} ({r.quantity_planted.toLocaleString()}주)
                  </option>
                )
              })}
            </select>
          </div>

          {!selectedRecord && (
            <>
              <div className="space-y-2">
                <Label htmlFor="contractor_id_manual">시공사 *</Label>
                <Input
                  id="contractor_id_manual"
                  name="contractor_id"
                  placeholder="시공사 ID"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="species_id_manual">수종 ID *</Label>
                <Input
                  id="species_id_manual"
                  name="species_id"
                  placeholder="수종 ID"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="spec_code_id_manual">규격 ID *</Label>
                <Input
                  id="spec_code_id_manual"
                  name="spec_code_id"
                  placeholder="규격 ID"
                  required
                />
              </div>
            </>
          )}

          {selectedRecord && (
            <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">수종:</span> {selectedRecord.species?.species_name_ko}</p>
              <p><span className="text-muted-foreground">규격:</span> {selectedRecord.spec_codes?.spec_label_raw}</p>
              <p><span className="text-muted-foreground">시공사:</span> {selectedRecord.contractors?.contractor_name}</p>
              <p><span className="text-muted-foreground">식재수량:</span> {selectedRecord.quantity_planted.toLocaleString()}주</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity_inspected">점검수량 *</Label>
              <Input
                id="quantity_inspected"
                name="quantity_inspected"
                type="number"
                min={0}
                defaultValue={selectedRecord?.quantity_planted ?? 0}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defect_quantity">하자수량</Label>
              <Input
                id="defect_quantity"
                name="defect_quantity"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
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
            <Button type="submit" disabled={pending || (!selectedRecord)}>
              {pending ? '저장 중...' : '저장'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
