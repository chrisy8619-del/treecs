-- ============================================================
-- 조경 수목 하자율 분석 시스템 - Supabase Schema
-- 4층 구조: 마스터 / 운영입력 / 업로드이관 / 집계분석
-- ============================================================

-- UUID 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- LAYER 0: 조직/권한
-- ============================================================

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'viewer')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_site_permissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id         UUID NOT NULL, -- FK 아래 sites 생성 후 추가
  permission_type TEXT NOT NULL CHECK (permission_type IN ('read', 'write', 'admin')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, site_id)
);

-- ============================================================
-- LAYER 1: 마스터 테이블
-- ============================================================

CREATE TABLE sites (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  site_name        TEXT NOT NULL,
  site_code        TEXT NOT NULL,
  region           TEXT,
  address          TEXT,
  project_type     TEXT,
  occupancy_date   DATE,
  start_date       DATE,
  end_date         DATE,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'pending')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, site_code)
);

-- user_site_permissions FK 추가 (sites 생성 후)
ALTER TABLE user_site_permissions
  ADD CONSTRAINT fk_usp_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;

CREATE TABLE contractors (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  contractor_name  TEXT NOT NULL,
  contractor_code  TEXT NOT NULL,
  contact_name     TEXT,
  contact_phone    TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, contractor_code)
);

