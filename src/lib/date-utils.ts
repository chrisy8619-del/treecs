export function dateToSeasonCode(dateStr: string | null): string | null {
  if (!dateStr) return null
  const month = parseInt(dateStr.slice(5, 7), 10)
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'fall'
  return 'winter'
}
