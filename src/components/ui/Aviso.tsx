import type { ReactNode } from 'react'

export type TonoAviso = 'info' | 'ok' | 'warn' | 'err'

const ICONO: Record<TonoAviso, string> = {
  info: 'fa-circle-info',
  ok: 'fa-circle-check',
  warn: 'fa-triangle-exclamation',
  err: 'fa-circle-exclamation',
}

/**
 * Renglón de aviso dentro de un paso: por qué algo no se puede hacer todavía, o cómo terminó lo
 * que se acaba de hacer. No interrumpe —para eso están las ventanas—, acompaña al control que
 * explica.
 */
export function Aviso({ tono = 'info', children }: { tono?: TonoAviso; children: ReactNode }) {
  return (
    <div className={`aviso aviso--${tono}`} role={tono === 'err' ? 'alert' : 'status'}>
      <i className={`fas ${ICONO[tono]}`} aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

/**
 * Etiqueta de estado del tablero, con EL color que le puso Monday.
 *
 * El color no es decorativo: en el tablero la gente ya aprendió que "Generado" es verde y "Error"
 * es rojo, y repetirlo acá es lo que hace que la pantalla y el tablero se lean igual. Lo que sí se
 * baja es la intensidad: el color va de fondo muy diluido y concentrado en un punto, para que
 * marque sin gritar ni competir con los avisos.
 */
function tinte(hex: string, alfa: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 'transparent'
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`
}

export function EstadoBadge({
  label,
  estado,
}: {
  label?: string
  estado: { texto: string; color: string }
}) {
  const vacio = !estado.texto
  const color = vacio ? '' : estado.color
  return (
    <span
      className={`chip ${vacio ? 'chip--vacio' : ''}`}
      style={
        color
          ? { background: tinte(color, 0.12), borderColor: tinte(color, 0.34) }
          : undefined
      }
    >
      {color && <span className="chip-dot" style={{ background: color }} />}
      {label && <span className="chip-l">{label}:</span>}
      <span className="chip-v">{estado.texto || 'sin definir'}</span>
    </span>
  )
}
