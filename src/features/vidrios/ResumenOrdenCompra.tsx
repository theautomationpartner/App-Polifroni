import { useId, useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { faltantesPedido, hoyIso, type DatosPedidoTempoglass } from '@/lib/tempoglass'
import type { Corte } from '@/lib/vidrios'

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
  /** La cabecera del pedido en Tempoglass: comentario y fecha de entrega. Los dos obligatorios. */
  pedido: DatosPedidoTempoglass
  onPedido: (cambio: Partial<DatosPedidoTempoglass>) => void
  /** Por qué no se puede generar ahora (corre el robot, …), o `null`. */
  bloqueo: string | null
  onGenerar: () => void
  onDescargar: () => void
}

/**
 * El resumen de la orden de compra de vidrios: quién la emite, para qué obra y qué órdenes, cuántos
 * cortes y piezas lleva; y sus acciones. "Generar orden de compra" arma el Excel en la app,
 * "Descargar Excel" baja el que se generó. Generada la orden, se guarda en la OP y el robot carga el pedido en Tempoglass con el comentario y
 * la fecha de acá: cómo va se ve en el pie de la etapa (`EstadoRobot`).
 */
export function ResumenOrdenCompra({
  emisor,
  obra,
  ordenes,
  cortes,
  generando,
  generada,
  error,
  pedido,
  onPedido,
  bloqueo,
  onGenerar,
  onDescargar,
}: ResumenOrdenCompraProps) {
  const uid = useId()
  /* Los campos se marcan en rojo recién después de intentar generar: antes, vacíos es lo normal. */
  const [marcar, setMarcar] = useState(false)
  const faltan = faltantesPedido(pedido)
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

      <hr className="rsep" />

      {/* La cabecera del pedido en Tempoglass: se completa ANTES de generar, porque generar dispara
          el robot que la carga allá. */}
      <div className="vid-pedido">
        <div className={`med-campo${marcar && !pedido.comentario.trim() ? ' vid-pedido--falta' : ''}`}>
          <label className="med-l" htmlFor={`${uid}-comentario`}>
            Comentario del pedido *
          </label>
          <textarea
            id={`${uid}-comentario`}
            className="med-input vid-pedido-comentario"
            rows={2}
            maxLength={500}
            value={pedido.comentario}
            placeholder="Cualquier comentario u observación para identificar este pedido en Tempoglass"
            disabled={!!bloqueo}
            onChange={(e) => onPedido({ comentario: e.target.value })}
          />
        </div>
        <div className={`med-campo${marcar && faltan.some((f) => f.includes('fecha')) ? ' vid-pedido--falta' : ''}`}>
          <label className="med-l" htmlFor={`${uid}-fecha`}>
            Fecha de entrega / colocación *
          </label>
          <input
            id={`${uid}-fecha`}
            type="date"
            className="med-input"
            min={hoyIso()}
            value={pedido.fecha}
            disabled={!!bloqueo}
            onChange={(e) => onPedido({ fecha: e.target.value })}
          />
        </div>
        {marcar && faltan.length > 0 && (
          <p className="vid-pedido-aviso" role="alert">
            <i className="fas fa-circle-exclamation" /> Para generar la orden falta {faltan.join(' y ')}.
          </p>
        )}
      </div>

      <button
        type="button"
        className="btn-generar btn-mayus"
        onClick={() => {
          /* Con datos incompletos no se genera: se marcan los campos que faltan. */
          if (faltan.length) return setMarcar(true)
          setMarcar(false)
          onGenerar()
        }}
        /* Mientras corre el robot, no se regenera: dos tandas cruzadas cargarían dos pedidos. */
        disabled={generando || !lista.length || !!bloqueo}
        aria-busy={generando}
        title={bloqueo ?? (generada ? 'Tocá para volver a generar la orden de compra' : undefined)}
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

      <div className="pres-pdf">
        <button
          type="button"
          className="btn btn-out pres-pdf-btn"
          disabled={!generada}
          title={generada ? 'Bajar la orden de compra en Excel' : 'Se habilita cuando la orden de compra está generada'}
          onClick={onDescargar}
        >
          <i className="fas fa-download" /> Descargar Excel
        </button>
      </div>
      {error && (
        <div className="pres-pdf-aviso" role="alert">
          <i className="fas fa-circle-exclamation" /> No se pudo armar la orden de compra. Volvé a intentar.
        </div>
      )}
    </div>
  )
}
