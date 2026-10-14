import { useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { Avatar } from '@/components/ui/Avatar'
import { Fila } from '@/features/shared/FilaResumen'
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
  nombreComprobante,
  pesos,
  problemaDocumento,
} from '@/lib/facturacion'
import { comoUsuario, getUrlArchivo } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { emisionIniciada, todosEmitidos, type BorradorFactura } from './borrador'
import { comprobantesDe, emitirComprobantes, guardarEnDrive } from './emitir'

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

/**
 * El resumen de la facturación, a la izquierda de la etapa 3: a quién se factura (con el CUIT/DNI, que
 * se puede corregir antes de emitir), los datos del comprobante y lo que se factura de cada obra, con su
 * neto e IVA. Debajo, "Ver factura" y "Confirmar y emitir factura".
 *
 * Emitir crea un comprobante por obra y lo emite en ARCA (ver `emitirComprobantes`); mientras corre no
 * se puede salir. Un comprobante con error se puede reintentar: sigue con el mismo, no crea otro.
 */
export function ResumenFactura() {
  const { factura, enviado, usuario, usuarios, responsableId } = useApp()
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
  const nom = nombreComprobante(factura.tipo)

  const [confirmar, setConfirmar] = useState(false)
  const [corriendo, setCorriendo] = useState<{ texto: string; i: number } | null>(null)
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null)
  /** Editando el CUIT/DNI a facturar (el texto mientras se escribe). */
  const [editarDoc, setEditarDoc] = useState<string | null>(null)

  useAccionEnCurso(`Esperá a que termine la emisión de ${nom.articulo}.`, !!corriendo)

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
        texto: `El cliente es Responsable Inscripto: para emitirle ${nom.articulo} A hace falta su CUIT, de 11 dígitos.`,
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
        /* La nota de crédito lleva el CAE de la factura que anula. */
        comprobante:
          factura.tipo === 'notaCredito' && factura.asociada
            ? { tipo: 'notaCredito', caeAsociado: factura.asociada.cae, motivo: factura.motivo }
            : { tipo: 'factura' },
        documento,
        avanzar: (l) => dispatch({ type: 'setFactura', cambios: { comprobantes: l } }),
        onPaso: (texto, i) => setCorriendo({ texto, i }),
      })
      const err = final.find((c) => c.fase === 'error' || c.fase === 'emitiendo')
      if (err?.error) {
        setAviso({
          titulo: err.fase === 'error' ? `ARCA no emitió ${nom.articulo}` : `${nom.titulo} sigue emitiéndose`,
          texto: err.error,
        })
        return
      }
      /* Emitido: el PDF va al Drive de Polifroni (<año> / Facturas Obras / <fecha>). Si no se puede,
         no frena nada: se avisa y se reintenta al finalizar. */
      setCorriendo({ texto: 'Guardando el comprobante en el Drive de Polifroni', i: 0 })
      const d = await guardarEnDrive({
        comprobantes: final,
        avanzar: (l) => dispatch({ type: 'setFactura', cambios: { comprobantes: l } }),
      })
      if (d.errores.length)
        setAviso({
          titulo: `${nom.titulo} emitida, pero no se guardó en Drive`,
          texto: `${d.errores[0]} Podés enviarla igual: al finalizar la operación se vuelve a intentar guardarla.`,
        })
    } catch (e) {
      console.warn('[facturar] no se pudo emitir', e)
      setAviso({
        titulo: `No se pudo emitir ${nom.articulo}`,
        texto:
          `Monday no respondió mientras se emitía ${nom.articulo}. Lo que ya quedó hecho está guardado: tocá «Reintentar emisión» en unos segundos para seguir desde ahí, sin duplicar el comprobante. Si la falla persiste, contactate con el soporte de TAP.`,
      })
    } finally {
      setCorriendo(null)
    }
  }

  const n = filas.length
  const r = filas[0] ?? null
  const comp = r?.comp ?? null
  /** El PDF que devolvió ARCA: existe recién con el ítem creado y el comprobante emitido. */
  const pdfEmitido = comp?.fase === 'emitido' ? (comp.leido?.pdf ?? null) : null

  /**
   * Abre el comprobante emitido en otra pestaña. La pestaña se abre ANTES de pedir a Monday la dirección
   * firmada (vence en una hora, por eso se pide en el momento): abrirla después de esperar la frena el
   * bloqueador de ventanas. Es el mismo camino que "Ver Presup" de Presupuesto.
   */
  const verComprobante = async () => {
    if (!pdfEmitido) return
    const w = window.open('', '_blank')
    try {
      const url = await getUrlArchivo(pdfEmitido.assetId)
      if (w) w.location.href = url
      else window.open(url, '_blank')
    } catch {
      w?.close()
      setAviso({
        titulo: `No se pudo abrir ${nom.articulo}`,
        texto: 'Monday no devolvió el PDF del comprobante. Probá de nuevo en unos segundos.',
      })
    }
  }
  const emisor = usuarios.find((u) => u.id === responsableId) ?? (usuario ? comoUsuario(usuario.id, usuario.name) : null)
  const errorEmision = factura.comprobantes.find((c) => c.error)?.error ?? null
  const montoDistinto =
    comp?.fase === 'emitido' && comp.leido?.monto != null && r && Math.abs(comp.leido.monto - r.monto) >= 0.01 ? comp.leido.monto : null

  return (
    <div className="card card--flush resumen-emision">
      <h3 className="resumen-title">Resumen de la facturación</h3>

      {/* A quién se factura. */}
      <div className="rgroup">
        <Fila label="Usuario emisor">
          {emisor && (
            <>
              <Avatar ini={emisor.ini} color={emisor.color} size="sm" /> {emisor.name}
            </>
          )}
        </Fila>
        <Fila label="Cliente (cuenta corriente)">
          <span className="rvalue-txt" title={cuenta?.nombre}>
            {cuenta?.nombre ?? ''}
          </span>
        </Fila>
        <Fila label="Condición frente al IVA" requerido={false}>
          {cl?.condicionFiscal ?? ''}
        </Fila>
        <Fila label="CUIT / CUIL / DNI" requerido={false}>
          <span className="rvalue-txt">
            {docDigitos || 'Consumidor Final'}{' '}
            {!iniciada && (
              <button type="button" className="citem-editar" onClick={() => setEditarDoc(documento)}>
                Editar
              </button>
            )}
          </span>
        </Fila>
        <Fila label="Domicilio" requerido={false}>
          <span className="rvalue-txt" title={cl?.direccion}>
            {cl?.direccion ?? ''}
          </span>
        </Fila>
      </div>

      <hr className="rsep" />

      {/* El comprobante. */}
      <div className="rgroup">
        <Fila label="Obra">
          <span className="rvalue-txt" title={r?.obra?.nombre}>
            {r?.obra ? `${r.obra.nombre}${r.obra.idObra ? ` (${r.obra.idObra})` : ''}` : ''}
          </span>
        </Fila>
        <Fila label="Tipo de comprobante">{`${nom.titulo}${letra ? ` ${letra}` : ''}`}</Fila>
        {factura.asociada && (
          <Fila label="Comprobante asociado">
            <span className="rvalue-txt" title={`CAE ${factura.asociada.cae}`}>
              {factura.asociada.nombre}
            </span>
          </Fila>
        )}
        {factura.tipo === 'notaCredito' && (
          <Fila label="Motivo">
            <span className="rvalue-txt" title={factura.motivo}>
              {factura.motivo.trim()}
            </span>
          </Fila>
        )}
        <Fila label="Condición de venta">Cuenta Corriente</Fila>
        <Fila label="Moneda">Pesos</Fila>
        <Fila label="Fecha de emisión">{fechaCorta(new Date())}</Fila>
        <Fila label="Vencimiento del pago">{fecha(f.vencimiento)}</Fila>
      </div>

      <hr className="rsep" />

      {/* Lo que se factura. */}
      <div className="rgroup">
        <Fila label="Concepto" requerido={false}>
          <span className="rvalue-txt" title={CONCEPTO_FACTURA}>
            {CONCEPTO_FACTURA}
          </span>
        </Fila>
        <Fila label="Neto gravado">{pesos(neto)}</Fila>
        <Fila label={`IVA ${ALICUOTA_IVA} %`}>{pesos(iva)}</Fila>
        <Fila label={factura.tipo === 'notaCredito' ? 'Total de la nota de crédito' : 'Total a facturar'}>
          <strong>{pesos(total)}</strong>
        </Fila>
        {comp?.fase === 'emitido' && (
          <Fila label="N° y CAE" requerido={false}>
            <span className="rvalue-txt">
              {comp.leido?.numero || '—'} · CAE {comp.leido?.cae || '—'}
            </span>
          </Fila>
        )}
        {comp?.fase === 'emitido' && (
          <Fila label="Guardada en Drive" requerido={false}>
            {comp.drive ? (
              <a className="rvalue-txt" href={comp.drive.webViewLink} target="_blank" rel="noopener noreferrer" title={comp.drive.ruta}>
                {comp.drive.ruta}
              </a>
            ) : (
              ''
            )}
          </Fila>
        )}
      </div>

      {/* El botón de la acción: el mismo "Generar OP final" del resumen de la OP. */}
      <button
        type="button"
        className="btn-generar btn-mayus"
        onClick={pedirConfirmacion}
        disabled={listos || !!corriendo || enviado || n === 0}
        aria-busy={!!corriendo}
        title={listos ? `${nom.titulo} ya emitida en ARCA.` : conError ? 'Tocá para reintentar la emisión' : undefined}
        style={
          listos
            ? { backgroundColor: 'var(--green)', color: '#fff' }
            : conError && !corriendo
              ? { backgroundColor: 'var(--red)', color: '#fff' }
              : undefined
        }
      >
        {corriendo ? (
          <>
            <i className="fas fa-circle-notch spin" /> Emitiendo {nom.titulo.toLowerCase()}...
          </>
        ) : listos ? (
          <>
            <i className="fas fa-check" /> {nom.titulo} emitida
          </>
        ) : conError ? (
          <>
            <i className="fas fa-xmark" /> Error de emisión · Reintentar
          </>
        ) : pendienteArca ? (
          <>
            <i className="fas fa-rotate-right" /> Volver a consultar
          </>
        ) : (
          <>
            <i className="fas fa-file-circle-check" /> Confirmar y emitir {nom.titulo.toLowerCase()}
          </>
        )}
      </button>

      <div className="pres-pdf">
        <button
          type="button"
          className="btn btn-out pres-pdf-btn"
          disabled={!pdfEmitido}
          title={
            pdfEmitido
              ? `Abrir el PDF de ${nom.articulo} en otra pestaña`
              : `Se habilita cuando ${nom.articulo} está emitida: confirmala y emitila primero`
          }
          onClick={() => void verComprobante()}
        >
          <i className="fas fa-eye" /> Ver {nom.titulo}
        </button>
      </div>
      {(errorEmision || montoDistinto !== null) && (
        <div className="pres-pdf-aviso" role="alert">
          <i className="fas fa-circle-exclamation" />{' '}
          {errorEmision ?? `Se emitió por ${pesos(montoDistinto ?? 0)}, no por ${pesos(r?.monto ?? 0)}: revisalo en el sistema.`}
        </div>
      )}

      {editarDoc !== null && (
        <Modal
          title="CUIT / CUIL / DNI a facturar"
          icon={<i className="fas fa-id-card" />}
          onClose={() => setEditarDoc(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setEditarDoc(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-marca"
                disabled={!!problemaDocumento(editarDoc)}
                onClick={() => {
                  dispatch({ type: 'setFactura', cambios: { documento: documentoFiscal(editarDoc) } })
                  setEditarDoc(null)
                }}
              >
                Guardar
              </button>
            </>
          }
        >
          <div className="carga-grid fac-doc-modal">
            <div className="med-campo">
              <div className={`med-conic ${problemaDocumento(editarDoc) ? 'fac-monto--falta' : ''}`}>
                <i className="fas fa-id-card" aria-hidden="true" />
                <input
                  className="med-input"
                  inputMode="numeric"
                  placeholder="Vacío: Consumidor Final"
                  aria-label="CUIT / CUIL / DNI a facturar"
                  value={editarDoc}
                  autoFocus
                  onChange={(e) => setEditarDoc(e.target.value)}
                />
              </div>
            </div>
          </div>
          <p className="modal-nota">{problemaDocumento(editarDoc) ?? 'Se usa sólo en esta factura: no cambia la ficha del cliente.'}</p>
        </Modal>
      )}


      {confirmar && (
        <Modal
          title={`¿Emitir ${nom.articulo}?`}
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
          Se emite {nom.articulo} en ARCA a nombre de <strong>{cuenta?.nombre}</strong> por un total de <strong>{pesos(total)}</strong>
          {docDigitos ? ` (CUIT/DNI ${docDigitos})` : ' (Consumidor Final, sin documento)'}
          {factura.asociada ? `, que anula parte de ${factura.asociada.nombre}` : ''}. Un comprobante emitido no se puede deshacer desde la
          app{factura.tipo === 'notaCredito' ? '.' : ': se anula con una nota de crédito.'}
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