CREATE TABLE species_groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_name  TEXT NOT NULL,
  group_code  TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE species (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  species_group_id UUID REFERENCES species_groups(id),
  species_name_ko  TEXT NOT NULL,
  species_name_en  TEXT,
  species_code     TEXT NOT NULL UNIQUE,
  scientific_name  TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE spec_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spec_label_raw  TEXT NOT NULL UNIQUE,   -- 원본 문자열 (H2.5xB8 등)
  height_m        NUMERIC(5,2),
  width_m         NUMERIC(5,2),
  rootball_r      NUMERIC(5,2),
  caliper         NUMERIC(5,2),
  parsed_success  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE defect_types (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  defect_type_name TEXT NOT NULL,
  defect_code      TEXT NOT NULL UNIQUE,
  description      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

-- 리스크 레벨 기준 테이블 (기준 변경 대응)
CREATE TABLE risk_thresholds (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_type TEXT NOT NULL,         -- 'defect_rate'
  level_name  TEXT NOT NULL,         -- 'Level 1' ~ 'Level 4'
  min_value   NUMERIC(5,4) NOT NULL, -- 0.10
  max_value   NUMERIC(5,4) NOT NULL, -- 0.20
  color_code  TEXT,                  -- '#FF0000'
  sort_order  INT NOT NULL
);

-- 초기 리스크 레벨 데이터
INSERT INTO risk_thresholds (metric_type, level_name, min_value, max_value, color_code, sort_order) VALUES
  ('defect_rate', 'Level 1', 0.00, 0.10, '#22c55e', 1),
  ('defect_rate', 'Level 2', 0.10, 0.20, '#eab308', 2),
  ('defect_rate', 'Level 3', 0.20, 0.35, '#f97316', 3),
  ('defect_rate', 'Level 4', 0.35, 1.00, '#ef4444', 4);

-- ============================================================
-- LAYER 2: 운영 입력 트랜잭션 테이블
-- ============================================================

CREATE TABLE planting_records (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  site_id               UUID NOT NULL REFERENCES sites(id),
  contractor_id         UUID NOT NULL REFERENCES contractors(id),
  species_id            UUID NOT NULL REFERENCES species(id),
  spec_code_id          UUID NOT NULL REFERENCES spec_codes(id),
  planting_date         DATE,
  occupancy_basis_date  DATE,
  quantity_planted      INT NOT NULL CHECK (quantity_planted > 0),
  unit                  TEXT NOT NULL DEFAULT '주',
  source_type           TEXT NOT NULL DEFAULT 'form' CHECK (source_type IN ('form', 'excel_import', 'migration')),
  source_batch_id       UUID,  -- import_batches.id 참조용
  notes                 TEXT,
  created_by            UUID REFERENCES users(id),
  updated_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_rounds (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL REFERENCES organizations(id),
  site_id                UUID NOT NULL REFERENCES sites(id),
  inspection_name        TEXT,
  inspection_date        DATE NOT NULL,
  inspection_year        INT NOT NULL GENERATED ALWAYS AS (EXTRACT(YEAR FROM inspection_date)::INT) STORED,
  inspection_month       INT NOT NULL GENERATED ALWAYS AS (EXTRACT(MONTH FROM inspection_date)::INT) STORED,
  season_code            TEXT CHECK (season_code IN ('spring', 'summer', 'fall', 'winter')),
  inspection_basis_type  TEXT CHECK (inspection_basis_type IN ('occupancy', 'planting', 'inspection')),
  performed_by           TEXT,
  notes                  TEXT,
  created_by             UUID REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inspection_items (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_round_id  UUID NOT NULL REFERENCES inspection_rounds(id) ON DELETE CASCADE,
  planting_record_id   UUID REFERENCES planting_records(id),
  site_id              UUID NOT NULL REFERENCES sites(id),
  contractor_id        UUID NOT NULL REFERENCES contractors(id),
  species_id           UUID NOT NULL REFERENCES species(id),
  spec_code_id         UUID NOT NULL REFERENCES spec_codes(id),
  quantity_inspected   INT NOT NULL CHECK (quantity_inspected >= 0),
  defect_quantity      INT NOT NULL DEFAULT 0 CHECK (defect_quantity >= 0),
  defect_rate_cached   NUMERIC(5,4),  -- 조회 편의용 캐시, 진실값 아님
  notes                TEXT,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_defect_lte_inspected CHECK (defect_quantity <= quantity_inspected),
  UNIQUE (inspection_round_id, planting_record_id, species_id, spec_code_id)
);

CREATE TABLE defect_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_item_id  UUID NOT NULL REFERENCES inspection_items(id) ON DELETE CASCADE,
  defect_type_id      UUID REFERENCES defect_types(id),
  defect_quantity     INT NOT NULL CHECK (defect_quantity > 0),
  severity_level      TEXT CHECK (severity_level IN ('low', 'medium', 'high')),
  action_required     BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE maintenance_actions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inspection_item_id  UUID NOT NULL REFERENCES inspection_items(id),
  action_type         TEXT NOT NULL,
  action_date         DATE NOT NULL,
  action_result       TEXT,
  notes               TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LAYER 3: 업로드/이관 테이블
-- ============================================================

CREATE TABLE import_batches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  file_name       TEXT NOT NULL,
  file_type       TEXT NOT NULL DEFAULT 'xlsx',
  upload_user_id  UUID REFERENCES users(id),
  import_status   TEXT NOT NULL DEFAULT 'pending' CHECK (import_status IN ('pending', 'processing', 'done', 'failed')),
  imported_at     TIMESTAMPTZ,
  row_count       INT,
  success_count   INT,
  fail_count      INT,
  error_summary   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE import_rows_raw (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  import_batch_id         UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  sheet_name              TEXT,
  row_number              INT NOT NULL,
  raw_payload_json        JSONB NOT NULL,  -- 엑셀 행 원본 그대로
  parsed_status           TEXT NOT NULL DEFAULT 'pending' CHECK (parsed_status IN ('pending', 'success', 'failed', 'skipped')),
  parsed_message          TEXT,
  normalized_site_name    TEXT,
  normalized_species_name TEXT,
  normalized_spec_label   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LAYER 4: 집계/분석 테이블
-- ============================================================

CREATE TABLE agg_metrics_by_year (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  year                  INT NOT NULL,
  total_quantity        INT NOT NULL DEFAULT 0,
  total_defect_quantity INT NOT NULL DEFAULT 0,
  defect_rate           NUMERIC(5,4),
  site_count            INT NOT NULL DEFAULT 0,
  species_count         INT NOT NULL DEFAULT 0,
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, year)
);

CREATE TABLE agg_metrics_by_season (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  year                  INT NOT NULL,
  season_code           TEXT NOT NULL,
  total_quantity        INT NOT NULL DEFAULT 0,
  total_defect_quantity INT NOT NULL DEFAULT 0,
  defect_rate           NUMERIC(5,4),
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, year, season_code)
);

CREATE TABLE agg_metrics_by_species (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  species_id            UUID NOT NULL REFERENCES species(id),
  year                  INT,
  total_quantity        INT NOT NULL DEFAULT 0,
  total_defect_quantity INT NOT NULL DEFAULT 0,
  defect_rate           NUMERIC(5,4),
  ranking               INT,
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, species_id, year)
);

CREATE TABLE agg_metrics_by_species_spec (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  species_id            UUID NOT NULL REFERENCES species(id),
  spec_code_id          UUID NOT NULL REFERENCES spec_codes(id),
  year                  INT,
  total_quantity        INT NOT NULL DEFAULT 0,
  total_defect_quantity INT NOT NULL DEFAULT 0,
  defect_rate           NUMERIC(5,4),
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, species_id, spec_code_id, year)
);

CREATE TABLE agg_metrics_by_contractor (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  contractor_id         UUID NOT NULL REFERENCES contractors(id),
  year                  INT,
  site_count            INT NOT NULL DEFAULT 0,
  total_quantity        INT NOT NULL DEFAULT 0,
  total_defect_quantity INT NOT NULL DEFAULT 0,
  defect_rate           NUMERIC(5,4),
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, contractor_id, year)
);

