import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Donut } from '@/components/ui/Donut'
import { aCentavos, formatearImporte, importeEditable, importeEscrito, pesos } from '@/lib/facturacion'
import { getUrlArchivo, type FacturaEmitida } from '@/services/monday'
import type { ArchivoObra } from '@/types'

/** Cuánto dura el plegado del panel, en ms: lo mismo que la animación `fact-plegar` de facturacion.css. */
const MS_PLEGADO = 200
/** Cuánto dura el despliegue, en ms: lo mismo que la animación `fact-desplegar`. */
const MS_DESPLIEGUE = 240

/**
 * El color del anillo, con el criterio de La Batea (`colorCancelacion`): azul sin nada, amarillo
 * mientras la anulación es parcial y verde cuando anula la factura entera.
 */
const colorAnulacion = (pct: number) => (pct >= 100 ? 'var(--green)' : pct > 0 ? 'var(--yellow)' : 'var(--primary-blue)')

/** "2026-10-14" → "14/10/2026". */
const fecha = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '')

/** Cuánto de la factura ya anularon sus notas de crédito, como lo dice la pastilla de la fila. */
function situacion(f: FacturaEmitida): { texto: string; color: string } {
  if (f.disponible <= 0) return { texto: 'Anulada', color: '#676879' }
  if (f.acreditado > 0) return { texto: 'Anulada parcial', color: '#fdab3d' }
  return { texto: 'Disponible', color: '#00c875' }
}

/**
 * Abre en otra pestaña el PDF de la factura (el "Ver" de Presupuesto). La pestaña se abre ANTES de pedir
 * la dirección firmada: abrirla después de esperar a Monday la frena el bloqueador de ventanas.
 */
async function verPdf(pdf: ArchivoObra) {
  const w = window.open('', '_blank')
  try {
    const url = await getUrlArchivo(pdf.assetId)
    if (w) w.location.href = url
    else window.open(url, '_blank')
  } catch {
    w?.close()
  }
}

const COLUMNAS = 7

/**
 * Las facturas emitidas de la obra, para elegir la que anula la nota de crédito.
 *
 * Se ve como las tablas de la app (la de órdenes de producción y la de obras de la Agenda: `ant-tabla`)
 * y se comporta EXACTAMENTE como la tabla de ventas pendientes de cobro de La Batea (registrar cobro,
 * `TablaFacturas`): un `tbody` por factura, al tildarla su fila se despliega —animada— con el panel del
 * importe, que arranca con lo que esa factura todavía admite anular y se puede cambiar; a su lado, el
 * anillo y las métricas se recalculan mientras se escribe. Al destildarla, el panel se pliega.
 *
 * Una nota de crédito anula UNA factura (ARCA pide el comprobante asociado): tildar otra reemplaza la
 * anterior.
 */
