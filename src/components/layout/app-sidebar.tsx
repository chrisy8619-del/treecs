'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TreePine,
  BarChart3,
  Building2,
  Users,
  Settings,
  LogOut,
  Leaf,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { logout } from '@/app/actions/auth'

const navMain = [
  { title: '대시보드', href: '/analytics', icon: BarChart3 },
  { title: '현장 하자율 예측 분석', href: '/dashboard', icon: LayoutDashboard },
]

const navMaster = [
  { title: '현장 관리', href: '/sites', icon: Building2 },
  { title: '협력사 관리', href: '/contractors', icon: Users },
  { title: '수종 관리', href: '/species', icon: Leaf },
  { title: '식재 기록', href: '/plantings', icon: TreePine },
  { title: '설정', href: '/settings', icon: Settings },
]

function NavItem({ item, isActive }: { item: { title: string; href: string; icon: React.ElementType }; isActive: boolean }) {
  return (
    <SidebarMenuItem>
      <Link href={item.href} className="w-full">
        <SidebarMenuButton
          tooltip={item.title}
          isActive={isActive}
          className={
            isActive
              ? 'bg-[#1a3a2a] text-white hover:bg-[#2a5a3e] hover:text-white'
              : 'hover:bg-[#1a3a2a]/10 hover:text-[#1a3a2a]'
          }
        >
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/analytics" className="w-full">
              <SidebarMenuButton size="lg">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-[#1a3a2a] text-white text-xs font-bold">
                  TC
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">TreeCS</span>
                  <span className="text-xs text-muted-foreground">수목 하자율 분석</span>
                </div>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>메뉴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMain.map((item) => (
                <NavItem key={item.href} item={item} isActive={pathname === item.href} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>마스터 데이터</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navMaster.map((item) => (
                <NavItem key={item.href} item={item} isActive={pathname === item.href} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <form action={logout}>
              <SidebarMenuButton tooltip="로그아웃" render={<button type="submit" />}>
                <LogOut />
                <span>로그아웃</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
