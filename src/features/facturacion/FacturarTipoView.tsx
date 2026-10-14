import { useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ModalErrorConsulta, conTope } from '@/features/agenda/ModalErrorConsulta'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import {
  TIPOS_FACTURACION,
  importeEditable,
  pendienteDeFacturar,
  pesos,
  problemaMonto,
  problemaMontoNotaCredito,
  problemaMotivo,
  MAX_MOTIVO,
  tipoHabilitado,
  type TipoFacturacion,
} from '@/lib/facturacion'
import { etiquetaPaso } from '@/lib/pasos'
import { facturasDeObra, type FacturaEmitida } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { emisionIniciada, type BorradorFactura } from './borrador'
import { MontoComprobante } from './MontoComprobante'
import { TablaFacturasNc } from './TablaFacturasNc'

/**
 * Facturar una Obra · Etapa 2: qué se factura de la obra, y por cuánto.
 *
 * "¿Qué querés facturar?" (la misma caja de "¿Qué querés hacer?" de Presupuesto): Saldo Pend de
 * Facturar, Diferencia (apagada, regla del usuario 13/10/2026) o Nota de Crédito.
 *
 *  - Saldo: el monto arranca con todo lo pendiente de facturar; se puede bajar, nunca pasar.
 *  - Nota de crédito: la operación inversa. Se elige la factura de la obra que se anula (ARCA pide el
 *    comprobante asociado: su CAE va en la nota) y el monto arranca con lo que esa factura todavía
 *    admite anular; se puede bajar, nunca pasar.
 *
 * El monto se carga con el elemento del importe del anticipo de La Batea (`MontoComprobante`), y debajo
 * se ve cómo queda la obra: lo que se cancela (o anula), el nuevo total facturado y lo que queda
 * pendiente de facturar.
 */