export function TablaFacturasNc({
  facturas,
  elegida,
  monto,
  pendienteObra,
  bloqueada = false,
  onElegir,
  onMonto,
}: {
  facturas: readonly FacturaEmitida[]
  /** La factura tildada (o ninguna). */
  elegida: FacturaEmitida | null
  /** El monto de la nota de crédito, tal como se escribe ("1.297.684,50"). */
  monto: string
  /** Lo pendiente de facturar de la obra HOY: la nota de crédito lo vuelve a subir. */
  pendienteObra: number
  bloqueada?: boolean
  onElegir: (f: FacturaEmitida | null) => void
  onMonto: (texto: string) => void
}) {
  /* La fila que se está plegando sigue montada —con su último monto— hasta que termina la animación. */
  const [plegando, setPlegando] = useState<{ id: string; monto: string } | null>(null)
  /* Sólo se anima lo que se acaba de tildar: volver a la etapa con una ya elegida no la abre de nuevo. */
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const previa = useRef<{ id: string | null; monto: string }>({ id: elegida?.id ?? null, monto })

  /* Antes de pintar (no después): así no se ve un cuadro intermedio con la fila apagada de golpe. */
  useLayoutEffect(() => {
    const antes = previa.current
    const ahora = elegida?.id ?? null
    previa.current = { id: ahora, monto }
    if (antes.id === ahora) return
    const timers: ReturnType<typeof setTimeout>[] = []
    if (antes.id) {
      setPlegando({ id: antes.id, monto: antes.monto })
      timers.push(setTimeout(() => setPlegando(null), MS_PLEGADO))
    }
    if (ahora) {
      setAbriendo(ahora)
      timers.push(setTimeout(() => setAbriendo(null), MS_DESPLIEGUE))
    }
    return () => timers.forEach(clearTimeout)
    // Sólo cuando cambia la factura elegida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elegida?.id])

  return (
    <div className="ant-tabla-wrap fac-nc-wrap">
      <table className="ant-tabla ant-tabla--fija ag-tabla fac-nc-tabla">
        <colgroup>
          <col className="ant-w-check" />
          <col />
          <col className="fac-nc-w-tipo" />
          <col className="fac-nc-w-monto" />
          <col className="fac-nc-w-monto" />
          <col className="fac-nc-w-pdf" />
          <col className="fac-nc-w-estado" />
        </colgroup>
        <thead>
          <tr>
            <th className="ant-col-check" />
            <th>Factura</th>
            <th>Tipo</th>
            <th className="ant-col-der">Monto facturado</th>
            <th className="ant-col-der">Queda por anular</th>
            <th className="ant-col-cen">PDF</th>
            <th className="ant-col-cen">Estado</th>
          </tr>
        </thead>

        {facturas.map((f) => {
          const on = elegida?.id === f.id
          const seCierra = !on && plegando?.id === f.id
          const agotada = f.disponible <= 0
          const sit = situacion(f)
          return (
            /* Un `tbody` por factura: la fila y su panel son una sola unidad. */
            <tbody key={f.id} className={`fac-nc-grupo ${on || seCierra ? 'fac-nc-grupo--on' : ''}`}>
              <tr
                className={`ant-row ${on || seCierra ? 'ant-row--on' : ''} ${agotada ? 'ant-row--off' : ''}`}
                title={agotada ? 'Esta factura ya está anulada por completo con notas de crédito.' : undefined}
              >
                <td className="ant-col-check">
                  <input
                    type="checkbox"
                    className="ant-check"
                    checked={on}
                    disabled={bloqueada || agotada}
                    onChange={() => onElegir(on ? null : f)}
                    aria-label={`Anular ${f.nombre}`}
                  />
                </td>
                {/* El nombre en negrita y, debajo, la fecha y el CAE (como el presupuesto y su bolsa). */}
                <td className="ag-turno" title={`${f.movimiento} · CAE ${f.cae}`}>
                  <span className="ag-turno-cli">{f.movimiento}</span>
                  <span className="ant-detalle">
                    Emitida el {fecha(f.fecha)} · CAE {f.cae}
                  </span>
                </td>
                <td>
                  {f.letra ? (
                    <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: '#575ce5' }}>
                      <i className="fas fa-file-invoice" aria-hidden="true" /> Factura {f.letra}
                    </span>
                  ) : (
                    <span className="ant-sd">—</span>
                  )}
                </td>
                <td className="ant-col-der">
                  <span className="ant-nro">{pesos(f.monto)}</span>
                </td>
                <td className="ant-col-der">
                  <span className={agotada ? 'ant-sd' : 'ant-nro'}>{pesos(f.disponible)}</span>
                </td>
                <td className="ant-col-cen">
                  {f.pdf ? (
                    <button
                      type="button"
                      className="ant-pdf-btn"
                      title="Ver el PDF de la factura"
                      aria-label={`Ver el PDF de ${f.nombre}`}
                      onClick={() => f.pdf && void verPdf(f.pdf)}
                    >
                      <i className="fas fa-file-pdf" /> Ver
                    </button>
                  ) : (
                    <span className="ant-sd">Sin PDF</span>
                  )}
                </td>
                <td className="ant-col-cen">
                  <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: sit.color }}>
                    {sit.texto}
                  </span>
                </td>
              </tr>

              {(on || seCierra) && (
                <tr className="fac-nc-exp">
                  <td colSpan={COLUMNAS}>
                    {/* Dos envoltorios para animar el despliegue: el de afuera anima su alto (de 0fr a
                        1fr) y el de adentro recorta lo que todavía no entra. */}
                    <div
                      className={`fact-exp-wrap ${
                        seCierra ? 'fact-exp-wrap--cerrando' : abriendo === f.id ? 'fact-exp-wrap--abriendo' : ''
                      }`}
                    >
                      <div className="fact-exp-in">
                        <PanelNotaCredito
                          factura={f}
                          monto={on ? monto : (plegando?.monto ?? '')}
                          pendienteObra={pendienteObra}
                          bloqueada={bloqueada}
                          onMonto={onMonto}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

/**
 * El panel de la factura tildada (el `PanelImputacion` de La Batea): cuánto anula la nota de crédito y,
 * al lado, su impacto —recalculado en vivo—: qué parte de la factura anula, el monto y cuánto queda
 * pendiente de facturar en la obra.
 */
function PanelNotaCredito({
  factura,
  monto,
  pendienteObra,
  bloqueada,
  onMonto,
}: {
  factura: FacturaEmitida
  monto: string
  pendienteObra: number
  bloqueada: boolean
  onMonto: (texto: string) => void
}) {
  const [texto, setTexto] = useState(monto)
  /* Si el monto cambia desde afuera ("Anular el total"), el campo lo sigue; si ya coincide con lo
     tipeado no se toca, así el formato no pelea con el cursor. */
  useEffect(() => {
    setTexto((actual) => (importeEscrito(actual) === importeEscrito(monto) ? actual : monto))
  }, [monto])

  const valor = Math.max(0, importeEscrito(texto) ?? 0)
  const excede = aCentavos(valor) > aCentavos(factura.disponible)
  const anula = excede ? 0 : aCentavos(valor)
  const pct = factura.disponible > 0 ? Math.min(100, Math.round((anula / factura.monto) * 1000) / 10) : 0
  const total = !excede && anula > 0 && anula === aCentavos(factura.disponible)

  return (
    <div className="fact-panel">
      <div className="fact-panel-pago">
        <label className="fact-panel-lbl" htmlFor={`nc-${factura.id}`}>
          Monto de la nota de crédito
        </label>
        <div className={`fact-input-wrap ${excede || valor <= 0 ? 'fact-input-wrap--error' : ''}`}>
          <span className="fact-input-signo">$</span>
          <input
            id={`nc-${factura.id}`}
            type="text"
            inputMode="decimal"
            className="fact-input"
            autoComplete="off"
            placeholder="0,00"
            value={texto}
            readOnly={bloqueada}
            aria-invalid={excede || valor <= 0 || undefined}
            aria-describedby={excede || valor <= 0 ? `nc-err-${factura.id}` : undefined}
            onChange={(e) => {
              if (bloqueada) return
              const { texto: t } = formatearImporte(e.target.value)
              setTexto(t)
              onMonto(t)
            }}
          />
        </div>

        {/* El problema se avisa acá mismo, donde se produce; al continuar se repite en la ventana. */}
        {excede || valor <= 0 ? (
          <p className="fact-input-error" id={`nc-err-${factura.id}`} role="alert">
            <i className="fas fa-circle-exclamation" />{' '}
            {excede
              ? `El monto no puede superar lo que queda por anular de la factura (${pesos(factura.disponible)}).`
              : 'Ingresá el monto de la nota de crédito: tiene que ser mayor a cero.'}
          </p>
        ) : (
          <div className="fact-panel-acciones">
            <span className="fact-panel-tope">Máximo: {pesos(factura.disponible)}</span>
            {/* El atajo del caso más común: anular la factura entera. */}
            <button
              type="button"
              className="fact-panel-todo"
              disabled={total || bloqueada}
              onClick={() => onMonto(importeEditable(factura.disponible))}
            >
              Anular el total
            </button>
          </div>
        )}
      </div>

      <div className="fact-panel-graf">
        <span className="fact-panel-lbl">Impacto de la nota de crédito</span>
        <div className="fact-panel-graf-in">
          <Donut porcentaje={pct} color={colorAnulacion(pct)} etiqueta="" size="md" />
          <dl className="fact-panel-metricas">
            <div>
              <dt>Anula de la factura</dt>
              <dd style={{ color: colorAnulacion(pct) }}>{pct}%</dd>
            </div>
            <div>
              <dt>Se anula de lo facturado</dt>
              <dd>{pesos(anula)}</dd>
            </div>
            <div>
              <dt>Quedará pend. de facturar</dt>
              <dd className="v-red">{pesos(aCentavos(pendienteObra + anula))}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
