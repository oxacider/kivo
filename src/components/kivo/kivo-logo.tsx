'use client';

import Image from 'next/image';

interface KivoLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
  textClassName?: string;
}

const sizeMap = {
  sm: { width: 28, height: 28 },
  md: { width: 40, height: 40 },
  lg: { width: 64, height: 64 },
  xl: { width: 80, height: 80 },
};

export function KivoLogo({
  size = 'md',
  className = '',
  showText = false,
  textClassName = '',
}: KivoLogoProps) {
  const { width, height } = sizeMap[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src="/logo.png"
        alt="KIVO"
        width={width}
        height={height}
        priority
        quality={100}
        sizes={`${width}px`}
        className="object-contain"
        style={{
          imageRendering: 'auto',
        }}
      />
      {showText && (
        <span
          className={`font-semibold tracking-tight gradient-text ${
            size === 'sm' ? 'text-base' : size === 'md' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-3xl'
          } ${textClassName}`}
        >
          KIVO
        </span>
      )}
    </div>
  );
}