CREATE TABLE agg_metrics_species_season (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  species_id            UUID NOT NULL REFERENCES species(id),
  year                  INT NOT NULL,
  season_code           TEXT NOT NULL,
  total_quantity        INT NOT NULL DEFAULT 0,
  total_defect_quantity INT NOT NULL DEFAULT 0,
  defect_rate           NUMERIC(5,4),
  risk_level            TEXT,
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, species_id, year, season_code)
);

CREATE TABLE agg_dashboard_snapshots (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id      UUID NOT NULL REFERENCES organizations(id),
  snapshot_name        TEXT NOT NULL,
  filter_payload_json  JSONB,
  snapshot_payload_json JSONB NOT NULL,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 인덱스
-- ============================================================

-- 조회 빈도 높은 컬럼 위주
CREATE INDEX idx_planting_records_site ON planting_records(site_id);
CREATE INDEX idx_planting_records_species ON planting_records(species_id);
CREATE INDEX idx_planting_records_contractor ON planting_records(contractor_id);
CREATE INDEX idx_planting_records_spec ON planting_records(spec_code_id);

CREATE INDEX idx_inspection_rounds_site ON inspection_rounds(site_id);
CREATE INDEX idx_inspection_rounds_year ON inspection_rounds(inspection_year);

CREATE INDEX idx_inspection_items_round ON inspection_items(inspection_round_id);
CREATE INDEX idx_inspection_items_species ON inspection_items(species_id);
CREATE INDEX idx_inspection_items_contractor ON inspection_items(contractor_id);
CREATE INDEX idx_inspection_items_spec ON inspection_items(spec_code_id);

CREATE INDEX idx_import_rows_batch ON import_rows_raw(import_batch_id);
CREATE INDEX idx_import_rows_status ON import_rows_raw(parsed_status);

-- ============================================================
-- defect_rate_cached 자동 갱신 트리거
-- ============================================================

CREATE OR REPLACE FUNCTION update_defect_rate_cached()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity_inspected > 0 THEN
    NEW.defect_rate_cached := ROUND(NEW.defect_quantity::NUMERIC / NEW.quantity_inspected, 4);
  ELSE
    NEW.defect_rate_cached := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inspection_items_defect_rate
  BEFORE INSERT OR UPDATE ON inspection_items
  FOR EACH ROW EXECUTE FUNCTION update_defect_rate_cached();

-- updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON sites FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_contractors_updated_at BEFORE UPDATE ON contractors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_species_updated_at BEFORE UPDATE ON species FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_spec_codes_updated_at BEFORE UPDATE ON spec_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_planting_records_updated_at BEFORE UPDATE ON planting_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inspection_rounds_updated_at BEFORE UPDATE ON inspection_rounds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inspection_items_updated_at BEFORE UPDATE ON inspection_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- LAYER 5: 인증/사용자 프로필
-- ============================================================

CREATE TABLE profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT NOT NULL,
  name        TEXT,
  department  TEXT,
  phone       TEXT,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 신규 가입 시 자동 profiles 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'name',
    'user',
    'pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "본인 프로필 조회" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "본인 프로필 수정" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "관리자 전체 조회" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "슈퍼관리자 전체 수정" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- ============================================================
-- 엑셀 업로드 로그
-- ============================================================

CREATE TABLE upload_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uploaded_by   UUID REFERENCES profiles(id),
  file_name     TEXT NOT NULL,
  upload_type   TEXT DEFAULT '점검결과',
  row_count     INTEGER,
  status        TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE upload_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "관리자 업로드 로그 조회" ON upload_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "관리자 업로드 가능" ON upload_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
