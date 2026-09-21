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
 * Etiqueta de estado del tablero.
 *
 * NO usa el color que Monday le puso a la etiqueta. Una fila con seis colores distintos no informa
 * seis cosas: obliga a leerlas todas igual y encima compite con los avisos, que sí usan el color
 * para decir algo. Van todas en el mismo azul, y lo que se lee es el TEXTO.
 *
 * La jerarquía es la misma que la de los datos de la ficha: el rótulo chico en mayúsculas dice qué
 * se está mirando, y el valor —lo que de verdad importa— va en oscuro y con más peso.
 */
export function EstadoBadge({
  label,
  estado,
}: {
  label?: string
  estado: { texto: string; color: string }
}) {
  const vacio = !estado.texto
  return (
    <span className={`chip ${vacio ? 'chip--vacio' : ''}`}>
      {label && <span className="chip-l">{label}:</span>}
      <span className="chip-v">{estado.texto || 'sin definir'}</span>
    </span>
  )
}
