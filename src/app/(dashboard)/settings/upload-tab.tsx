'use client'

import { useRef, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { uploadPlantingRecords, uploadInspectionResults, type UploadResult } from '@/app/actions/upload'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { UploadIcon, CheckCircle2, XCircle, AlertCircle, FileDown } from 'lucide-react'

type UploadLog = {
  id: string
  file_name: string
  upload_type: string | null
  row_count: number | null
  status: string
  created_at: string
}

type PreviewRow = Record<string, string | number | null>
type UploadType = 'planting' | 'inspection'

const UPLOAD_TYPES: { value: UploadType; label: string; description: string; columns: string[] }[] = [
  {
    value: 'planting',
    label: '식재 기록',
    description: '수목 식재 내역을 일괄 등록합니다.',
    columns: ['현장코드', '시공사코드', '수종코드', '규격', '수량', '식재일', '준공기산일'],
  },
  {
    value: 'inspection',
    label: '점검 결과',
    description: '점검 결과를 일괄 등록합니다. 점검 회차가 없으면 자동 생성됩니다.',
    columns: ['현장코드', '점검명', '점검일', '계절', '수종코드', '규격', '시공사코드', '점검수량', '하자수량', '비고'],
  },
]

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive'> = {
  success: 'default',
  partial: 'secondary',
  failed: 'destructive',
}
const statusLabel: Record<string, string> = {
  success: '성공',
  partial: '부분',
  failed: '실패',
}

export function UploadTab({ logs: initialLogs }: { logs: UploadLog[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadType, setUploadType] = useState<UploadType>('planting')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<{ headers: string[]; rows: PreviewRow[]; allRows: PreviewRow[] } | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedType = UPLOAD_TYPES.find((t) => t.value === uploadType)!

  function parseFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert('.xlsx 또는 .xls 파일만 지원합니다.')
      return
    }
    setFileName(file.name)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const allRows: PreviewRow[] = XLSX.utils.sheet_to_json(sheet, { defval: null })
      const headers = allRows.length > 0 ? Object.keys(allRows[0]) : []
      setPreview({ headers, rows: allRows.slice(0, 5), allRows })
    }
    reader.readAsArrayBuffer(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  function handleUpload() {
    if (!preview) return
    startTransition(async () => {
      let res: UploadResult
      if (uploadType === 'planting') {
        res = await uploadPlantingRecords(preview.allRows as never)
      } else {
        res = await uploadInspectionResults(preview.allRows as never)
      }
      setResult(res)
      setPreview(null)
      setFileName('')
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  function handleReset() {
    setPreview(null)
    setFileName('')
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([selectedType.columns])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, `${selectedType.label}_양식.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* 업로드 타입 선택 */}
      <div className="grid grid-cols-2 gap-3">
        {UPLOAD_TYPES.map((type) => (
          <button
            key={type.value}
            onClick={() => { setUploadType(type.value); handleReset() }}
            className={`rounded-lg border p-4 text-left transition-colors ${
              uploadType === type.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <p className="font-medium text-sm">{type.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
          </button>
        ))}
      </div>

      {/* 필수 컬럼 안내 + 템플릿 다운로드 */}
      <div className="flex items-start justify-between rounded-lg bg-muted/50 px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">필수/권장 컬럼</p>
          <div className="flex flex-wrap gap-1">
            {selectedType.columns.map((col) => (
              <Badge key={col} variant="secondary" className="text-xs">{col}</Badge>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0 ml-4">
          <FileDown className="mr-1.5 h-3.5 w-3.5" />
          양식 다운로드
        </Button>
      </div>

      {/* 업로드 결과 */}
      {result && (
        <div className={`rounded-lg border p-4 space-y-2 ${result.success ? 'border-green-200 bg-green-50' : 'border-destructive/30 bg-destructive/5'}`}>
          <div className="flex items-center gap-2">
            {result.failCount === 0
              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : result.successCount > 0
              ? <AlertCircle className="h-4 w-4 text-yellow-600" />
              : <XCircle className="h-4 w-4 text-destructive" />
            }
            <p className="text-sm font-medium">
              전체 {result.totalRows}행 중 {result.successCount}행 성공
              {result.failCount > 0 && `, ${result.failCount}행 실패`}
            </p>
          </div>
          {result.errors.length > 0 && (
            <ul className="text-xs text-destructive space-y-0.5 pl-6 list-disc">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* 드래그 업로드 영역 */}
      {!preview && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/40'
          }`}
        >
          <UploadIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">파일을 드래그하거나 클릭하여 선택</p>
          <p className="text-xs text-muted-foreground">지원 형식: .xlsx, .xls</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* 미리보기 */}
      {preview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              미리보기 — {fileName}{' '}
              <span className="text-muted-foreground font-normal">
                (총 {preview.allRows.length.toLocaleString()}행, 상위 5행 표시)
              </span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>취소</Button>
              <Button size="sm" disabled={isPending} onClick={handleUpload}>
                {isPending ? '처리 중...' : `${selectedType.label} 업로드`}
              </Button>
            </div>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {preview.headers.map((h) => (
                    <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row, i) => (
                  <TableRow key={i}>
                    {preview.headers.map((h) => (
                      <TableCell key={h} className="text-xs whitespace-nowrap">
                        {row[h] != null ? String(row[h]) : '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* 업로드 히스토리 */}
      <div className="space-y-2">
        <p className="text-sm font-medium">업로드 히스토리</p>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>파일명</TableHead>
                <TableHead>유형</TableHead>
                <TableHead className="text-right">행 수</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>업로드일시</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    업로드 내역이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                initialLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">{log.file_name}</TableCell>
                    <TableCell>{log.upload_type ?? '-'}</TableCell>
                    <TableCell className="text-right">{log.row_count?.toLocaleString() ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[log.status] ?? 'secondary'}>
                        {statusLabel[log.status] ?? log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('ko-KR')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
