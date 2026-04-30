'use client'

import { useActionState } from 'react'
import { updateProfile } from '@/app/actions/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Profile = {
  name: string | null
  email: string
  department: string | null
  phone: string | null
}

export function ProfileTab({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, { error: '', success: false })

  return (
    <form action={action} className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="email">이메일</Label>
        <Input id="email" value={profile.email} disabled className="bg-muted" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">이름 *</Label>
        <Input id="name" name="name" defaultValue={profile.name ?? ''} required autoComplete="name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="department">부서</Label>
        <Input id="department" name="department" defaultValue={profile.department ?? ''} placeholder="예: 조경관리팀" autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">연락처</Label>
        <Input id="phone" name="phone" defaultValue={profile.phone ?? ''} placeholder="010-0000-0000" autoComplete="tel" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-green-600">{state.message}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? '저장 중...' : '저장'}
      </Button>
    </form>
  )
}
