'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { approveUser, deactivateUser, changeUserRole } from '@/app/actions/settings'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type UserProfile = {
  id: string
  name: string | null
  email: string
  department: string | null
  role: string
  status: string
  created_at: string
}

const roleLabel: Record<string, string> = {
  superadmin: '슈퍼관리자',
  admin: '관리자',
  user: '일반',
}

const statusLabel: Record<string, string> = {
  active: '활성',
  pending: '승인 대기',
  inactive: '비활성',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  pending: 'secondary',
  inactive: 'outline',
}

export function UsersTab({ users, myRole }: { users: UserProfile[]; myRole: string }) {
  const [tab, setTab] = useState<'all' | 'pending'>('all')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const pendingUsers = users.filter((u) => u.status === 'pending')
  const displayed = tab === 'pending' ? pendingUsers : users

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setTab('all')}
          className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
            tab === 'all' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
          }`}
        >
          전체 사용자 ({users.length})
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`text-sm font-medium pb-1 border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'pending' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
          }`}
        >
          승인 대기
          {pendingUsers.length > 0 && (
            <Badge className="h-5 px-1.5 text-xs">{pendingUsers.length}</Badge>
          )}
        </button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>부서</TableHead>
              <TableHead>권한</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead>액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground text-sm">
                  {tab === 'pending' ? '승인 대기 중인 사용자가 없습니다.' : '사용자가 없습니다.'}
                </TableCell>
              </TableRow>
            ) : (
              displayed.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name ?? '-'}</TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell>{u.department ?? '-'}</TableCell>
                  <TableCell>
                    {myRole === 'superadmin' ? (
                      <select
                        defaultValue={u.role}
                        disabled={isPending}
                        onChange={(e) => {
                          const val = e.target.value
                          startTransition(async () => {
                            const res = await changeUserRole(u.id, val)
                            if (res.error) toast.error(res.error)
                            else { toast.success('권한이 변경되었습니다.'); router.refresh() }
                          })
                        }}
                        className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none"
                      >
                        <option value="user">일반</option>
                        <option value="admin">관리자</option>
                        <option value="superadmin">슈퍼관리자</option>
                      </select>
                    ) : (
                      <span className="text-sm">{roleLabel[u.role] ?? u.role}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[u.status] ?? 'outline'}>
                      {statusLabel[u.status] ?? u.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      {u.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="default"
                          disabled={isPending}
                          onClick={() => startTransition(async () => {
                            const res = await approveUser(u.id)
                            if (res.error) toast.error(res.error)
                            else { toast.success('승인되었습니다.'); router.refresh() }
                          })}
                        >
                          승인
                        </Button>
                      )}
                      {u.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => startTransition(async () => {
                            const res = await deactivateUser(u.id)
                            if (res.error) toast.error(res.error)
                            else { toast.success('비활성화되었습니다.'); router.refresh() }
                          })}
                        >
                          비활성화
                        </Button>
                      )}
                      {u.status === 'inactive' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => startTransition(async () => {
                            const res = await approveUser(u.id)
                            if (res.error) toast.error(res.error)
                            else { toast.success('재활성화되었습니다.'); router.refresh() }
                          })}
                        >
                          재활성화
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
