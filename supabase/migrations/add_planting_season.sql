-- planting_records에 식재 계절 컬럼 추가
-- planting_season: 계절(수식) P열 기준으로 한 계절 이전 값 저장
-- 예) 계절(수식)=봄 → planting_season=winter (겨울에 식재)
ALTER TABLE planting_records
  ADD COLUMN IF NOT EXISTS planting_season TEXT
    CHECK (planting_season IN ('spring', 'summer', 'fall', 'winter'));
