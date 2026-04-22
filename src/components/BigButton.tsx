import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Size = 'md' | 'lg' | 'xl';

const SIZES: Record<Size, { px: number; py: number; fs: number; minW: number }> = {
  md: { px: 20, py: 12, fs: 20, minW: 72 },
  lg: { px: 28, py: 16, fs: 26, minW: 96 },
  xl: { px: 36, py: 22, fs: 34, minW: 120 },
};

export interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  size?: Size;
  color?: string;
  label?: string;
  children?: ReactNode;
}

export function BigButton({
  active = false,
  size = 'lg',
  color = 'var(--ink)',
  label,
  children,
  style,
  ...rest
}: BigButtonProps) {
  const s = SIZES[size];
  const styled: React.CSSProperties = {
    padding: `${s.py}px ${s.px}px`,
    fontSize: s.fs,
    fontWeight: 800,
    minWidth: s.minW,
    minHeight: 80,
    background: active ? color : 'var(--surface)',
    color: active ? '#fff' : 'var(--ink)',
    border: `3px solid ${color}`,
    borderRadius: 'var(--radius, 10px)',
    cursor: 'pointer',
    lineHeight: 1,
    letterSpacing: '0.02em',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    boxShadow: active ? 'none' : 'var(--shadow-ink)',
    transform: active ? 'translate(2px, 2px)' : 'none',
    transition: 'transform 80ms ease, box-shadow 80ms ease',
    ...style,
  };
  return (
    <button type="button" aria-label={label} style={styled} {...rest}>
      {children}
    </button>
  );
}
