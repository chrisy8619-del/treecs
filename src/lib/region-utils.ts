// 지역(한국어) → 지도 region_key(영문 NAME_1) 매핑 (서버/클라이언트 공용)
// korea-regions.json의 name_en 값과 일치해야 KoreaMap에서 색칠된다.

// 영문 region_key ↔ 한국어 표시명
export const REGION_KEY_TO_KO: Record<string, string> = {
  Seoul: '서울', Incheon: '인천', 'Gyeonggi-do': '경기', 'Gangwon-do': '강원',
  'Chungcheongbuk-do': '충북', 'Chungcheongnam-do': '충남', Daejeon: '대전',
  'Gyeongsangbuk-do': '경북', 'Gyeongsangnam-do': '경남', Daegu: '대구',
  Busan: '부산', Ulsan: '울산', 'Jeollabuk-do': '전북', 'Jeollanam-do': '전남',
  Gwangju: '광주', Jeju: '제주',
}

export const REGION_KEYS = Object.keys(REGION_KEY_TO_KO)

// 한국어 지역명(다양한 표기: "경기", "경기도", "수원시" 등) → 영문 region_key.
// 매칭 불가 시 null.
export function regionToKey(region: string | null | undefined): string | null {
  if (!region) return null
  const r = region.trim()
  if (!r) return null

  // 광역시·도 표기 우선 매칭 (긴 키워드 먼저 — 충북/충남 등 구분)
  if (r.includes('세종')) return 'Chungcheongnam-do' // 세종 → 충남 권역에 병합
  if (r.includes('서울')) return 'Seoul'
  if (r.includes('인천')) return 'Incheon'
  if (r.includes('경기')) return 'Gyeonggi-do'
  if (r.includes('강원')) return 'Gangwon-do'
  if (r.includes('충북') || r.includes('충청북')) return 'Chungcheongbuk-do'
  if (r.includes('충남') || r.includes('충청남')) return 'Chungcheongnam-do'
  if (r.includes('대전')) return 'Daejeon'
  if (r.includes('경북') || r.includes('경상북')) return 'Gyeongsangbuk-do'
  if (r.includes('경남') || r.includes('경상남')) return 'Gyeongsangnam-do'
  if (r.includes('대구')) return 'Daegu'
  if (r.includes('부산')) return 'Busan'
  if (r.includes('울산')) return 'Ulsan'
  if (r.includes('전북') || r.includes('전라북')) return 'Jeollabuk-do'
  if (r.includes('전남') || r.includes('전라남')) return 'Jeollanam-do'
  if (r.includes('광주')) return 'Gwangju'
  if (r.includes('제주')) return 'Jeju'
  return null
}
