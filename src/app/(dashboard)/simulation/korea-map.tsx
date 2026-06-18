'use client'

import { useState, useCallback } from 'react'

export type RegionData = {
  /** 영문 지역 키 (NAME_1 값) */
  region_key: string
  /** 한국어 표시명 */
  label: string
  /** 하자율 0~1 (베이지안 보정값) */
  defect_rate: number
  /** 예상 하자 수량 */
  defect_qty?: number
  /** 식재 수량 */
  planted_qty?: number
  /** 추천 수종 배열 */
  top_species?: string[]
  /** 원시 표본 부족 여부(보정값 신뢰도 낮음) */
  lowSample?: boolean
}

type GeoRegion = {
  name_en: string
  name_ko: string
  d: string
  cx: number
  cy: number
}

type Props = {
  /** 서버에서 파싱해서 내려준 SVG path 데이터 */
  geoRegions: GeoRegion[]
  /** 권역별 하자 데이터 (props 주입) */
  regionData: RegionData[]
  /** SVG viewBox width (default 300) */
  width?: number
  /** SVG viewBox height (default 400) */
  height?: number
}

function riskFill(rate: number): string {
  if (rate >= 0.15) return '#FECACA' // 레드 계열 - 높음
  if (rate >= 0.12) return '#FDE68A' // 앰버 계열 - 중간
  return '#BBF7D0'                   // 그린 계열 - 낮음
}

function riskStroke(rate: number): string {
  if (rate >= 0.15) return '#EF4444'
  if (rate >= 0.12) return '#F59E0B'
  return '#22C55E'
}

function riskTextColor(rate: number): string {
  if (rate >= 0.15) return '#991B1B'
  if (rate >= 0.12) return '#92400E'
  return '#14532D'
}

// 서울·인천·대전·광주·대구·부산·울산 같이 좁은 지역의 라벨 오프셋
const LABEL_OFFSET: Record<string, [number, number]> = {
  '서울': [-18, -8],
  '인천': [-22, 8],
  '대전': [-10, 10],
  '광주': [-8, 12],
  '대구': [8, 0],
  '울산': [8, 0],
  '세종': [12, 0],
}

export function KoreaMap({ geoRegions, regionData, width = 300, height = 400 }: Props) {
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; region: RegionData
  } | null>(null)

  const dataMap = new Map(regionData.map((r) => [r.region_key, r]))

  const handleMouseMove = useCallback((
    e: React.MouseEvent<SVGPathElement>,
    region: RegionData,
  ) => {
    const svg = (e.currentTarget.ownerSVGElement as SVGSVGElement)
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse())
    setTooltip({ x: svgPt.x, y: svgPt.y, region })
  }, [])

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="지역별 하자 위험 지도"
      >
        {geoRegions.map((geo) => {
          const data = dataMap.get(geo.name_en)
          const rate = data?.defect_rate ?? 0
          const fill = data ? riskFill(rate) : '#F3F4F6'
          const stroke = data ? riskStroke(rate) : '#D1D5DB'
          const textColor = data ? riskTextColor(rate) : '#6B7280'
          const offset = LABEL_OFFSET[geo.name_ko] ?? [0, 0]
          const lx = geo.cx + offset[0]
          const ly = geo.cy + offset[1]

          return (
            <g key={geo.name_en}>
              <path
                d={geo.d}
                fill={fill}
                stroke={stroke}
                strokeWidth={0.6}
                className={data ? 'cursor-pointer transition-opacity hover:opacity-75' : ''}
                onMouseMove={data ? (e) => handleMouseMove(e, data) : undefined}
                onMouseLeave={data ? handleMouseLeave : undefined}
              />
              {/* 좁은 지역(광역시)은 비율이 너무 작으므로 일정 크기 이상인 경우만 라벨 */}
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight="500"
                fill={textColor}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {geo.name_ko}
              </text>
              {data && (
                <text
                  x={lx}
                  y={ly + 10}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill={textColor}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {(rate * 100).toFixed(1)}%{data.lowSample ? ' *' : ''}
                </text>
              )}
            </g>
          )
        })}

        {/* 툴팁 (SVG 내부 foreignObject 대신 절대 위치 div 사용) */}
      </svg>

      {/* 툴팁 오버레이 */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(tooltip.x / width) * 100}%`,
            top: `${(tooltip.y / height) * 100}%`,
            transform: 'translate(-50%, -110%)',
            minWidth: 130,
          }}
        >
          <p className="font-semibold text-[#111827] mb-1">{tooltip.region.label}</p>
          <p style={{ color: riskTextColor(tooltip.region.defect_rate) }}>
            하자율 {(tooltip.region.defect_rate * 100).toFixed(1)}%
          </p>
          {tooltip.region.defect_qty != null && (
            <p className="text-[#6B7280] mt-0.5">
              예상 하자 {tooltip.region.defect_qty.toLocaleString()}주
            </p>
          )}
          {tooltip.region.planted_qty != null && (
            <p className="text-[#6B7280]">
              식재 {tooltip.region.planted_qty.toLocaleString()}주
            </p>
          )}
          {tooltip.region.top_species && tooltip.region.top_species.length > 0 && (
            <p className="text-[#6B7280] mt-1">
              추천: {tooltip.region.top_species.join(' · ')}
            </p>
          )}
          {tooltip.region.lowSample && (
            <p className="text-[#9CA3AF] mt-1 text-[10px]">* 표본 부족(보정 추정값)</p>
          )}
        </div>
      )}
    </div>
  )
}
