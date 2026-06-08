/**
 * 수종별·지역별·계절별 대체 수종 지식 데이터베이스
 *
 * 출처: 한국 조경·산림 수종의 지역·계절별 대체 수종 연구 자료 종합
 * - 기후변화 대응 수종 대체 방안 연구 (충청남도 산림)
 * - 기후·지형 조건 반영 주요 수종 반경 생장 반응 및 잠재 분포 예측 연구
 * - 경남 소나무 대체 수종 논의 (편백 등)
 * - 충북 가로수 수종 실태 및 이팝나무 보급 현황
 * - 왕벚나무 품귀 현상과 대체 수종 논의
 * - 정원 교목 가이드 및 수종별 특성 자료
 */

export type Region = '중부내륙' | '남부내륙' | '남부해안제주' | '북부고랭지'
export type Season = '봄' | '여름' | '가을' | '겨울'
export type RiskCategory = '고위험' | '중위험'

export interface SubstituteEntry {
  /** 대체 수종명 */
  name: string
  /** 추천 이유 요약 */
  reason: string
  /** 적합 지역 */
  regions: Region[]
  /** 주요 계절 기능 */
  seasons: Season[]
}

export interface SpeciesKnowledge {
  /** 기준 수종명 */
  speciesName: string
  /** 별칭·학명 */
  aliases?: string[]
  /** 기후변화·병해충 리스크 특성 */
  riskNote: string
  /** 지역·계절별 추천 대체 수종 (3종 원칙, 기준 수종 제외) */
  substitutes: SubstituteEntry[]
}

