-- 사용자 계정 소프트 삭제 지원: profiles.status에 'deleted' 값 추가
-- 기존 CHECK 제약은 ('pending', 'active', 'inactive')만 허용 → 'deleted'로 UPDATE 불가
-- 제약을 재생성하여 소프트 삭제 상태를 허용한다.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('pending', 'active', 'inactive', 'deleted'));
