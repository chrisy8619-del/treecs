import Image from 'next/image'

type LogoProps = {
  /** 로고 이미지 크기(px). 기본 36 */
  size?: number
  /** 브랜드명 "TreeCS" 표시 여부 */
  showText?: boolean
  /** 서브타이틀 "수목 관리 플랫폼" 표시 여부 */
  showSubTitle?: boolean
  className?: string
}

/**
 * 재사용 가능한 TreeCS 로고 컴포넌트.
 * PNG 검정 배경을 mix-blend-mode: multiply로 제거.
 * 사이드바/헤더/로그인/보고서 등 모든 위치에서 공통 사용.
 */
export function Logo({ size = 36, showText = true, showSubTitle = true, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div style={{ width: size, height: size, minWidth: size }} className="relative shrink-0">
        <Image
          src="/logo.png"
          alt="TreeCS 로고"
          width={size}
          height={size}
          className="object-contain"
          style={{ mixBlendMode: 'multiply', background: 'transparent' }}
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-bold text-[#111827]" style={{ fontSize: 18 }}>
            TreeCS
          </span>
          {showSubTitle && (
            <span className="mt-0.5 text-[#6B7280]" style={{ fontSize: 12 }}>
              수목 관리 플랫폼
            </span>
          )}
        </div>
      )}
    </div>
  )
}
