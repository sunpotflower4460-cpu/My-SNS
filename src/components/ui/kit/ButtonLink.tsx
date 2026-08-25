import type { AnchorHTMLAttributes } from 'react'
import Link, { type LinkProps } from 'next/link'
import { buttonClassName, type ButtonSize, type ButtonVariant } from './Button'

export interface ButtonLinkProps extends LinkProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

export default function ButtonLink({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    >
      {children}
    </Link>
  )
}
