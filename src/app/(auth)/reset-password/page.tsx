'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Logo } from '@/components/ui/logo'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)      // recovery 세션 확보 여부
  const [verifyError, setVerifyError] = useState('') // 링크 검증 실패 메시지
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // 메일 링크로 진입하면 URL에 recovery 토큰이 담겨 온다. Supabase는 발송 시점·설정에
  // 따라 다음 세 가지 형식 중 하나로 전달하므로 모두 처리해 임시 세션을 확보한다.
  //  (1) ?token_hash=...&type=recovery  → verifyOtp (현재 Supabase 기본 redirect 흐름)
  //  (2) ?code=...                      → exchangeCodeForSession (PKCE 흐름)
  //  (3) #access_token=...&type=recovery → detectSessionInUrl 자동 처리
  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })

    async function establishSession() {
      const url = new URL(window.location.href)
      const params = url.searchParams
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''))

      // 에러가 링크에 실려 오는 경우(만료 등) 먼저 처리
      const errDesc = params.get('error_description') || hash.get('error_description')
      if (errDesc) {
        setVerifyError(decodeURIComponent(errDesc))
        return
      }

      const tokenHash = params.get('token_hash')
      const type = params.get('type')
      const code = params.get('code')

      try {
        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type: type as 'recovery',
            token_hash: tokenHash,
          })
          if (error) { setVerifyError('재설정 링크가 만료되었거나 유효하지 않습니다.'); return }
          setReady(true)
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) { setVerifyError('재설정 링크가 만료되었거나 유효하지 않습니다.'); return }
          setReady(true)
        } else {
          // 해시(#access_token) 자동 처리 또는 이미 복원된 세션 확인
          const { data } = await supabase.auth.getSession()
          if (data.session) setReady(true)
          else setVerifyError('유효한 재설정 링크로 접근해주세요.')
        }
      } catch {
        setVerifyError('재설정 링크 처리 중 오류가 발생했습니다.')
      }
    }

    establishSession()
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = new FormData(e.currentTarget)
    const newPassword = form.get('new_password') as string
    const confirm = form.get('confirm_password') as string

    if (!newPassword || newPassword.length < 8) {
      setError('새 비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (newPassword !== confirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    setPending(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setError(`변경 실패: ${error.message}`)
        return
      }
      // 변경 후 임시 세션을 정리하고 로그인 화면으로 유도
      await supabase.auth.signOut()
      setDone(true)
      setTimeout(() => router.push('/login'), 2000)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center pb-2">
          <Logo size={56} showText showSubTitle={false} className="mb-1" />
          <CardDescription className="text-sm text-muted-foreground">
            비밀번호 재설정
          </CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-foreground">비밀번호가 변경되었습니다.</p>
              <p className="text-sm text-muted-foreground">잠시 후 로그인 화면으로 이동합니다.</p>
              <Link href="/login" className="text-sm underline underline-offset-4 hover:text-foreground">
                로그인 화면으로 이동
              </Link>
            </div>
          ) : !ready ? (
            <div className="space-y-4 text-center">
              {verifyError ? (
                <p className="text-sm text-destructive">{verifyError}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  재설정 링크를 확인하는 중입니다...
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                링크가 만료되었거나 유효하지 않으면 관리자에게 재발송을 요청하세요.
              </p>
              <Link href="/login" className="text-sm underline underline-offset-4 hover:text-foreground">
                로그인 화면으로 이동
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new_password">새 비밀번호</Label>
                <Input
                  id="new_password"
                  name="new_password"
                  type="password"
                  placeholder="8자 이상"
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">새 비밀번호 확인</Label>
                <Input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  required
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? '변경 중...' : '비밀번호 변경'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
