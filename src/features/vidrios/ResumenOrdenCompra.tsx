import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import type { Corte } from '@/lib/vidrios'
import type { BusquedaTempoglass } from '@/services/tempoglass'

/** El sistema de pedidos del proveedor de vidrio. */
const TEMPOGLASS = 'https://tempoglass.ar/login'

/** Lo que va contestando el robot de Tempoglass después de generar la orden de compra. */
export type EstadoTempoglass = { estado: 'buscando' } | { estado: 'listo'; busqueda: BusquedaTempoglass }

/** El texto del renglón "Tempoglass": qué encontró el robot, o en qué paso falló. */
function textoTempoglass(t: EstadoTempoglass): { texto: string; falla: boolean } {
  if (t.estado === 'buscando') return { texto: 'Buscando la obra...', falla: false }
  const b = t.busqueda
  if (!b.ok) return { texto: `Falló (${b.paso}): ${b.mensaje}`, falla: true }
  if (b.encontrada) return { texto: `Obra encontrada · Id ${b.encontrada.id}`, falla: false }
  return { texto: `No existe la obra «${b.buscado}»`, falla: true }
}

/** Un renglón del resumen: rótulo a la izquierda, valor a la derecha (el `Fila` de La Batea). */
function Fila({ label, children }: { label: string; children: ReactNode }) {
  const vacio = children === '' || children == null
  return (
    <div className="rrow">
      <span className="rlabel">{label}</span>
      <span className={`rvalue ${vacio ? 'rvalue--falta' : ''}`}>{vacio ? '--' : children}</span>
    </div>
  )
}

export interface ResumenOrdenCompraProps {
  emisor: { ini: string; color: string; name: string } | null
  obra: string
  /** Las OP cuyos vidrios entran: "IDOP-071". */
  ordenes: string[]
  /** `null` mientras se leen los vidrios. */
  cortes: Corte[] | null
  generando: boolean
  generada: boolean
  error: boolean
  /** La orden generada, guardándose en `Generar Orden Compra Vidrio` de cada OP. */
  guardado: 'subiendo' | 'ok' | 'error' | null
  tempoglass: EstadoTempoglass | null
  onGenerar: () => void
  onDescargar: () => void
}

/**
 * El resumen de la orden de compra de vidrios: quién la emite, para qué obra y qué órdenes, cuántos
 * cortes y piezas lleva; y sus acciones. "Generar orden de compra" arma el Excel en la app,
 * "Descargar Excel" baja el que se generó y "Abrir Tempoglass" lleva al sistema del proveedor.
 * Generada la orden, se guarda en cada OP y el robot de Tempoglass busca la obra: debajo se ve cómo
 * va cada cosa.
 */
export function ResumenOrdenCompra({
  emisor,
  obra,
  ordenes,
  cortes,
  generando,
  generada,
  error,
  guardado,
  tempoglass,
  onGenerar,
  onDescargar,
}: ResumenOrdenCompraProps) {
  const lista = cortes ?? []
  const piezas = lista.reduce((n, c) => n + c.cantidad, 0)
  const dvh = lista.filter((c) => c.dvh).length
  const revisar = lista.some((c) => c.sinCantidad)
  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="card card--flush resumen-emision">
      <h3 className="resumen-title">Resumen orden de compra de vidrios</h3>

      <div className="rgroup">
        <Fila label="Usuario emisor">
          {emisor && (
            <>
              <Avatar ini={emisor.ini} color={emisor.color} size="sm" /> {emisor.name}
            </>
          )}
        </Fila>
        <Fila label="Obra">
          <span className="rvalue-txt" title={obra}>
            {obra}
          </span>
        </Fila>
        <Fila label="Fecha">{hoy}</Fila>
        <Fila label="Proveedor">Tempoglass</Fila>
      </div>

      <hr className="rsep" />

      <div className="rgroup">
        <Fila label={ordenes.length === 1 ? 'Orden incluida' : 'Órdenes incluidas'}>
          {ordenes.length ? (
            <span className="rvalue-txt" title={ordenes.join(', ')}>
              {ordenes.join(', ')}
            </span>
          ) : (
            ''
          )}
        </Fila>
        <Fila label="Cortes a pedir">
          {cortes ? `${lista.length} (${dvh} DVH · ${lista.length - dvh} ${lista.length - dvh === 1 ? 'simple' : 'simples'})` : ''}
        </Fila>
        <Fila label="Piezas de vidrio">{cortes ? String(piezas) : ''}</Fila>
      </div>

      {revisar && (
        <p className="vid-aviso">
          <i className="fas fa-triangle-exclamation" /> Hay vidrios sin cantidad en la orden: revisalos antes de pedir.
        </p>
      )}

      <button
        type="button"
        className="btn-generar btn-mayus"
        onClick={onGenerar}
        /* Mientras se guarda o busca, no se regenera: dos tandas cruzadas dejarían un Excel viejo. */
        disabled={generando || !lista.length || guardado === 'subiendo' || tempoglass?.estado === 'buscando'}
        aria-busy={generando}
        title={generada ? 'Tocá para volver a generar la orden de compra' : undefined}
        style={
          generada
            ? { backgroundColor: 'var(--green)', color: '#fff' }
            : error && !generando
              ? { backgroundColor: 'var(--red)', color: '#fff' }
              : undefined
        }
      >
        {generando ? (
          <>
            <i className="fas fa-circle-notch spin" /> Generando orden de compra...
          </>
        ) : generada ? (
          <>
            <i className="fas fa-check" /> Orden de compra generada
          </>
        ) : error ? (
          <>
            <i className="fas fa-xmark" /> Error de generación
          </>
        ) : (
          <>
            <i className="far fa-file-excel" /> Generar orden de compra
          </>
        )}
      </button>

      <div className="pres-pdf vid-acciones">
        <button
          type="button"
          className="btn btn-out pres-pdf-btn"
          disabled={!generada}
          title={generada ? 'Bajar la orden de compra en Excel' : 'Se habilita cuando la orden de compra está generada'}
          onClick={onDescargar}
        >
          <i className="fas fa-download" /> Descargar Excel
        </button>
        <a className="btn btn-primary btn-marca pres-pdf-btn" href={TEMPOGLASS} target="_blank" rel="noreferrer">
          <i className="fas fa-arrow-up-right-from-square" /> Abrir Tempoglass
        </a>
      </div>
      {error && (
        <div className="pres-pdf-aviso" role="alert">
          <i className="fas fa-circle-exclamation" /> No se pudo armar la orden de compra. Volvé a intentar.
        </div>
      )}

      {(guardado || tempoglass) && (
        <div className="rgroup vid-robot">
          {guardado && (
            <Fila label="Guardada en la OP">
              {guardado === 'subiendo' ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Guardando...
                </>
              ) : guardado === 'ok' ? (
                <>
                  <i className="fas fa-check" /> Sí
                </>
              ) : (
                <span className="vid-robot-falla">No se pudo guardar. Volvé a generar.</span>
              )}
            </Fila>
          )}
          {tempoglass && (
            <Fila label="Tempoglass">
              {(() => {
                const { texto, falla } = textoTempoglass(tempoglass)
                return (
                  <span className={`rvalue-txt${falla ? ' vid-robot-falla' : ''}`} title={texto}>
                    {tempoglass.estado === 'buscando' && <i className="fas fa-circle-notch spin" />} {texto}
                  </span>
                )
              })()}
            </Fila>
          )}
        </div>
      )}
    </div>
  )
}
