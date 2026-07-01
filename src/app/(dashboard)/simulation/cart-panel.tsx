'use client'

import { useState } from 'react'
import { ShoppingCart, Trash2, ChevronDown, ChevronUp, Check, X } from 'lucide-react'
import type { CartItem } from '@/app/actions/cart-types'
import type { SubstituteCandidate } from '@/lib/substitute-recommender'

type Props = {
  items: CartItem[]
  status: 'draft' | 'confirmed'
  pending: boolean
  // 원수종명 → 대체 후보들 (비교·교체용)
  subMap: Map<string, SubstituteCandidate[]>
  // 합계(시뮬레이터 계산값 재사용)
  originalWeightedRate: number | null
  improvedWeightedRate: number | null
  reductionEffect: number | null
  costReduction: number | null
  onReplace: (originalName: string, substituteName: string) => void
  onRemove: (originalName: string) => void
  onClear: () => void
  onConfirm: () => void
}

const pct = (v: number | null | undefined) => (v != null ? `${(v * 100).toFixed(1)}%` : '-')
const won = (v: number | null | undefined) => (v != null ? `${Math.round(v).toLocaleString()}원` : '-')

export function CartPanel({
  items,
  status,
  pending,
  subMap,
  originalWeightedRate,
  improvedWeightedRate,
  reductionEffect,
  costReduction,
  onReplace,
  onRemove,
  onClear,
  onConfirm,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const isConfirmed = status === 'confirmed'

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-3.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-[#1a3a2a]" />
          <span className="text-sm font-semibold text-gray-800">대체 결정 장바구니</span>
          <span className="text-xs text-gray-500">담긴 항목 {items.length}건</span>
          {isConfirmed && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
              확정됨
            </span>
          )}
        </div>
        {items.length > 0 && !isConfirmed && (
          <button
            onClick={onClear}
            disabled={pending}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            비우기
          </button>
        )}
      </div>

      {/* 빈 상태 */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 space-y-2">
          <ShoppingCart className="h-9 w-9 text-gray-200" />
          <p className="text-sm">담긴 대체 결정이 없습니다.</p>
          <p className="text-xs text-gray-300">시뮬레이터 표에서 대체 수종을 선택하면 여기에 담깁니다.</p>
        </div>
      )}

      {/* 비교표 */}
      {items.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">원수종</th>
                  <th className="px-4 py-2 text-left font-medium">선택한 대체수종</th>
                  <th className="px-4 py-2 text-right font-medium">원수종 하자율</th>
                  <th className="px-4 py-2 text-right font-medium">개선 하자율</th>
                  <th className="px-4 py-2 text-right font-medium">저감(%p)</th>
                  <th className="px-4 py-2 text-right font-medium">비용 절감</th>
                  <th className="px-4 py-2 text-center font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => {
                  const candidates = subMap.get(item.originalSpeciesName) ?? []
                  const isOpen = expanded === item.originalSpeciesName
                  const costSaving =
                    item.improvedReserveCost != null && item.unitPrice != null && item.originalRate != null && item.quantity != null
                      ? Math.round(item.unitPrice * Math.round(item.quantity * item.originalRate)) - item.improvedReserveCost
                      : null
                  return (
                    <>
                      <tr key={item.originalSpeciesName} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{item.originalSpeciesName}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => setExpanded(isOpen ? null : item.originalSpeciesName)}
                            disabled={isConfirmed}
                            className="flex items-center gap-1 text-[#1a3a2a] font-medium hover:underline disabled:no-underline disabled:text-gray-700"
                          >
                            {item.substituteSpeciesName}
                            {!isConfirmed && (candidates.length > 1) && (
                              isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{pct(item.originalRate)}</td>
                        <td className="px-4 py-2.5 text-right text-blue-600 font-medium">{pct(item.improvedRate)}</td>
                        <td className="px-4 py-2.5 text-right text-green-600 font-medium">{pct(item.reductionRate)}</td>
                        <td className="px-4 py-2.5 text-right text-green-700 font-medium">{won(costSaving)}</td>
                        <td className="px-4 py-2.5 text-center">
                          {!isConfirmed && (
                            <button
                              onClick={() => onRemove(item.originalSpeciesName)}
                              disabled={pending}
                              className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                              title="제거"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* 후보 비교 (펼침) */}
                      {isOpen && !isConfirmed && (
                        <tr key={`${item.originalSpeciesName}-detail`} className="bg-gray-50/60">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="text-[11px] text-gray-500 mb-2">다른 후보로 교체:</div>
                            <div className="flex flex-wrap gap-2">
                              {candidates.map((c) => {
                                const selected = c.name === item.substituteSpeciesName
                                return (
                                  <button
                                    key={c.name}
                                    onClick={() => {
                                      if (!selected) onReplace(item.originalSpeciesName, c.name)
                                      setExpanded(null)
                                    }}
                                    disabled={pending}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-colors disabled:opacity-50 ${
                                      selected
                                        ? 'bg-[#1a3a2a] text-white border-[#1a3a2a]'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#1a3a2a]'
                                    }`}
                                  >
                                    {selected && <Check className="h-3 w-3" />}
                                    {c.isAuto ? '▷ ' : ''}{c.name}
                                    <span className={selected ? 'text-white/80' : 'text-gray-400'}>
                                      ({pct(c.rate)})
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
              {/* 합계 행 */}
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr className="font-semibold text-gray-800">
                  <td className="px-4 py-2.5" colSpan={2}>현장 전체(가중평균)</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{pct(originalWeightedRate)}</td>
                  <td className="px-4 py-2.5 text-right text-blue-600">{pct(improvedWeightedRate)}</td>
                  <td className="px-4 py-2.5 text-right text-green-600">{pct(reductionEffect)}</td>
                  <td className="px-4 py-2.5 text-right text-green-700" colSpan={2}>{won(costReduction)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 확정 버튼 */}
          {!isConfirmed && (
            <div className="px-5 py-3 border-t flex items-center justify-end gap-2">
              <button
                onClick={onConfirm}
                disabled={pending}
                className="flex items-center gap-2 bg-[#1a3a2a] hover:bg-[#24503a] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                최종 선택 · 저장
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
