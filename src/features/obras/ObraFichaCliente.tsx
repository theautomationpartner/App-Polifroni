import type { ReactNode } from 'react'
import { Donut } from '@/components/ui/Donut'
import { colorCancelado, porcentajeCancelado } from '@/lib/cancelado'
import { importe } from '@/lib/format'
import { formatoMonday } from '@/lib/destinatario'
import { coordinador } from './coordinador'
import { VISTA_SITUACION, situacionOrdenes, textoSituacion, tipoDe } from '@/lib/pasos'
import type { Obra } from '@/types'

/** "$ 1.234,50" → 1234.5. Vacío o ilegible → `null`: no se inventa un cero. */
function aNumero(texto: string): number | null {
  const limpio = texto.trim()
  if (!limpio) return null
  const n = Number(limpio.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const dinero = (n: number | null) =>
  n === null ? '—' : importe(String(Math.round(n * 100) / 100).replace('.', ','))

/** Muestra el valor o «Sin especificar» si viene vacío (como la ficha de La Batea). */
const oSinEsp = (v: string | null | undefined) => (v && v.trim() ? v : 'Sin especificar')

/** "1111 - PEREZ JUAN" → "PEREZ JUAN". */
const sinCodigo = (n: string) => n.replace(/^\s*\d+\s*-\s*/, '').trim()


/**
 * La obra elegida, con la ficha del cliente de PRESUPUESTAR de La Batea (`ClienteFicha`).
 *
 * La ESTRUCTURA se muestra SIEMPRE: sin obra —o mientras se consulta Monday— cada caja queda en
 * esqueleto, y al resolverse la búsqueda se rellena con los datos reales. Así la pantalla no salta
 * al cargar, y lo que va a aparecer se ve de antemano en su lugar.
 *
 *  - Arriba: el ID de la obra, su nombre, la ubicación y los badges (cliente, constructor, etapa
 *    de venta, asignado y combinada). A la derecha, el TIPO en una etiqueta bien visible —con el
 *    color de su estado en el tablero— y en qué está la obra respecto de sus órdenes (ver
 *    `situacionOrdenes`).
 *  - Abajo: las tres cajas de importes (total pactado, cancelado, pendiente) y la fila con quién
 *    coordina, su celular —con el formato de Monday— y la fecha pactada de colocación.
 */
export function ObraFichaCliente({ obra, cargando = false, children }: { obra: Obra | null; cargando?: boolean; children?: ReactNode }) {
  const vacio = !obra || cargando
  const total = obra ? aNumero(obra.totalPactado) : null
  const saldo = obra ? aNumero(obra.saldo) : null
  const cancelado = total !== null && saldo !== null ? total - saldo : null
  const pct = obra ? porcentajeCancelado(obra.pctCancelado, cancelado, total) : null
  const situacion = obra ? situacionOrdenes(obra) : null
  const coord = obra ? coordinador(obra) : null
  const cel = obra ? formatoMonday(obra.celCoordinar) : ''

  const val = (contenido: ReactNode, clase = '') =>
    vacio ? <span className="skeleton skeleton--valor" /> : <span className={`kpi-value ${clase}`}>{contenido}</span>

  return (
    <div className={`card no-radius cliente-ficha ${vacio ? 'cliente-ficha--vacio' : ''}`}>
      <div className="client-header">
        <div>
          {vacio ? (
            <>
              <span className="skeleton skeleton--linea skeleton--corto" />
              <span className="skeleton skeleton--linea skeleton--titulo" />
              <span className="skeleton skeleton--linea skeleton--medio" />
              <div className="badges">
                <span className="skeleton skeleton--badge" />
                <span className="skeleton skeleton--badge" />
                <span className="skeleton skeleton--badge" />
              </div>
            </>
          ) : (
            <>
              <span className="client-id">ID: {obra.idObra || obra.id}</span>
              <h2 className="client-name">{obra.nombre}</h2>

              <span className="client-address">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6c4cf1"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Ubicación de la obra: {oSinEsp(obra.ubicacion)}
              </span>

              <div className="badges">
                <span className="badge badge-gray">Cliente asignado: {oSinEsp(sinCodigo(obra.ctaCteCliente))}</span>
                <span className="badge badge-gray">Constructor asignado: {oSinEsp(sinCodigo(obra.arquitecto))}</span>
                <span className="badge badge-green">Tipo de Venta: {oSinEsp(obra.etapaVenta.texto)}</span>
                <span className="badge badge--cond">
                  Asignado a: <strong>{obra.asignado || 'Sin asignar'}</strong>
                </span>
                {obra.combina.texto && <span className="badge badge-purple">{obra.combina.texto}</span>}
              </div>
            </>
          )}
        </div>

        {/* A la derecha, lo que más importa antes de seguir: el TIPO de la obra —en una etiqueta
            que se lee de lejos, con el color de su estado en el tablero— y en qué está respecto de
            sus órdenes de producción. */}
        <div className="status-indicators">
          {vacio ? (
            <>
              <span className="skeleton skeleton--tipo" />
              <span className="skeleton skeleton--estado" />
            </>
          ) : (
            <>
              <span
                className={`obra-tipo ${obra.tipo.texto ? '' : 'obra-tipo--falta'}`}
                style={obra.tipo.texto ? { background: obra.tipo.color || '#579bfc' } : undefined}
                title="Tipo de obra (columna Tipo)"
              >
                {obra.tipo.texto || 'Sin tipo'}
              </span>
              {/* PVC se carga desde la orden de HETMO: se avisa acá, antes de seguir. */}
              {tipoDe(obra) === 'PVC' && (
                <div className="status-indicator">
                  <span className="status-dot" style={{ background: obra.tipo.color || '#00c875' }} />
                  Requiere de una orden de producción de HETMO
                </div>
              )}
              {situacion && (
                <div className="status-indicator">
                  <span className="status-dot" style={{ background: VISTA_SITUACION[situacion.tipo].color }} />
                  {textoSituacion(situacion)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <hr className="divider" />

      <section className="credito-grupo">
        {/* Primero lo pactado, después lo que falta cobrar y al final lo cobrado, con la torta del
            porcentaje cancelado a la derecha. */}
        <div className="kpi-grid kpi-grid--3 kpi-grid--torta">
          <div className="kpi-card">
            <span className="kpi-label">Total obra pactado</span>
            {val(dinero(total))}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Pendiente de cobro</span>
            {val(dinero(saldo), saldo && saldo > 0 ? 'v-red' : '')}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Cancelado</span>
            {val(dinero(cancelado), 'v-green')}
          </div>
          <div className="kpi-torta" aria-label="Porcentaje cancelado">
            <span className="kpi-torta-t">Equivale a:</span>
            {vacio || pct === null ? (
              <span className="skeleton kpi-torta-sk" />
            ) : (
              <Donut porcentaje={pct} color={colorCancelado(pct)} etiqueta="" size="md" />
            )}
            <span className="kpi-torta-l">cancelado</span>
          </div>
        </div>

        <div className="credito-fila-inferior">
          <div className="credito-metrica">
            <span className="kpi-label">Coordinador</span>
            {val(
              coord ? (
                <>
                  {coord.nombre || 'Sin nombre'} <span className="obra-coord-rol">({coord.rol})</span>
                </>
              ) : (
                obra?.coordinarEntrega.texto || 'Sin definir'
              ),
              coord ? '' : 'v-red',
            )}
          </div>
          <div className="credito-metrica">
            <span className="kpi-label">Cel a coordinar</span>
            {val(
              cel ? (
<span className="obra-cel">{cel}</span>
              ) : (
                'Sin cargar'
              ),
              cel ? '' : 'v-red',
            )}
          </div>
          <div className="credito-metrica">
            <span className="kpi-label">Fecha pactada de colocación</span>
            {val(obra?.fechaColocacion ? obra.fechaColocacion.split('-').reverse().join('/') : '—')}
          </div>
        </div>
      </section>

      {children && (
        <>
          <hr className="divider" />
          {children}
        </>
      )}
    </div>
  )
}
