-- 관리자(admin)도 사용자 상태(status)를 변경할 수 있도록 RLS 정책 수정
-- 기존 "슈퍼관리자 전체 수정" 정책은 superadmin만 허용 → admin도 추가

DROP POLICY IF EXISTS "슈퍼관리자 전체 수정" ON profiles;

CREATE POLICY "관리자 전체 수정" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
