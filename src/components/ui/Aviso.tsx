import type { ReactNode } from 'react'
import { tituloPalabras } from '@/lib/texto'

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
 * Mismo criterio que las etiquetas de La Batea: el título y el valor van en EL MISMO color —nada
 * de negro—, sobre un fondo apenas teñido. El título lleva un punto más de color y de peso, porque
 * es lo que el ojo busca al recorrer una fila de etiquetas; el valor, un punto menos, para que el
 * par se lea como una sola cosa.
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

/**
 * El mismo color, llevado hacia el negro hasta que se pueda leer como texto chico.
 *
 * Cuánto se oscurece depende de lo claro que sea el color: el amarillo de Monday necesita bastante
 * más que el azul para leerse sobre su propio fondo teñido. `extra` aclara un poco el resultado:
 * es lo que separa el valor (más suave) de su título.
 */
const legible = (hex: string, extra = 0): string => {
  const c = canales(hex)
  if (!c) return '#64748b'
  const luz = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255
  const factor = (luz > 0.7 ? 0.42 : luz > 0.5 ? 0.5 : 0.62) + extra
  const mezcla = (v: number) => Math.round(v * Math.min(factor, 0.9))
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
      style={color ? { background: tinte(color, 0.14) } : undefined}
    >
      {label && (
        <span className="chip-l" style={color ? { color: legible(color) } : undefined}>
          {tituloPalabras(label)}:
        </span>
      )}
      <span className="chip-v" style={color ? { color: legible(color, 0.14) } : undefined}>
        {estado.texto || 'sin definir'}
      </span>
    </span>
  )
}
