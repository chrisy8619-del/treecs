import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClockIcon } from 'lucide-react'

export default function PendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
              <ClockIcon className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-xl">가입 신청이 완료되었습니다</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            관리자 승인 후 로그인이 가능합니다.
            <br />
            승인까지 다소 시간이 걸릴 수 있습니다.
          </p>
          <Button variant="outline" className="w-full" render={<Link href="/login" />}>
            로그인 페이지로 돌아가기
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
