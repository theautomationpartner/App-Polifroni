import { useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import {
  ALICUOTA_IVA,
  CONCEPTO_FACTURA,
  aCentavos,
  desglose,
  documentoFiscal,
  fechaCorta,
  fechasComprobante,
  importeEscrito,
  letraEsperada,
  pesos,
  problemaDocumento,
  type FaseComprobante,
} from '@/lib/facturacion'
import { useApp, useDispatch } from '@/state/hooks'
import { emisionIniciada, todosEmitidos, type BorradorFactura, type ComprobanteEnCurso } from './borrador'
import { comprobantesDe, emitirComprobantes } from './emitir'

/** "2026-11-12" → "12/11/2026". */
const fecha = (iso: string) => iso.split('-').reverse().join('/')

/** Lo que se factura, obra por obra, con su desglose de IVA. */
function renglones(f: BorradorFactura) {
  return f.elegidas.map((e) => {
    const obra = f.obras.find((o) => o.id === e.obraId)
    const monto = aCentavos(importeEscrito(e.monto) ?? 0)
    const comp = f.comprobantes.find((c) => c.obraId === e.obraId) ?? null
    return { obraId: e.obraId, obra, monto, ...desglose(monto), comp }
  })
}

const FASE: Record<FaseComprobante, { texto: string; color: string; icono: string }> = {
  sinEmitir: { texto: 'Sin emitir', color: '#676879', icono: 'fa-file' },
  emitiendo: { texto: 'Emitiendo en ARCA', color: '#fdab3d', icono: 'fa-circle-notch spin' },
  emitido: { texto: 'Emitida', color: '#00c875', icono: 'fa-check' },
  error: { texto: 'Error de emisión', color: '#e2445c', icono: 'fa-xmark' },
}

function EstadoComprobante({ c }: { c: ComprobanteEnCurso | null }) {
  const f = FASE[c?.fase ?? 'sinEmitir']
  return (
    <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: f.color }}>
      <i className={`fas ${f.icono}`} aria-hidden="true" /> {c?.fase === 'emitido' && c.leido?.numero ? `${f.texto} · N° ${c.leido.numero}` : f.texto}
    </span>
  )
}

/**
 * "Ver factura". Emitida, el PDF que devolvió ARCA (con varias, una pestaña por comprobante). Antes de
 * emitir, una vista previa armada con los datos del resumen: es un BORRADOR, sin número ni CAE.
 */
