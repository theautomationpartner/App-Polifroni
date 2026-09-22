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
 * es rojo, y repetirlo acá es lo que hace que la pantalla y el tablero se lean igual.
 *
 * Lo que se calibra es cuánto. El fondo va teñido lo justo para que la etiqueta se distinga de un
 * vistazo sin volverse un semáforo, el borde marca el contorno, y el NOMBRE de la columna va en una
 * versión oscura de ese mismo color: así el par "de qué se habla / qué dice" se lee junto, y el
 * valor —que va casi en negro— sigue siendo lo que más pesa.
 */
const canales = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const tinte = (hex: string, alfa: number): string => {
  const c = canales(hex)
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alfa})` : 'transparent'
}

/** El mismo color, llevado hacia el negro hasta que se pueda leer como texto chico. */
const legible = (hex: string): string => {
  const c = canales(hex)
  if (!c) return '#64748b'
  const mezcla = (v: number) => Math.round(v * 0.52)
  return `rgb(${mezcla(c[0])}, ${mezcla(c[1])}, ${mezcla(c[2])})`
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
          ? { background: tinte(color, 0.17), borderColor: tinte(color, 0.52) }
          : undefined
      }
    >
      {color && <span className="chip-dot" style={{ background: color }} />}
      {label && (
        <span className="chip-l" style={color ? { color: legible(color) } : undefined}>
          {label}:
        </span>
      )}
      <span className="chip-v">{estado.texto || 'sin definir'}</span>
    </span>
  )
}
