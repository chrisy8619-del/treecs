-- planting_records에 단가·예상하자율·예비비 컬럼 추가
ALTER TABLE planting_records
  ADD COLUMN IF NOT EXISTS unit_price           NUMERIC(12,0),   -- 조달청 기준 단가(원)
  ADD COLUMN IF NOT EXISTS expected_defect_rate  NUMERIC(6,4),    -- 예상 하자율 (0.1852 = 18.52%)
  ADD COLUMN IF NOT EXISTS expected_defect_qty   INT,             -- 예상 하자수량 = ROUND(quantity_planted * expected_defect_rate)
  ADD COLUMN IF NOT EXISTS expected_reserve_cost NUMERIC(15,0),   -- 예상 예비비 = unit_price * expected_defect_qty
  ADD COLUMN IF NOT EXISTS risk_level            TEXT             -- '고위험' | '중위험' | '저위험'
    CHECK (risk_level IN ('고위험', '중위험', '저위험'));

-- 리스크 등급 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION calc_planting_reserve()
RETURNS TRIGGER AS $$
BEGIN
  -- 예상 하자수량
  IF NEW.expected_defect_rate IS NOT NULL AND NEW.quantity_planted IS NOT NULL THEN
    NEW.expected_defect_qty := ROUND(NEW.quantity_planted * NEW.expected_defect_rate);
  END IF;

  -- 예상 예비비
  IF NEW.unit_price IS NOT NULL AND NEW.expected_defect_qty IS NOT NULL THEN
    NEW.expected_reserve_cost := NEW.unit_price * NEW.expected_defect_qty;
  END IF;

  -- 리스크 등급 (엑셀 기준: ≥20% 고위험, ≥10% 중위험, 미만 저위험)
  IF NEW.expected_defect_rate IS NOT NULL THEN
    NEW.risk_level := CASE
      WHEN NEW.expected_defect_rate >= 0.20 THEN '고위험'
      WHEN NEW.expected_defect_rate >= 0.10 THEN '중위험'
      ELSE '저위험'
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_planting_reserve
  BEFORE INSERT OR UPDATE ON planting_records
  FOR EACH ROW EXECUTE FUNCTION calc_planting_reserve();