/** 수종별 지식 데이터 */
export const SPECIES_KNOWLEDGE: SpeciesKnowledge[] = [
  {
    speciesName: '왕벚나무',
    aliases: ['벚나무', '왕벚'],
    riskNote: '묘목 품귀 현상 발생. 단일 수종 집중 식재로 병해충·기후 리스크 집중. 봄철 1주일 개화 집중으로 계절 경관 분산 필요.',
    substitutes: [
      { name: '이팝나무',   reason: '5월 흰 꽃이 나무 전체를 덮어 눈꽃 경관 연출. 병해충 적고 민원 적음. 충북 가로수 상위 3위 보급.',         regions: ['중부내륙','남부내륙','북부고랭지'], seasons: ['봄'] },
      { name: '목련',       reason: '3~4월 대형 향기 있는 백화. 우아한 봄 포인트 수종.',                                                         regions: ['중부내륙','남부내륙','북부고랭지'], seasons: ['봄'] },
      { name: '산수유',     reason: '3월 이른 봄 노란 꽃. 봄 경관을 2개월로 분산. 내한성 강함.',                                                regions: ['중부내륙','북부고랭지'],            seasons: ['봄'] },
      { name: '배롱나무',   reason: '7~9월 장기 분홍꽃. 봄꽃 이후 여름 경관 공백 보완.',                                                         regions: ['남부내륙','남부해안제주'],           seasons: ['여름'] },
      { name: '계수나무',   reason: '가을 황금빛 단풍과 달콤한 향기. 봄꽃 기능을 가을로 연장.',                                                  regions: ['중부내륙','남부내륙'],              seasons: ['가을'] },
      { name: '동백나무',   reason: '겨울~초봄 붉은 꽃 + 상록성. 해안·제주 온난지 적합.',                                                        regions: ['남부해안제주'],                     seasons: ['겨울','봄'] },
      { name: '후박나무',   reason: '남부 해안 대표 상록 교목. 짙은 녹음과 독특한 질감. 내염성 우수.',                                           regions: ['남부해안제주'],                     seasons: ['여름','겨울'] },
      { name: '자작나무',   reason: '흰 수피와 수형. 고랭지 봄꽃 분위기. 눈 덮인 겨울 경관 탁월.',                                              regions: ['북부고랭지'],                       seasons: ['봄','겨울'] },
      { name: '살구나무',   reason: '내한성 있는 봄꽃 교목. 이른 봄 분홍꽃.',                                                                    regions: ['북부고랭지'],                       seasons: ['봄'] },
    ],
  },
  {
    speciesName: '은행나무',
    aliases: ['은행'],
    riskNote: '암나무 열매 악취·미끄러운 노면·알레르기 민원 증가. 수나무 위주 전환 또는 대체 수종 검토 필요.',
    substitutes: [
      { name: '단풍나무',   reason: '가을 붉은~주황색 단풍. 은행 황금빛 대비 색채 다양화.',                                                       regions: ['중부내륙','남부내륙','북부고랭지'], seasons: ['가을'] },
      { name: '계수나무',   reason: '가을 황금빛 단풍과 향기. 은행나무 황금색 경관 유사 효과.',                                                  regions: ['중부내륙','남부내륙'],              seasons: ['가을'] },
      { name: '회화나무',   reason: '여름 황백색 꽃 + 가을 꼬투리 열매. 사계절 관상가치. 서원·향교 전통 경관수.',                              regions: ['중부내륙','남부내륙'],              seasons: ['여름','가을'] },
      { name: '느티나무',   reason: '넓은 수관의 강한 녹음. 가을 단풍. 전통 정자나무.',                                                           regions: ['중부내륙','남부내륙'],              seasons: ['여름','가을'] },
      { name: '녹나무',     reason: '남부 해안 상록 교목. 겨울에도 녹색 경관 유지.',                                                              regions: ['남부해안제주'],                     seasons: ['겨울','여름'] },
      { name: '타마릭스',   reason: '봄~여름 분홍꽃 + 섬세한 잎. 내염성 강해 해안 가로수 적합.',                                               regions: ['남부해안제주'],                     seasons: ['봄','여름'] },
      { name: '자작나무',   reason: '흰 수피와 가을색. 겨울 수형 탁월. 고랭지 대표 교목.',                                                       regions: ['북부고랭지'],                       seasons: ['가을','겨울'] },
      { name: '신갈나무',   reason: '내한성 참나무류. 가을 단풍 + 견고한 수형.',                                                                  regions: ['북부고랭지'],                       seasons: ['가을'] },
      { name: '황철나무',   reason: '내한성 강한 참나무류 단풍. 북부·고랭지 적합.',                                                               regions: ['북부고랭지'],                       seasons: ['가을'] },
    ],
  },
  {
    speciesName: '플라타너스',
    aliases: ['양버즘나무', '버즘나무'],
    riskNote: '강한 가지치기 필요. 꽃가루 문제. 뿌리 돌출로 포장 파손. 단일 수종 장거리 식재 리스크.',
    substitutes: [
      { name: '느티나무',   reason: '넓은 수관으로 강한 여름 차양. 전통 마을 정자나무. 도시 환경 적응 우수.',                                   regions: ['중부내륙','남부내륙'],              seasons: ['여름'] },
      { name: '이팝나무',   reason: '5월 흰 꽃으로 봄 경관 확보. 병해충 적고 관리 용이.',                                                        regions: ['중부내륙','남부내륙'],              seasons: ['봄'] },
      { name: '곰솔',       reason: '해풍·염분에 강한 방풍 수종. 전통 해안 가로수.',                                                              regions: ['남부해안제주'],                     seasons: ['겨울','여름'] },
      { name: '해송',       reason: '내염성 강한 해안 방풍림 수종. 20~30m 대형 교목으로 차양 효과.',                                             regions: ['남부해안제주'],                     seasons: ['겨울','여름'] },
      { name: '들메나무',   reason: '내한성 강한 활엽 교목. 강풍·적설 저항성 우수.',                                                              regions: ['북부고랭지'],                       seasons: ['여름'] },
      { name: '자작나무',   reason: '흰 수피와 수형. 고랭지 경관 적합.',                                                                          regions: ['북부고랭지'],                       seasons: ['겨울'] },
    ],
  },
  {
    speciesName: '소나무',
    aliases: ['솔나무', '적송'],
    riskNote: '기후변화 시 기온 상승에 민감하게 생장 저하. 재선충병 취약. 남부·해안지역 생육지 참나무류로 대체 예측. 단순림 구조 개선 필요.',
    substitutes: [
      { name: '신갈나무',   reason: '기온 상승에 정(+)반응. 기후변화 시 소나무 생육지 대체 예측 수종.',                                          regions: ['중부내륙','북부고랭지'],            seasons: ['여름','가을'] },
      { name: '상수리나무', reason: '충청남도 산림 최우점 참나무류. 기후변화 대응 혼합림 구성 핵심 수종.',                                       regions: ['중부내륙','남부내륙'],              seasons: ['여름','가을'] },
      { name: '굴참나무',   reason: '내건성 강한 참나무류. 기후 회복력 높은 혼합림 구성.',                                                        regions: ['중부내륙','남부내륙'],              seasons: ['여름','가을'] },
      { name: '편백',       reason: '피톤치드 방출 우수. 남부지방·제주 온난지 적응. 재선충병 저항성 비교적 우수. 경남 소나무 대체 유력 후보.', regions: ['남부내륙','남부해안제주'],          seasons: ['겨울','여름'] },
      { name: '삼나무',     reason: '남부 임업 경제수. 조림·간벌 통한 목재 생산과 경관 조성 병행.',                                              regions: ['남부내륙','남부해안제주'],          seasons: ['겨울'] },
      { name: '졸참나무',   reason: '중·남부 활엽 교목. 편백·삼나무와 혼식 시 생물다양성·병해충 저항성 제고.',                                  regions: ['남부내륙'],                         seasons: ['여름','가을'] },
      { name: '곰솔',       reason: '해풍·염분 강한 해안 방풍림 수종. 전통 해안 소나무 대체재.',                                                  regions: ['남부해안제주'],                     seasons: ['겨울','여름'] },
      { name: '전나무',     reason: '한랭지 침엽수. 내한성 강하고 상록 경관 우수.',                                                               regions: ['북부고랭지'],                       seasons: ['겨울'] },
      { name: '분비나무',   reason: '고산·한랭지 적응 침엽수. 강원 고지대 적합.',                                                                 regions: ['북부고랭지'],                       seasons: ['겨울'] },
    ],
  },
  {
    speciesName: '느티나무',
    aliases: ['규목'],
    riskNote: '도시화·도로 확장으로 뿌리 공간 부족. 가지치기 요구 증가. 대형 수목 유지 어려운 소형 공간에서 대체 검토.',
    substitutes: [
      { name: '회화나무',   reason: '서원·향교 전통 경관수. 약용·관상 가치. 여름 꽃 + 가을 열매. 광범위 분포(남해안~함경북도).',              regions: ['중부내륙','남부내륙'],              seasons: ['여름','가을'] },
      { name: '느릅나무',   reason: '전통 마을숲 대형 그늘수. 느티나무와 유사 역할.',                                                             regions: ['중부내륙'],                         seasons: ['여름'] },
      { name: '팽나무',     reason: '전통 마을숲 대형 그늘수. 내염성 있어 해안 마을숲에도 적합.',                                                regions: ['중부내륙','남부내륙'],              seasons: ['여름'] },
      { name: '곰솔',       reason: '해풍 저항 + 상록 방풍림 기능. 해안 마을숲 전통 수종.',                                                      regions: ['남부해안제주'],                     seasons: ['겨울','여름'] },
      { name: '녹나무',     reason: '남부 해안 상록 교목. 겨울에도 녹색 마을숲 유지.',                                                            regions: ['남부해안제주'],                     seasons: ['겨울','여름'] },
      { name: '들메나무',   reason: '내한성 강한 활엽 교목. 고랭지 그늘수로 활용.',                                                               regions: ['북부고랭지'],                       seasons: ['여름'] },
    ],
  },
  {
    speciesName: '일본잎갈나무',
    aliases: ['낙엽송'],
    riskNote: '기온 상승에 민감하게 생장 저하. 남부지역 생육 부적합 예측. 기후변화 취약 수종.',
    substitutes: [
      { name: '신갈나무',   reason: '기온 상승 적응성 우수. 기후변화 대응 혼합림 전환 핵심.',                                                     regions: ['중부내륙','북부고랭지'],            seasons: ['여름','가을'] },
      { name: '상수리나무', reason: '기후변화 시 생육지 확대 예측 참나무류. 경제림 기능도 보완.',                                                 regions: ['중부내륙','남부내륙'],              seasons: ['여름','가을'] },
      { name: '전나무',     reason: '한랭지 침엽수. 낙엽송 대체 상록 침엽 혼합림 구성.',                                                          regions: ['북부고랭지'],                       seasons: ['겨울'] },
    ],
  },
  {
    speciesName: '밤나무',
    riskNote: '기온 상승에 민감하게 생장 저하. 잠재 분포 남부지역 중심으로 축소 예측.',
    substitutes: [
      { name: '상수리나무', reason: '기후변화 적응성 우수 참나무류. 충청남도 산림 최우점종.',                                                      regions: ['중부내륙','남부내륙'],              seasons: ['여름','가을'] },
      { name: '굴참나무',   reason: '내건성·내열성 강한 참나무류.',                                                                               regions: ['중부내륙','남부내륙'],              seasons: ['여름','가을'] },
      { name: '졸참나무',   reason: '중·남부 분포 활엽 교목. 혼합림 구성.',                                                                       regions: ['남부내륙'],                         seasons: ['여름','가을'] },
    ],
  },
]

