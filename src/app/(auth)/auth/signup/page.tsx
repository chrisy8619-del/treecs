'use client'

import { useActionState } from 'react'
import { signup } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, { error: '' })

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">TreeCS 가입 신청</CardTitle>
          <CardDescription>관리자 승인 후 로그인이 가능합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">이름 *</Label>
              <Input id="name" name="name" placeholder="홍길동" required autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">이메일 *</Label>
              <Input id="email" name="email" type="email" placeholder="name@company.com" required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">부서 *</Label>
              <Input id="department" name="department" placeholder="예: 조경관리팀" required autoComplete="organization-title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">연락처</Label>
              <Input id="phone" name="phone" placeholder="010-0000-0000" autoComplete="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호 * (8자 이상)</Label>
              <Input id="password" name="password" type="password" required autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password_confirm">비밀번호 확인 *</Label>
              <Input id="password_confirm" name="password_confirm" type="password" required autoComplete="new-password" />
            </div>

            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? '신청 중...' : '가입 신청'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              이미 계정이 있으신가요?{' '}
              <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                로그인
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
