/**
 * Anillo de avance, resuelto con `conic-gradient` y sin librería de gráficos.
 *
 * Es el mismo control con el que La Batea muestra cuánto se pagó de una factura. Un anillo dice de
 * un vistazo algo que una barra dice peor: no "cuánto se avanzó sobre una línea" sino "qué parte
 * del total es". Adentro va el porcentaje, y debajo el importe, que es el dato con el que se
 * decide.
 */
export function Donut({
  porcentaje,
  color,
  etiqueta,
  size = 'md',
}: {
  /** 0 a 100. Se acota acá: el gradiente no lo hace solo y un valor fuera de rango dibuja cualquier cosa. */
  porcentaje: number
  color: string
  etiqueta?: string
  size?: 'sm' | 'md'
}) {
  const p = Math.min(Math.max(Number.isFinite(porcentaje) ? porcentaje : 0, 0), 100)
  return (
    <div
      className={`donut donut--${size}`}
      style={{ background: `conic-gradient(${color} ${p}%, var(--donut-track) 0)` }}
      role="img"
      aria-label={`${etiqueta ?? 'Cancelado'}: ${p.toFixed(1)}%`}
    >
      <div className="donut-in">
        <span className="donut-v" style={{ color }}>
          {p.toFixed(p % 1 === 0 ? 0 : 1)}%
        </span>
        {etiqueta && <span className="donut-l">{etiqueta}</span>}
      </div>
    </div>
  )
}
