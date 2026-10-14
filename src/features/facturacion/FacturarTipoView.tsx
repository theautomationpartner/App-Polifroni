import { useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
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
  tipoHabilitado,
  type TipoFacturacion,
} from '@/lib/facturacion'
import { etiquetaPaso } from '@/lib/pasos'
import { facturasDeObra, type FacturaEmitida } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { emisionIniciada, type BorradorFactura } from './borrador'
import { MontoComprobante } from './MontoComprobante'

/** "2026-10-07" → "07/10/2026". */
const fecha = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '')

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
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  /** Las facturas emitidas de la obra (para la nota de crédito). `null`: todavía no se leyeron. */
  const [facturas, setFacturas] = useState<FacturaEmitida[] | null>(null)
  const [leyendoFacturas, setLeyendoFacturas] = useState(false)

  const pend = obra ? pendienteDeFacturar(obra) : 0
  const facturado = obra?.facturado ?? 0
  const elegida = elegidas[0] ?? null
  const nc = tipo === 'notaCredito'
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
        /* Con una sola que admite anular, va elegida (y su monto precargado). */
        const conSaldo = lista.filter((f) => f.disponible > 0)
        if (!asociada && conSaldo.length === 1 && !bloqueada) elegirAsociada(conSaldo[0])
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
    if (nc && !asociada) {
      setAviso({ titulo: 'Falta la factura a anular', texto: 'Elegí la factura de la obra que anula la nota de crédito.' })
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
    <section className="view paso-layout obras-v2 facturar-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('carga', null, null, 'facturar')}
        descripcion={`Elegí qué vas a facturar de ${obra?.nombre ?? 'la obra'}${obra?.idObra ? ` (${obra.idObra})` : ''} y por cuánto.`}
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
            <Aviso tono="info">La obra no tiene facturas emitidas: no hay nada que anular con una nota de crédito.</Aviso>
          ) : (
            <>
              <div className="carga-grid fac-asociada">
                <div className="med-campo">
                  <label className="med-l" htmlFor="fac-asociada">
                    Factura que anula *
                  </label>
                  <SelectBuscable
                    id="fac-asociada"
                    valor={asociada?.id ?? ''}
                    opciones={facturas.map((f) => ({
                      valor: f.id,
                      texto: `${f.nombre} · ${fecha(f.fecha)} · ${pesos(f.monto)}${
                        f.acreditado ? ` (queda por anular ${pesos(f.disponible)})` : ''
                      }`,
                    }))}
                    placeholder="Elegí la factura..."
                    disabled={bloqueada}
                    onElegir={(v) => {
                      const f = facturas.find((x) => x.id === v)
                      if (f) elegirAsociada(f)
                    }}
                  />
                </div>
              </div>
              {asociada &&
                (disponibleNc > 0 ? (
                  <MontoComprobante
                    id="fac-monto-nc"
                    rotulo="Monto de la nota de crédito"
                    valor={elegida?.monto ?? ''}
                    problema={problema}
                    bloqueado={bloqueada}
                    aclaracion={`Arranca con lo que la factura todavía admite anular (${pesos(disponibleNc)}): podés bajarlo, nunca superarlo. Se registra en la obra en negativo.`}
                    tipo="notaCredito"
                    obra={{ facturado, pendiente: pend }}
                    onCambio={cambiarMonto}
                  />
                ) : (
                  <Aviso tono="info">Esa factura ya está anulada por completo con notas de crédito.</Aviso>
                ))}
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
