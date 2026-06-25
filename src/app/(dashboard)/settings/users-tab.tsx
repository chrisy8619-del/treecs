'use client'

import { useState } from 'react'
import { toast } from 'sonner'
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
  deleted: '삭제됨',
}

const statusVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  pending: 'secondary',
  inactive: 'outline',
  deleted: 'destructive',
}

async function callUserManagement(body: { action: string; userId: string; role?: string }): Promise<{ error?: string; tempPassword?: string }> {
  const res = await fetch('/api/user-management', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? '요청 실패' }
  return { tempPassword: data.tempPassword }
}

export function UsersTab({ users: initialUsers, myRole }: { users: UserProfile[]; myRole: string }) {
  const [tab, setTab] = useState<'all' | 'pending'>('all')
  const [isPending, setIsPending] = useState(false)
  const [users, setUsers] = useState<UserProfile[]>(initialUsers)

  const pendingUsers = users.filter((u) => u.status === 'pending')
  const displayed = tab === 'pending' ? pendingUsers : users

  function updateUser(id: string, patch: Partial<UserProfile>) {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...patch } : u))
  }

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
                        onChange={async (e) => {
                          const val = e.target.value
                          setIsPending(true)
                          try {
                            const res = await callUserManagement({ action: 'changeRole', userId: u.id, role: val })
                            if (res.error) toast.error(res.error)
                            else {
                              updateUser(u.id, { role: val })
                              toast.success('권한이 변경되었습니다.')
                            }
                          } finally { setIsPending(false) }
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
                          onClick={async () => {
                            setIsPending(true)
                            try {
                              const res = await callUserManagement({ action: 'approve', userId: u.id })
                              if (res.error) toast.error(res.error)
                              else {
                                updateUser(u.id, { status: 'active' })
                                toast.success('승인되었습니다.')
                              }
                            } finally { setIsPending(false) }
                          }}
                        >
                          승인
                        </Button>
                      )}
                      {u.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={async () => {
                            setIsPending(true)
                            try {
                              const res = await callUserManagement({ action: 'deactivate', userId: u.id })
                              if (res.error) toast.error(res.error)
                              else {
                                updateUser(u.id, { status: 'inactive' })
                                toast.success('비활성화되었습니다.')
                              }
                            } finally { setIsPending(false) }
                          }}
                        >
                          비활성화
                        </Button>
                      )}
                      {u.status === 'inactive' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={async () => {
                            setIsPending(true)
                            try {
                              const res = await callUserManagement({ action: 'reactivate', userId: u.id })
                              if (res.error) toast.error(res.error)
                              else {
                                updateUser(u.id, { status: 'active' })
                                toast.success('재활성화되었습니다.')
                              }
                            } finally { setIsPending(false) }
                          }}
                        >
                          재활성화
                        </Button>
                      )}
                      {myRole === 'superadmin' && u.status !== 'deleted' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={async () => {
                              if (!window.confirm(`${u.email} 계정으로 비밀번호 재설정 링크를 발송하시겠습니까?`)) return
                              setIsPending(true)
                              try {
                                const res = await callUserManagement({ action: 'resetPassword', userId: u.id })
                                if (res.error) toast.error(res.error)
                                else toast.success('재설정 링크를 발송했습니다.')
                              } finally { setIsPending(false) }
                            }}
                          >
                            비밀번호 재설정
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={async () => {
                              if (!window.confirm(`${u.email} 계정에 임시 비밀번호를 발급하시겠습니까?\n발급 후 화면에 표시되는 임시 비밀번호를 사용자에게 전달하세요.`)) return
                              setIsPending(true)
                              try {
                                const res = await callUserManagement({ action: 'setTempPassword', userId: u.id })
                                if (res.error) toast.error(res.error)
                                else if (res.tempPassword) {
                                  toast.success('임시 비밀번호가 발급되었습니다.')
                                  // 관리자가 복사·전달할 수 있도록 표시 (prompt는 텍스트 선택·복사 가능)
                                  window.prompt(
                                    `${u.email} 임시 비밀번호 (복사해 전달하세요. 로그인 후 변경 안내 권장):`,
                                    res.tempPassword
                                  )
                                }
                              } finally { setIsPending(false) }
                            }}
                          >
                            임시비번 발급
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={isPending}
                            onClick={async () => {
                              if (!window.confirm('정말 삭제하시겠습니까? 해당 계정은 로그인할 수 없게 됩니다.')) return
                              setIsPending(true)
                              try {
                                const res = await callUserManagement({ action: 'delete', userId: u.id })
                                if (res.error) toast.error(res.error)
                                else {
                                  // 숨김 정책: 삭제 즉시 목록에서 제거
                                  setUsers((prev) => prev.filter((x) => x.id !== u.id))
                                  toast.success('계정이 삭제되었습니다.')
                                }
                              } finally { setIsPending(false) }
                            }}
                          >
                            삭제
                          </Button>
                        </>
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