/**
 * 수종명으로 지식 데이터 조회 (별칭 포함)
 */
export function findSpeciesKnowledge(name: string): SpeciesKnowledge | undefined {
  return SPECIES_KNOWLEDGE.find(
    (k) =>
      k.speciesName === name ||
      (k.aliases && k.aliases.includes(name))
  )
}

/**
 * 현장 지역코드(region)를 Region 타입으로 매핑
 * DB region 값이 없을 경우 '중부내륙' 기본 적용
 */
export function mapRegion(region: string | null | undefined): Region {
  if (!region) return '중부내륙'
  if (region.includes('제주') || region.includes('남해') || region.includes('여수') || region.includes('통영') || region.includes('거제') || region.includes('목포') || region.includes('완도') || region.includes('고흥')) return '남부해안제주'
  if (region.includes('강원') || region.includes('철원') || region.includes('화천') || region.includes('양구') || region.includes('인제') || region.includes('고성') || region.includes('평창') || region.includes('태백') || region.includes('정선')) return '북부고랭지'
  if (region.includes('경남') || region.includes('경북') || region.includes('전남') || region.includes('전북') || region.includes('광주') || region.includes('부산') || region.includes('울산') || region.includes('대구') || region.includes('창원') || region.includes('진주') || region.includes('순천') || region.includes('여수')) return '남부내륙'
  return '중부내륙'
}

/**
 * 특정 수종·지역에 맞는 대체 수종 최대 3개 반환 (기준 수종명 제외)
 */
export function getRecommendedSubstitutes(
  speciesName: string,
  region: Region,
  count = 3
): SubstituteEntry[] {
  const knowledge = findSpeciesKnowledge(speciesName)
  if (!knowledge) return []

  // 해당 지역 포함 항목 우선, 없으면 전체에서 선택
  const matched = knowledge.substitutes.filter((s) =>
    s.regions.includes(region) && s.name !== speciesName
  )
  const fallback = knowledge.substitutes.filter(
    (s) => !matched.includes(s) && s.name !== speciesName
  )

  return [...matched, ...fallback].slice(0, count)
}
