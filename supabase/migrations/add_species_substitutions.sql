-- 대체 수종 매핑 테이블
CREATE TABLE IF NOT EXISTS species_substitutions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  original_species_id   UUID NOT NULL REFERENCES species(id),
  substitute_species_id UUID NOT NULL REFERENCES species(id),
  improved_defect_rate  NUMERIC(6,4) NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, original_species_id, substitute_species_id)
);
