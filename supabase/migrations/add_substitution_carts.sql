-- 대체수종 "장바구니"(설계 의사결정 기록) 테이블
-- 본래 의도(예측 → 설계반영 → 예방)의 "설계반영" 단계 산출물.
-- 현장 단위로 대체 결정(원수종 → 대체수종)을 담고 비교·확정한다.

-- ─────────────────────────────────────────────────────────────
-- 1) 장바구니 (현장당 draft 1개 + confirmed 이력 보존)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS substitution_carts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  site_id         UUID NOT NULL REFERENCES sites(id),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'confirmed')),
  title           TEXT,                          -- 예: "만촌 현장 가을식재 대체안"
  created_by      UUID REFERENCES profiles(id),  -- 공통 감사 필드
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 현장당 활성(draft) 카트는 1개만 — 부분 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_active_per_site
  ON substitution_carts (organization_id, site_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_cart_site ON substitution_carts(site_id);

-- ─────────────────────────────────────────────────────────────
-- 2) 장바구니 항목 = "대체 결정" 단위 (원수종 → 대체수종)
--    수종은 id 참조(정합성) + 이름 스냅샷(UI/계산 무손실, species_substitutions 패턴과 일관)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS substitution_cart_items (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id                 UUID NOT NULL REFERENCES substitution_carts(id) ON DELETE CASCADE,
  original_species_id     UUID REFERENCES species(id),
  original_species_name   TEXT NOT NULL,
  substitute_species_id   UUID REFERENCES species(id),
  substitute_species_name TEXT NOT NULL,
  -- 결정 시점 스냅샷 (회귀모델/데이터 변경 후에도 결정 근거 보존)
  quantity                INT,                  -- 해당 현장 원수종 식재 수량
  unit_price              NUMERIC(12,0),        -- 결정 시점 단가 스냅샷(원)
  original_rate           NUMERIC(6,4),         -- 결정 시점 원수종 수목하자율
  improved_rate           NUMERIC(6,4),         -- 결정 시점 대체수종 개선 하자율
  candidate_rank          INT,                  -- 선택된 후보 순위(1~3), 분석용
  source                  TEXT,                 -- 'db' | 'altrec' | 'auto' | 'finder'
  -- 트리거 자동 계산 컬럼 (add_reserve_cost_columns.sql 패턴 차용)
  reduction_rate          NUMERIC(6,4),         -- = original_rate - improved_rate
  improved_defect_qty     INT,                  -- = ROUND(quantity * improved_rate)
  improved_reserve_cost   NUMERIC(15,0),        -- = unit_price * improved_defect_qty
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, original_species_name)       -- 원수종당 1개 결정
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON substitution_cart_items(cart_id);

-- ─────────────────────────────────────────────────────────────
-- 3) 파생값 자동 계산 트리거 (add_reserve_cost_columns.sql 패턴 동일)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION calc_cart_item_derived()
RETURNS TRIGGER AS $$
BEGIN
  -- 저감율 = 원수종 하자율 - 대체수종 하자율
  IF NEW.original_rate IS NOT NULL AND NEW.improved_rate IS NOT NULL THEN
    NEW.reduction_rate := NEW.original_rate - NEW.improved_rate;
  END IF;

  -- 개선 후 예상 하자수량
  IF NEW.quantity IS NOT NULL AND NEW.improved_rate IS NOT NULL THEN
    NEW.improved_defect_qty := ROUND(NEW.quantity * NEW.improved_rate);
  END IF;

  -- 개선 후 예상 예비비
  IF NEW.unit_price IS NOT NULL AND NEW.improved_defect_qty IS NOT NULL THEN
    NEW.improved_reserve_cost := NEW.unit_price * NEW.improved_defect_qty;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cart_item_derived ON substitution_cart_items;
CREATE TRIGGER trg_cart_item_derived
  BEFORE INSERT OR UPDATE ON substitution_cart_items
  FOR EACH ROW EXECUTE FUNCTION calc_cart_item_derived();

-- ─────────────────────────────────────────────────────────────
-- 4) updated_at 자동 갱신 트리거 (carts)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_cart_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cart_touch ON substitution_carts;
CREATE TRIGGER trg_cart_touch
  BEFORE UPDATE ON substitution_carts
  FOR EACH ROW EXECUTE FUNCTION touch_cart_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5) RLS — 조직 단위 격리 (profiles 조인 패턴)
--    서버액션의 organization_id 명시 필터와 함께 이중 방어.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE substitution_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitution_cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "조직원 카트 조회" ON substitution_carts;
CREATE POLICY "조직원 카트 조회" ON substitution_carts
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "조직원 카트 변경" ON substitution_carts;
CREATE POLICY "조직원 카트 변경" ON substitution_carts
  FOR ALL USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "조직원 카트항목 조회" ON substitution_cart_items;
CREATE POLICY "조직원 카트항목 조회" ON substitution_cart_items
  FOR SELECT USING (
    cart_id IN (
      SELECT c.id FROM substitution_carts c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.organization_id = p.organization_id
    )
  );

DROP POLICY IF EXISTS "조직원 카트항목 변경" ON substitution_cart_items;
CREATE POLICY "조직원 카트항목 변경" ON substitution_cart_items
  FOR ALL USING (
    cart_id IN (
      SELECT c.id FROM substitution_carts c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.organization_id = p.organization_id
    )
  )
  WITH CHECK (
    cart_id IN (
      SELECT c.id FROM substitution_carts c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.organization_id = p.organization_id
    )
  );
