interface AvatarProps {
  ini: string
  color: string
  /** `vava` (32px) para la lista del selector, `mini-ava` (22px) para la caja cerrada. */
  size?: 'md' | 'sm'
}

/** El círculo con las iniciales y el color de cada persona. Mismo componente que La Batea. */
export function Avatar({ ini, color, size = 'md' }: AvatarProps) {
  return (
    <span className={size === 'md' ? 'vava' : 'mini-ava'} style={{ background: color }} aria-hidden="true">
      {ini}
    </span>
  )
}