export function FacturarTipoView() {
  const dispatch = useDispatch()
  const { factura } = useApp()
  const { obras, tipo, elegidas, asociada } = factura
  const obra = obras[0] ?? null
  const bloqueada = emisionIniciada(factura)
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null)
  /** Se intentó continuar: lo que falta se marca en rojo. */
  const [marcar, setMarcar] = useState(false)
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  /** Las facturas emitidas de la obra (para la nota de crédito). `null`: todavía no se leyeron. */
  const [facturas, setFacturas] = useState<FacturaEmitida[] | null>(null)
  const [leyendoFacturas, setLeyendoFacturas] = useState(false)

  const pend = obra ? pendienteDeFacturar(obra) : 0
  const facturado = obra?.facturado ?? 0
  const elegida = elegidas[0] ?? null
  const nc = tipo === 'notaCredito'
  const problemaMot = nc ? problemaMotivo(factura.motivo) : null
  /** Lo que la nota de crédito puede anular: lo que admite la factura asociada, y nunca más que lo facturado. */
  const disponibleNc = asociada ? Math.min(asociada.disponible, facturado) : 0
  const problema = !elegida
    ? null
    : tipo === 'saldo'
      ? problemaMonto(elegida.monto, pend)
      : nc
        ? problemaMontoNotaCredito(elegida.monto, disponibleNc)
        : null

  function fijar(cambios: Partial<BorradorFactura>) {
    dispatch({ type: 'setFactura', cambios })
  }

  /* Nota de crédito: las facturas de la obra se leen al elegirla (y al volver a la etapa con ella). */
  useEffect(() => {
    if (!nc || !obra || facturas !== null) return
    let vivo = true
    setLeyendoFacturas(true)
    conTope(facturasDeObra(obra.id))
      .then((lista) => {
        if (!vivo) return
        setFacturas(lista)
      })
      .catch(() => vivo && setErrorMonday('leer las facturas de la obra'))
      .finally(() => vivo && setLeyendoFacturas(false))
    return () => {
      vivo = false
    }
    // Sólo cuando se pasa a nota de crédito o cambia la obra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nc, obra?.id])

  const elegirTipo = (t: TipoFacturacion) => {
    if (bloqueada || !obra || !tipoHabilitado(t) || t === tipo) return
    fijar({
      tipo: t,
      asociada: null,
      /* El saldo arranca con todo lo pendiente; la nota de crédito, al elegir la factura que anula. */
      elegidas: t === 'saldo' && pend > 0 ? [{ obraId: obra.id, monto: importeEditable(pend) }] : [],
    })
  }

  function elegirAsociada(f: FacturaEmitida) {
    if (!obra) return
    const tope = Math.min(f.disponible, facturado)
    fijar({ asociada: f, elegidas: tope > 0 ? [{ obraId: obra.id, monto: importeEditable(tope) }] : [] })
  }

  const cambiarMonto = (monto: string) => obra && fijar({ elegidas: [{ obraId: obra.id, monto }] })

  const continuar = () => {
    if (!tipo) {
      setAviso({ titulo: 'Falta elegir qué facturar', texto: 'Elegí en «¿Qué querés facturar?» qué se factura de la obra.' })
      return
    }
    if (tipo === 'saldo' && pend <= 0) {
      setAviso({ titulo: 'No hay saldo para facturar', texto: 'La obra no tiene saldo pendiente de facturar.' })
      return
    }
    if (nc && facturas !== null && facturas.length === 0) {
      setAviso({
        titulo: 'No se puede emitir una nota de crédito',
        texto: 'La obra no tiene facturas emitidas: una nota de crédito necesita al menos una factura que anular.',
      })
      return
    }
    if (nc && (leyendoFacturas || facturas === null)) return
    if (nc && !asociada) {
      setAviso({ titulo: 'Falta la factura a anular', texto: 'Tildá en la tabla la factura de la obra que anula la nota de crédito.' })
      return
    }
    if (nc && problemaMot) {
      setMarcar(true)
      setAviso({ titulo: 'Falta el motivo de la nota de crédito', texto: problemaMot })
      return
    }
    if (problema || !elegida) {
      setAviso({ titulo: 'Revisá el monto', texto: problema ?? 'Ingresá el monto.' })
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  /* Sólo lo facturado: el total pactado y lo pendiente ya están en la ficha de la etapa 1, y lo que queda
     pendiente se ve debajo del monto (regla del usuario, 14/10/2026). */
  const kpis = obra && (
    <div className="kpi-grid kpi-grid--3">
      <div className="kpi-card">
        <span className="kpi-label">Facturado</span>
        <span className="kpi-value">{pesos(facturado)}</span>
      </div>
    </div>
  )

  return (
    <section className="view paso-layout obras-v2 anticipos-v2 agenda-v2 presupuesto-v2 facturar-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('carga', null, null, 'facturar')}
        descripcion={
          <>
            Elegí qué vas a facturar de <strong>{obra?.nombre ?? 'la obra'}</strong>
            {obra?.idObra ? ` (${obra.idObra})` : ''} y por cuánto.
          </>
        }
      />

      {bloqueada && <Aviso tono="info">El comprobante ya empezó a emitirse en el sistema: lo que se factura no se puede cambiar.</Aviso>}

      {/* La pregunta, en la misma caja de "¿Qué querés hacer?" de Presupuesto. */}
      <div className="accion-cfg destino-cfg">
        <div className="cfgbox">
          <div className="cfg-ic">
            <i className={`fas ${nc ? 'fa-file-circle-minus' : 'fa-file-invoice-dollar'}`} />
          </div>
          <div className="cfg-c">
            <div className="cfg-l">¿Qué querés facturar?</div>
            <select
              className="cfg-sel"
              aria-label="¿Qué querés facturar?"
              value={tipo ?? ''}
              disabled={bloqueada}
              onChange={(e) => elegirTipo(e.target.value as TipoFacturacion)}
            >
              <option value="" disabled hidden>
                Seleccionar...
              </option>
              {TIPOS_FACTURACION.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.habilitado}>
                  {t.titulo}
                  {t.habilitado ? '' : ' (próximamente)'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {tipo === 'saldo' && obra && (
        <div className="card card--neutral card--flush card-pad fac-saldo">
          <h3 className="resumen-title">Saldo pendiente de facturar</h3>
          {kpis}
          {pend > 0 ? (
            <MontoComprobante
              id="fac-monto"
              rotulo="Monto a facturar"
              valor={elegida?.monto ?? ''}
              problema={problema}
              bloqueado={bloqueada}
              aclaracion="Arranca con todo el saldo pendiente de facturar: podés bajarlo para facturar una parte, nunca superarlo."
              tipo="saldo"
              obra={{ facturado, pendiente: pend }}
              onCambio={cambiarMonto}
            />
          ) : (
            <Aviso tono="info">La obra no tiene saldo pendiente de facturar.</Aviso>
          )}
        </div>
      )}

      {nc && obra && (
        <div className="card card--neutral card--flush card-pad fac-saldo">
          <h3 className="resumen-title">Nota de crédito</h3>
          {kpis}

          {leyendoFacturas || facturas === null ? (
            <Aviso tono="info">
              <i className="fas fa-circle-notch spin" /> Leyendo las facturas emitidas de la obra...
            </Aviso>
          ) : facturas.length === 0 ? (
            <Aviso tono="err">
              La obra no tiene facturas emitidas: no se puede emitir una nota de crédito sin al menos una factura.
            </Aviso>
          ) : (
            <>
              <p className="cobro-card-desc fac-nc-ayuda">
                Tildá la factura que anula la nota de crédito: su fila se despliega con el monto, que arranca con lo
                que la factura todavía admite anular. Se registra en la obra en negativo.
              </p>
              <TablaFacturasNc
                facturas={facturas}
                elegida={asociada}
                monto={elegida?.monto ?? ''}
                pendienteObra={pend}
                bloqueada={bloqueada}
                onElegir={(f) => (f ? elegirAsociada(f) : fijar({ asociada: null, elegidas: [] }))}
                onMonto={cambiarMonto}
              />

              {/* Por qué se emite: obligatorio. Queda en ✋ Observaciones del comprobante. Es el mismo campo
                  de la "Observación" de los datos de la medición: arranca en un renglón y crece. */}
              <div className="carga-grid fac-motivo">
                <div className={`med-campo ${marcar && problemaMot ? 'fac-monto--falta' : ''}`}>
                  <label className="med-l" htmlFor="fac-motivo">
                    Motivo de la nota de crédito *
                    <span className="med-l-sub">queda en las observaciones del comprobante</span>
                  </label>
                  <textarea
                    id="fac-motivo"
                    className="med-input med-area"
                    rows={2}
                    maxLength={MAX_MOTIVO}
                    placeholder="Ej: descuento acordado con el cliente por demora en la colocación"
                    value={factura.motivo}
                    disabled={bloqueada}
                    aria-invalid={(marcar && !!problemaMot) || undefined}
                    onChange={(e) => {
                      e.currentTarget.style.height = 'auto'
                      e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`
                      fijar({ motivo: e.target.value })
                    }}
                  />
                  {marcar && problemaMot && (
                    <p className="fact-input-error" role="alert">
                      <i className="fas fa-circle-exclamation" /> {problemaMot}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <PieEtapa>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {etiquetaPaso('envio', null, null, 'facturar')} <i className="fas fa-arrow-right" />
        </button>
      </PieEtapa>

      {aviso && (
        <AvisoModal titulo={aviso.titulo} onClose={() => setAviso(null)}>
          {aviso.texto}
        </AvisoModal>
      )}
      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
    </section>
  )
}
