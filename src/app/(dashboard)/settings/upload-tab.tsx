'use client'

import { useRef, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import {
  uploadPlantingRecords,
  uploadInspectionResults,
  uploadDefectAnalysis,
  type UploadResult,
  type DefectAnalysisRow,
} from '@/app/actions/upload'
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
type UploadType = 'planting' | 'inspection' | 'defect_analysis'

const UPLOAD_TYPES: { value: UploadType; label: string; description: string; columns: string[] }[] = [
  {
    value: 'defect_analysis',
    label: '하자율 예측 분석',
    description: '현장별 수목 명세와 단가·예상하자율을 업로드합니다. 예비비가 자동 계산됩니다.',
    columns: ['현장코드', '현장명', '준공일', '식재시기', '시공사', '협력사', '지역', '수종명', '수량', '수고H', '수관폭W', '흉고직경B', '근원직경R', '단가', '예상하자율', '비고'],
  },
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

// 하자율 예측 엑셀에서 헤더 정보(현장 기본 정보)를 파싱
// 이미지 기준: B6=현장코드값(C6), B7=현장명값(C7), D6=준공일(E6), D7=식재시기(E7),
//              H6=시공사(I6), H7=지역(I7)
function parseDefectAnalysisExcel(sheet: XLSX.WorkSheet): {
  headerInfo: {
    site_code: string
    site_name: string
    completion_date: string | number | null
    planting_date: string | number | null
    contractor_name: string
    region: string
  }
  rows: DefectAnalysisRow[]
  rawRows: PreviewRow[]
} {
  // 현장 기본 정보 파싱 (행 기반)
  const getCellVal = (addr: string) => {
    const cell = sheet[addr]
    return cell ? cell.v : null
  }

  // 헤더 정보 추출 (엑셀 템플릿 고정 위치 기준)
  const headerInfo = {
    site_code: String(getCellVal('C6') ?? '').trim(),
    site_name: String(getCellVal('C7') ?? '').trim(),
    completion_date: getCellVal('E6'),
    planting_date: getCellVal('E7'),
    contractor_name: String(getCellVal('I6') ?? '').trim(),
    region: String(getCellVal('I7') ?? '').trim(),
  }

  // 수목 명세 파싱 (B12가 헤더행, B13부터 데이터)
  // 헤더: B=번호, C=수종명, D=수량, E=수고H, F=수관폭W, G=흉고직경B, H=근원직경R,
  //        I=단가, J=예상하자율, K=예상하자수량, L=예상예비비, M=리스크등급, N=권장조치, O=세부조치, P=비고
  const rows: DefectAnalysisRow[] = []
  const rawRows: PreviewRow[] = []

  for (let r = 12; r <= 62; r++) {
    const speciesName = getCellVal(`C${r}`)
    if (!speciesName || String(speciesName).trim() === '') break

    const rawRate = getCellVal(`J${r}`)
    // 엑셀에서 하자율이 퍼센트 서식(0.18 = 18%)이거나 정수(18)일 수 있음
    let defectRate: number | undefined
    if (rawRate != null) {
      const n = Number(rawRate)
      if (!isNaN(n)) defectRate = n
    }

    // K열=예상하자수량, L열=예상예비비, M열=리스크등급, N열=권장조치, P열=비고
    const excelDefectQty = getCellVal(`K${r}`)
    const excelReserveCost = getCellVal(`L${r}`)
    const excelRiskLevel = getCellVal(`M${r}`)

    const row: DefectAnalysisRow = {
      현장코드: headerInfo.site_code,
      현장명: headerInfo.site_name,
      준공일: headerInfo.completion_date ?? undefined,
      식재시기: headerInfo.planting_date ?? undefined,
      시공사: headerInfo.contractor_name,
      지역: headerInfo.region,
      수종명: String(speciesName).trim(),
      수량: getCellVal(`D${r}`) != null ? Number(getCellVal(`D${r}`)) : undefined,
      수고H: getCellVal(`E${r}`) != null ? Number(getCellVal(`E${r}`)) : undefined,
      수관폭W: getCellVal(`F${r}`) != null ? Number(getCellVal(`F${r}`)) : undefined,
      흉고직경B: getCellVal(`G${r}`) != null ? Number(getCellVal(`G${r}`)) : undefined,
      근원직경R: getCellVal(`H${r}`) != null ? Number(getCellVal(`H${r}`)) : undefined,
      단가: getCellVal(`I${r}`) != null ? Number(getCellVal(`I${r}`)) : undefined,
      예상하자율: defectRate,
      예상하자수량: excelDefectQty != null ? Number(excelDefectQty) : undefined,
      예상예비비: excelReserveCost != null ? Number(excelReserveCost) : undefined,
      리스크등급: excelRiskLevel != null ? String(excelRiskLevel) : undefined,
      비고: getCellVal(`P${r}`) != null ? String(getCellVal(`P${r}`)) : undefined,
    }
    rows.push(row)
    rawRows.push({
      수종명: row.수종명 ?? null,
      수량: row.수량 ?? null,
      수고H: row.수고H ?? null,
      수관폭W: row.수관폭W ?? null,
      단가: row.단가 ?? null,
      예상하자율: defectRate != null ? `${(defectRate > 1 ? defectRate : defectRate * 100).toFixed(2)}%` : null,
      예상하자수량: excelDefectQty != null ? Number(excelDefectQty) : null,
      예상예비비: excelReserveCost != null ? `₩${Number(excelReserveCost).toLocaleString()}` : null,
      리스크등급: excelRiskLevel != null ? String(excelRiskLevel) : null,
      비고: row.비고 ?? null,
    })
  }

  return { headerInfo, rows, rawRows }
}

export function UploadTab({ logs: initialLogs }: { logs: UploadLog[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadType, setUploadType] = useState<UploadType>('defect_analysis')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<{
    headers: string[]
    rows: PreviewRow[]
    allRows: PreviewRow[]
    defectAnalysisData?: {
      headerInfo: ReturnType<typeof parseDefectAnalysisExcel>['headerInfo']
      rows: DefectAnalysisRow[]
    }
  } | null>(null)
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

      if (uploadType === 'defect_analysis') {
        // 하자율 예측 분석 시트 탐색 ('신규현장_하자율 예측분석' 또는 첫 번째 시트)
        const sheetName =
          workbook.SheetNames.find((n) => n.includes('하자율') || n.includes('예측')) ??
          workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const { headerInfo, rows, rawRows } = parseDefectAnalysisExcel(sheet)

        const headers = ['수종명', '수량', '수고H', '수관폭W', '단가', '예상하자율', '예상하자수량', '예상예비비', '리스크등급', '비고']
        setPreview({
          headers,
          rows: rawRows.slice(0, 5),
          allRows: rawRows,
          defectAnalysisData: { headerInfo, rows },
        })
      } else {
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const allRows: PreviewRow[] = XLSX.utils.sheet_to_json(sheet, { defval: null })
        const headers = allRows.length > 0 ? Object.keys(allRows[0]) : []
        setPreview({ headers, rows: allRows.slice(0, 5), allRows })
      }
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

      if (uploadType === 'defect_analysis' && preview.defectAnalysisData) {
        const { headerInfo, rows } = preview.defectAnalysisData
        res = await uploadDefectAnalysis(headerInfo, rows)
      } else if (uploadType === 'planting') {
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
    if (uploadType === 'defect_analysis') {
      // 하자율 예측 분석 템플릿 — 이미지 기준 열 구성 반영
      const aoa = [
        // 행 1 (현장 기본 정보 제목 행 — 병합 표현은 xlsx에서 생략)
        ['현장 기본 정보'],
        // 행 2 (row index 1)
        ['현장코드', '', '준공일', '', '', '', '시공사', '', '협력사', ''],
        // 행 3 (row index 2)
        ['현장명', '', '식재시기', '', '', '', '지역', '', '총 수량', '예상 하자율', '총 예비비'],
        // 행 4 (row index 3)
        ['비고'],
        // 행 5 — 빈 행
        [],
        // 행 6 — 리스크 판정 소계행 (빈 행으로 처리)
        [],
        // 행 7 — 전체 리스크 판정 헤더
        ['전체 리스크 판정', '', '', '', '중위험 - 주의 관리 필요'],
        // 행 8 — 고위험/중위험/지위험 카운트 (설명용)
        ['고위험:0종', '', '중위험:0종', '', '지위험:0종', '', '단가 자동매칭:0건'],
        // 행 9 (row index 8) — 열 헤더 (row 12 위치에 맞추기 위해 빈 행 추가)
        [],
        [],
        [],
        // 행 12 (row index 11) — 실제 열 헤더
        ['번호', '수종명', '수량', '수고 H(m)', '수관폭 W(m)', '흉고직경 B(cm)', '근원직경 R(cm)', '단가(자동,W)', '예상하자율', '예상 하자수량', '예상 예비비(W)', '리스크 등급', '권장 조치', '세부 조치(필요시 입력)', '비고'],
        // 행 13~ — 샘플 데이터 1행
        [1, '수종명 입력', 100, 2.0, 1.5, '', 8, 55000, '10%', '=ROUND(C13*I13,0)', '=H13*J13', '=IF(I13>=0.2,"고위험",IF(I13>=0.1,"중위험","저위험"))', '모니터링', '', ''],
      ]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      // 열 너비 설정
      ws['!cols'] = [
        { wch: 6 }, { wch: 16 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 12 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '신규현장_하자율 예측분석')
      XLSX.writeFile(wb, '하자율예측분석_양식.xlsx')
    } else {
      const ws = XLSX.utils.aoa_to_sheet([selectedType.columns])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, `${selectedType.label}_양식.xlsx`)
    }
  }

  return (
    <div className="space-y-6">
      {/* 업로드 타입 선택 */}
      <div className="grid grid-cols-3 gap-3">
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

      {/* 하자율 예측 분석 안내 */}
      {uploadType === 'defect_analysis' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-xs space-y-1">
          <p className="font-medium text-blue-800">업로드 안내</p>
          <p className="text-blue-700">• 기존 엑셀 템플릿(신규현장_하자율 예측분석 시트)을 그대로 업로드하세요.</p>
          <p className="text-blue-700">• 현장코드는 반드시 시스템에 등록된 코드와 일치해야 합니다.</p>
          <p className="text-blue-700">• 예상하자율은 % 단위(예: 18.52) 또는 소수(예: 0.1852) 둘 다 허용됩니다.</p>
          <p className="text-blue-700">• 예상 예비비 = 단가 × 예상하자수량은 자동 계산됩니다.</p>
        </div>
      )}

      {/* 필수 컬럼 안내 + 템플릿 다운로드 */}
      <div className="flex items-start justify-between rounded-lg bg-muted/50 px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {uploadType === 'defect_analysis' ? '수목 명세 컬럼' : '필수/권장 컬럼'}
          </p>
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
          {/* 하자율 예측: 현장 기본 정보 표시 */}
          {preview.defectAnalysisData && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm grid grid-cols-3 gap-2">
              <div><span className="text-muted-foreground">현장코드: </span><span className="font-medium">{preview.defectAnalysisData.headerInfo.site_code || '-'}</span></div>
              <div><span className="text-muted-foreground">현장명: </span><span className="font-medium">{preview.defectAnalysisData.headerInfo.site_name || '-'}</span></div>
              <div><span className="text-muted-foreground">시공사: </span><span className="font-medium">{preview.defectAnalysisData.headerInfo.contractor_name || '-'}</span></div>
              <div><span className="text-muted-foreground">준공일: </span><span className="font-medium">{preview.defectAnalysisData.headerInfo.completion_date ?? '-'}</span></div>
              <div><span className="text-muted-foreground">식재시기: </span><span className="font-medium">{preview.defectAnalysisData.headerInfo.planting_date ?? '-'}</span></div>
              <div><span className="text-muted-foreground">지역: </span><span className="font-medium">{preview.defectAnalysisData.headerInfo.region || '-'}</span></div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              미리보기 — {fileName}{' '}
              <span className="text-muted-foreground font-normal">
                (총 {preview.allRows.length.toLocaleString()}종, 상위 5행 표시)
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
