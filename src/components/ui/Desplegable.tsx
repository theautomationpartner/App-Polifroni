import type { ReactNode } from 'react'

/**
 * Card plegable: la del "Presupuesto a generar" de La Batea (clases `comp-*` + `CompBody`).
 *
 * La cabecera está siempre visible —el título y, a la derecha, un dato y el tilde de completo— y
 * el cuerpo se despliega con la misma animación de allá: la altura la anima el GRID (`0fr` → `1fr`)
 * y el contenido NO se desmonta al cerrar, así lo escrito adentro no se pierde.
 */
export function Desplegable({
  titulo,
  icono,
  abierto,
  onToggle,
  dato,
  completo = false,
  children,
}: {
  titulo: string
  icono: string
  abierto: boolean
  onToggle: () => void
  /** Un dato corto para la cabecera: "3 de 7", "N° 3001". */
  dato?: { lbl: string; val: string }
  /** Tilde verde a la derecha: lo de adentro ya está completo. */
  completo?: boolean
  children: ReactNode
}) {
  return (
    <div className="comp-card">
      <div className="comp-head">
        <button type="button" className="comp-toggle" aria-expanded={abierto} onClick={onToggle}>
          <i className={`fas fa-chevron-down comp-chev ${abierto ? 'open' : ''}`} />
          <span className="comp-tit">
            <i className={`fas ${icono}`} /> {titulo}
          </span>
        </button>
        {dato && (
          <div className="comp-head-datos">
            <div className="comp-head-dato">
              <span className="comp-head-lbl">{dato.lbl}</span>
              <span className="comp-head-val">{dato.val}</span>
            </div>
          </div>
        )}
        <span className="comp-estado">
          <span className={`cobro-ok ${completo ? 'on' : ''}`} title={completo ? 'Completo' : 'Pendiente'}>
            <i className="fas fa-check" />
          </span>
        </span>
      </div>
      <div className={`comp-body-wrap ${abierto ? 'open' : ''}`}>
        <div className="comp-body-inner">
          <div className="comp-body">{children}</div>
        </div>
      </div>
    </div>
  )
}
