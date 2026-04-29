'use client'

import { useActionState } from 'react'
import { updatePassword } from '@/app/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PasswordTab() {
  const [state, action, pending] = useActionState(updatePassword, { error: '', success: false })

  return (
    <form action={action} className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="new_password">새 비밀번호 * (8자 이상)</Label>
        <Input id="new_password" name="new_password" type="password" required autoComplete="new-password" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm_password">새 비밀번호 확인 *</Label>
        <Input id="confirm_password" name="confirm_password" type="password" required autoComplete="new-password" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600">{state.message}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? '변경 중...' : '비밀번호 변경'}
      </Button>
    </form>
  )
}