function VistaFactura({ onClose }: { onClose: () => void }) {
  const { factura } = useApp()
  const filas = renglones(factura)
  const [viendo, setViendo] = useState(0)
  const actual = filas[viendo] ?? filas[0]
  const pdf = actual?.comp?.fase === 'emitido' ? (actual.comp.leido?.pdf ?? null) : null
  const cl = factura.cuenta?.cliente ?? null
  const letra = actual?.comp?.leido?.letra || letraEsperada(cl?.condicionFiscal ?? '')
  const f = fechasComprobante(new Date())

  return (
    <Modal
      title={pdf ? 'Factura emitida' : 'Vista previa de la factura'}
      icon={<i className="fas fa-file-invoice-dollar" />}
      onClose={onClose}
      className="fac-modal-vista"
      actions={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      {filas.length > 1 && (
        <div className="msj-quien" role="tablist" aria-label="Ver la factura de">
          {filas.map((r, i) => (
            <button
              key={r.obraId}
              type="button"
              role="tab"
              aria-selected={viendo === i}
              className={`msj-quien-op ${viendo === i ? 'msj-quien-op--on' : ''}`}
              onClick={() => setViendo(i)}
            >
              {r.obra?.idObra || r.obra?.nombre || `Obra ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {pdf ? (
        <div className="fac-visor">
          <VisorPdf archivo={pdf} vacio="La factura no tiene PDF." />
        </div>
      ) : actual ? (
        <div className="fac-borrador" aria-label="Borrador de la factura">
          <span className="fac-borrador-marca">BORRADOR · SIN VALIDEZ FISCAL</span>
          <div className="fac-borrador-cab">
            <div>
              <strong className="fac-borrador-emisor">Polifroni Aberturas</strong>
              <span>Condición de venta: Cuenta Corriente</span>
              <span>Moneda: Pesos</span>
            </div>
            <div className="fac-borrador-letra" title="La letra la asigna ARCA según la condición frente al IVA del cliente">
              {letra ?? '?'}
            </div>
            <div className="fac-borrador-num">
              <strong>FACTURA</strong>
              <span>N° — (lo asigna ARCA)</span>
              <span>Fecha de emisión: {fecha(f.emision)}</span>
              <span>Vto. del pago: {fecha(f.vencimiento)}</span>
            </div>
          </div>
          <dl className="fac-borrador-receptor">
            <div>
              <dt>Cliente</dt>
              <dd>{factura.cuenta?.nombre || '—'}</dd>
            </div>
            <div>
              <dt>CUIT / DNI</dt>
              <dd>{documentoFiscal(factura.documento) || 'Sin documento (Consumidor Final)'}</dd>
            </div>
            <div>
              <dt>Condición frente al IVA</dt>
              <dd>{cl?.condicionFiscal || 'Sin informar'}</dd>
            </div>
            <div>
              <dt>Domicilio</dt>
              <dd>{cl?.direccion || '—'}</dd>
            </div>
            <div>
              <dt>Período del servicio</dt>
              <dd>
                {fecha(f.desde)} al {fecha(f.hasta)}
              </dd>
            </div>
            <div>
              <dt>Obra</dt>
              <dd>
                {actual.obra?.nombre} {actual.obra?.idObra ? `(${actual.obra.idObra})` : ''}
              </dd>
            </div>
          </dl>
          <table className="fac-borrador-tabla">
            <thead>
              <tr>
                <th>Cant.</th>
                <th>Descripción</th>
                <th>Precio unit. s/IVA</th>
                <th>IVA</th>
                <th>Subtotal c/IVA</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>{CONCEPTO_FACTURA}</td>
                <td>{pesos(actual.neto)}</td>
                <td>{ALICUOTA_IVA} %</td>
                <td>{pesos(actual.total)}</td>
              </tr>
            </tbody>
          </table>
          <div className="fac-borrador-totales">
            <span>Neto gravado: {pesos(actual.neto)}</span>
            <span>
              IVA {ALICUOTA_IVA} %: {pesos(actual.iva)}
            </span>
            <strong>Total: {pesos(actual.total)}</strong>
          </div>
          <p className="modal-nota">
            {letra === 'A' ? 'A un Responsable Inscripto, el IVA se discrimina en la factura A.' : 'En la factura B el IVA va incluido en el total.'} El
            número, la letra definitiva y el CAE los asigna ARCA al emitir.
          </p>
        </div>
      ) : null}
    </Modal>
  )
}

/**
 * El resumen de la facturación, a la izquierda de la etapa 3: a quién se factura (con el CUIT/DNI, que
 * se puede corregir antes de emitir), los datos del comprobante y lo que se factura de cada obra, con su
 * neto e IVA. Debajo, "Ver factura" y "Confirmar y emitir factura".
 *
 * Emitir crea un comprobante por obra y lo emite en ARCA (ver `emitirComprobantes`); mientras corre no
 * se puede salir. Un comprobante con error se puede reintentar: sigue con el mismo, no crea otro.
 */
export function ResumenFactura() {
  const { factura, enviado } = useApp()
  const dispatch = useDispatch()
  const { cuenta, documento } = factura
  const cl = cuenta?.cliente ?? null
  const filas = renglones(factura)
  const total = aCentavos(filas.reduce((s, r) => s + r.total, 0))
  const neto = aCentavos(filas.reduce((s, r) => s + r.neto, 0))
  const iva = aCentavos(total - neto)
  const f = fechasComprobante(new Date())
  const letra = letraEsperada(cl?.condicionFiscal ?? '')
  const iniciada = emisionIniciada(factura)
  const listos = todosEmitidos(factura)
  const conError = factura.comprobantes.some((c) => c.fase === 'error')
  const pendienteArca = factura.comprobantes.some((c) => c.fase === 'emitiendo')

  const [ver, setVer] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [corriendo, setCorriendo] = useState<{ texto: string; i: number } | null>(null)
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null)

  useAccionEnCurso('Esperá a que termine la emisión de la factura.', !!corriendo)

  const problemaDoc = problemaDocumento(documento)
  const docDigitos = documentoFiscal(documento)

  const pedirConfirmacion = () => {
    if (problemaDoc) {
      setAviso({ titulo: 'Revisá el CUIT/DNI a facturar', texto: problemaDoc })
      return
    }
    if (letra === 'A' && docDigitos.length !== 11) {
      setAviso({
        titulo: 'Falta el CUIT del cliente',
        texto: 'El cliente es Responsable Inscripto: para emitirle la factura A hace falta su CUIT, de 11 dígitos.',
      })
      return
    }
    /* Un reintento no pregunta de nuevo: la emisión ya se confirmó. */
    if (iniciada) void emitir()
    else setConfirmar(true)
  }

  const emitir = async () => {
    setConfirmar(false)
    const montos = factura.elegidas.map((e) => ({ obraId: e.obraId, monto: aCentavos(importeEscrito(e.monto) ?? 0) }))
    const lista = comprobantesDe(factura, montos)
    dispatch({ type: 'setFactura', cambios: { comprobantes: lista } })
    setCorriendo({ texto: 'Preparando la emisión', i: 0 })
    try {
      const final = await emitirComprobantes({
        comprobantes: lista,
        documento,
        avanzar: (l) => dispatch({ type: 'setFactura', cambios: { comprobantes: l } }),
        onPaso: (texto, i) => setCorriendo({ texto, i }),
      })
      const err = final.find((c) => c.fase === 'error' || c.fase === 'emitiendo')
      if (err?.error) setAviso({ titulo: err.fase === 'error' ? 'ARCA no emitió la factura' : 'La factura sigue emitiéndose', texto: err.error })
    } catch (e) {
      console.warn('[facturar] no se pudo emitir', e)
      setAviso({
        titulo: 'No se pudo emitir la factura',
        texto:
          'Monday no respondió mientras se emitía la factura. Lo que ya quedó hecho está guardado: tocá «Reintentar emisión» en unos segundos para seguir desde ahí, sin duplicar el comprobante. Si la falla persiste, contactate con el soporte de TAP.',
      })
    } finally {
      setCorriendo(null)
    }
  }

  const n = filas.length

  return (
    <div className="card card--neutral card--flush card-pad fac-resumen">
      <h3 className="resumen-title">Resumen de la facturación</h3>

      <h4 className="fac-sub">
        <i className="fas fa-user" aria-hidden="true" /> Se factura a
      </h4>
      <dl className="fac-datos fac-datos--2">
        <div className="fac-dato">
          <dt>Cliente (cuenta corriente)</dt>
          <dd>{cuenta?.nombre ?? '—'}</dd>
        </div>
        <div className="fac-dato">
          <dt>Condición frente al IVA</dt>
          <dd className={cl?.condicionFiscal ? '' : 'fac-dato--falta'}>{cl?.condicionFiscal || 'Sin informar'}</dd>
        </div>
        <div className="fac-dato fac-doc">
          <dt>
            <label htmlFor="fac-doc">CUIT / CUIL / DNI a facturar</label>
          </dt>
          <dd className="carga-grid">
            <div className={`med-conic ${problemaDoc ? 'fac-monto--falta' : ''}`}>
              <i className="fas fa-id-card" aria-hidden="true" />
              <input
                id="fac-doc"
                className="med-input"
                inputMode="numeric"
                placeholder="Sin documento: Consumidor Final"
                value={documento}
                disabled={iniciada}
                onChange={(e) => dispatch({ type: 'setFactura', cambios: { documento: e.target.value } })}
              />
            </div>
          </dd>
        </div>
        <div className="fac-dato">
          <dt>Domicilio</dt>
          <dd className={cl?.direccion ? '' : 'fac-dato--falta'}>{cl?.direccion || 'Sin cargar'}</dd>
        </div>
      </dl>

      <h4 className="fac-sub">
        <i className="fas fa-file-invoice" aria-hidden="true" /> Comprobante
      </h4>
      <dl className="fac-datos fac-datos--3">
        <div className="fac-dato">
          <dt>Tipo</dt>
          <dd>
            Factura{letra ? ` ${letra}` : ''} {n > 1 && <span className="fac-x">× {n}</span>}
          </dd>
        </div>
        <div className="fac-dato">
          <dt>Moneda</dt>
          <dd>Pesos</dd>
        </div>
        <div className="fac-dato">
          <dt>Condición de venta</dt>
          <dd>Cuenta Corriente</dd>
        </div>
        <div className="fac-dato">
          <dt>Fecha de emisión</dt>
          <dd>{fechaCorta(new Date())}</dd>
        </div>
        <div className="fac-dato">
          <dt>Período del servicio</dt>
          <dd>{fecha(f.desde)}</dd>
        </div>
        <div className="fac-dato">
          <dt>Vencimiento del pago</dt>
          <dd>{fecha(f.vencimiento)}</dd>
        </div>
      </dl>

      <h4 className="fac-sub">
        <i className="fas fa-person-digging" aria-hidden="true" /> Detalle {n > 1 ? `(un comprobante por obra)` : ''}
      </h4>
      <div className="ant-tabla-wrap">
        <table className="ant-tabla fac-tabla-resumen">
          <thead>
            <tr>
              <th>Obra</th>
              <th className="ant-col-cen">Neto</th>
              <th className="ant-col-cen">IVA {ALICUOTA_IVA} %</th>
              <th className="ant-col-cen">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.obraId} className="ant-row">
                <td>
                  <span className="ant-nro">{r.obra?.nombre ?? r.obraId}</span>
                  <span className="ant-detalle fac-obra-sub">
                    {r.obra?.idObra} · {CONCEPTO_FACTURA}
                  </span>
                  <span className="fac-estado-comp">
                    <EstadoComprobante c={r.comp} />
                    {r.comp?.fase === 'emitido' && r.comp.leido?.cae && <span className="ritem-code">CAE {r.comp.leido.cae}</span>}
                  </span>
                  {r.comp?.fase === 'emitido' && r.comp.leido?.monto !== null && r.comp.leido?.monto !== undefined && Math.abs(r.comp.leido.monto - r.monto) >= 0.01 && (
                    <span className="fac-detalle-err">
                      <i className="fas fa-triangle-exclamation" aria-hidden="true" /> Se facturó {pesos(r.comp.leido.monto)}, no {pesos(r.monto)}: revisalo en el sistema.
                    </span>
                  )}
                  {r.comp?.error && (
                    <span className="fac-detalle-err">
                      <i className="fas fa-circle-exclamation" aria-hidden="true" /> {r.comp.error}
                    </span>
                  )}
                </td>
                <td className="ant-col-cen">
                  <span className="ant-num">{pesos(r.neto)}</span>
                </td>
                <td className="ant-col-cen">
                  <span className="ant-num">{pesos(r.iva)}</span>
                </td>
                <td className="ant-col-cen">
                  <span className="ant-num fac-fuerte">{pesos(r.total)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fac-totales">
        <span>
          Neto gravado <strong>{pesos(neto)}</strong>
        </span>
        <span>
          IVA {ALICUOTA_IVA} % <strong>{pesos(iva)}</strong>
        </span>
        <span className="fac-totales-total">
          Total a facturar <strong>{pesos(total)}</strong>
        </span>
      </div>

      <div className="fac-acciones">
        <button type="button" className="btn btn-out" onClick={() => setVer(true)}>
          <i className="fas fa-eye" /> Ver factura
        </button>
        <button
          type="button"
          className="btn-block btn-mayus fac-emitir"
          style={{ background: listos ? 'var(--green)' : conError ? 'var(--red)' : 'var(--primary-blue)', ...(listos ? { opacity: 1 } : {}) }}
          disabled={listos || !!corriendo || enviado || n === 0}
          onClick={pedirConfirmacion}
        >
          {listos ? (
            <>
              <i className="fas fa-check" /> {n > 1 ? 'Facturas emitidas' : 'Factura emitida'}
            </>
          ) : corriendo ? (
            <>
              <i className="fas fa-circle-notch spin" /> Emitiendo...
            </>
          ) : conError ? (
            <>
              <i className="fas fa-rotate-right" /> Reintentar emisión
            </>
          ) : pendienteArca ? (
            <>
              <i className="fas fa-rotate-right" /> Volver a consultar
            </>
          ) : (
            <>
              <i className="fas fa-file-circle-check" /> Confirmar y emitir factura
            </>
          )}
        </button>
      </div>

      {ver && <VistaFactura onClose={() => setVer(false)} />}

      {confirmar && (
        <Modal
          title={n > 1 ? `¿Emitir ${n} facturas?` : '¿Emitir la factura?'}
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setConfirmar(false)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setConfirmar(false)}>
                Volver
              </button>
              <button type="button" className="btn btn-primary btn-marca" onClick={() => void emitir()}>
                Confirmar y emitir
              </button>
            </>
          }
        >
          Se {n > 1 ? `emiten ${n} facturas` : 'emite la factura'} en ARCA a nombre de <strong>{cuenta?.nombre}</strong> por un total de{' '}
          <strong>{pesos(total)}</strong>
          {docDigitos ? ` (CUIT/DNI ${docDigitos})` : ' (Consumidor Final, sin documento)'}. Una factura emitida no se puede deshacer desde la
          app: se anula con una nota de crédito.
        </Modal>
      )}

      {corriendo && (
        <ModalCargando
          titulo={`${corriendo.texto}...`}
          detalle={
            n > 1
              ? `Comprobante ${corriendo.i + 1} de ${n}: ${filas[corriendo.i]?.obra?.nombre ?? ''}. Puede tardar hasta un minuto por comprobante: no cierres la app.`
              : 'Puede tardar hasta un minuto: no cierres la app.'
          }
        />
      )}

      {aviso && (
        <AvisoModal titulo={aviso.titulo} onClose={() => setAviso(null)}>
          {aviso.texto}
        </AvisoModal>
      )}
    </div>
  )
}
