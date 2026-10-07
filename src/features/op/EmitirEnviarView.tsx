import { useRef, useState, type ReactNode } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { EnviarOp, type OrdenLocal } from '@/features/envio/EnviarOp'
import { coordinador } from '@/features/obras/coordinador'
import { useObra } from '@/features/obras/useObra'
import { FinalizarOperacion } from '@/features/shared/FinalizarOperacion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useRefrescarObra } from '@/features/shared/PasoNav'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { comoUsuario } from '@/services/monday'
import { ErrorLecturaIA, leerListado } from '@/services/ia/hetmo'
import { useApp, useDispatch } from '@/state/hooks'
import { hoyLocal } from './DatosMedicion'
import { generarOpFinal } from './opFinal/generar'
import { guardarOpGenerada, registrarPvc } from './registrarPvc'

/** "2026-09-25" → "25/09/2026". */
const fecha = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso)

/** Un renglón del resumen (el `Fila` de La Batea): rótulo a la izquierda, valor a la derecha. */
function Fila({ label, requerido = true, children }: { label: string; requerido?: boolean; children: ReactNode }) {
  const vacio = children === '' || children == null
  return (
    <div className="rrow">
      <span className="rlabel">
        {label}
        {requerido && <span className="rreq">*</span>}
      </span>
      <span className={`rvalue ${vacio ? 'rvalue--falta' : ''}`}>{vacio ? '--' : children}</span>
    </div>
  )
}

/**
 * Etapa 3 · Emitir y Enviar OP (PVC, al cliente o constructor).
 *
 * El armado del paso de emisión de La Batea: a la izquierda el "Resumen OP final a generar" —todo
 * lo cargado en la etapa anterior, de sólo lectura— con el botón de generar y, debajo, "Ver OP
 * Final"; a la derecha, el envío. El envío se habilita con la OP final generada.
 *
 * Generar le pasa el PDF de HETMO (el que se cargó en la app) a Claude para leer el listado completo
 * y arma el PDF final en la app. Generado, la OP se crea en el tablero como "Generada Pend de
 * Enviar", con el original en `🤖OP OriginaL` y la OP final en `🤖Op V2 Mejorada` (ver
 * `guardarOpGenerada`): una orden generada que no se llega a enviar se termina desde la consulta.
 * "Ver OP Final" usa el PDF de la app y "Confirmar y Enviar" lo manda dentro del pedido. "Finalizar
 * Operación" completa la misma OP: los subelementos (una abertura cada uno, con observación y vidrios), el N° de HETMO y el
 * envío (ver `registrarPvc`). Se puede volver a generar mientras la orden no se haya enviado: se
 * reusa la misma OP y se reemplaza la OP final.
 */
export function EmitirEnviarView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()
  const { borrador, usuario, usuarios, responsableId, enviado } = useApp()
  /** La IA está leyendo el listado completo. */
  const [leyendo, setLeyendo] = useState(false)
  /** Armando el PDF con la lectura que devolvió la IA. */
  const [armando, setArmando] = useState(false)
  /** Guardando en el tablero la OP generada ("Generada Pend de Enviar", con sus dos PDF). */
  const [guardando, setGuardando] = useState(false)
  const [errorGen, setErrorGen] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[] | null>(null)

  useAccionEnCurso('Esperá a que termine la generación de la OP.', leyendo || armando || guardando)

  /* Lo último del borrador, para leerlo cuando la generación termina (fuera de este render). */
  const borradorRef = useRef(borrador)
  borradorRef.current = borrador

  const m = borrador.medicion
  const emisor =
    usuarios.find((u) => u.id === responsableId) ?? (usuario ? comoUsuario(usuario.id, usuario.name) : null)
  const escritas = borrador.aberturas.filter((a) => a.texto.trim()).length
  const coord = coordinador(obra)
  const generando = leyendo || armando || guardando
  const opFinal = borrador.generada ? borrador.opFinal : null
  const generada = !!opFinal
  const nro = m.nroOrden
  const medidoPor = m.medidoPor
  const fechaMed = m.fecha
  /* El envío manda la OP final de la app: en Monday todavía no está. */
  const local: OrdenLocal | null = opFinal
    ? {
        /* La OP ya está en el tablero (se creó al generar): el enlace de confirmación la lleva. */
        ordenId: borrador.ordenId,
        archivo: opFinal,
        numero: nro.trim(),
        tipo: 'PVC',
        medidoPor,
        fecha: fechaMed,
        observacion: m.observacion,
      }
    : null

  const pedirGenerar = () => {
    if (generando || enviado) return
    const f = [
      ...(!borrador.hetmo ? ['Falta la orden de HETMO: cargala en la etapa anterior.'] : []),
      ...(!m.nroOrden.trim() ? ['Falta el N° de orden.'] : []),
    ]
    if (f.length) {
      setErrorGen(null)
      setAvisos(null)
      setFaltan(f)
      return
    }
    /* Sin ventana en el medio: tocar "Generar OP final" ya es la decisión, y la lectura sale en el
       acto. */
    void generar()
  }
  const [faltan, setFaltan] = useState<string[] | null>(null)

  /**
   * Lee el listado con Claude y arma el PDF final en la app. Nada va a Monday. Lo del borrador se lee
   * de la referencia: la lectura tarda, y en el medio puede cambiar.
   */
  const generar = async () => {
    setErrorGen(null)
    const pdf = borradorRef.current.hetmo
    if (!pdf) return
    setLeyendo(true)
    let lectura: Awaited<ReturnType<typeof leerListado>>
    try {
      lectura = await leerListado(pdf)
    } catch (e) {
      setErrorGen(
        e instanceof ErrorLecturaIA ? e.message : 'No se pudo leer el documento con IA. Volvé a generar la OP final.',
      )
      return
    } finally {
      setLeyendo(false)
    }

    setArmando(true)
    try {
      const b = borradorRef.current
      const fresca = await refrescar().catch(() => null)
      const base = fresca ?? obra
      const r = await generarOpFinal({
        hetmo: pdf,
        deFoto: b.hetmoDeFoto,
        lectura,
        obra: base.nombre,
        direccion: base.ubicacion,
        celular: base.celCoordinar,
        nroOrden: b.medicion.nroOrden.trim(),
        fecha: hoyLocal().split('-').reverse().join('/'),
        medidoPor: b.medicion.medidoPor,
        fechaMedicion: b.medicion.fecha ? b.medicion.fecha.split('-').reverse().join('/') : '',
        observacionOp: b.medicion.observacion,
        aberturas: b.aberturas,
      })
      if (!r.ok || !r.archivo) {
        setErrorGen(`No se generó la OP final. ${r.errores.join(' · ')}`)
        return
      }
      dispatch({
        type: 'setBorrador',
        cambios: {
          generada: true,
          opFinal: r.archivo,
          lecturaOp: lectura,
          /* El N° de OP de HETMO es el número del listado, del encabezado ("9.205"). */
          nOpHetmo: (lectura.numeroListado ?? '').trim(),
          /* Otra OP final es otra orden: un envío hecho con la anterior ya no vale. */
          envio: null,
        },
      })
      /* La OP queda en el tablero "Generada Pend de Enviar", con el original y la OP final. Si
         Monday falla, la OP final igual sirve para enviar: se avisa y Finalizar lo reintenta. */
      setGuardando(true)
      let avisos = r.avisos
      try {
        await guardarOpGenerada({
          obra: base,
          /* La lectura y el N° de HETMO recién se despacharon: todavía no están en la referencia. */
          borrador: {
            ...borradorRef.current,
            opFinal: r.archivo,
            generada: true,
            lecturaOp: lectura,
            nOpHetmo: (lectura.numeroListado ?? '').trim(),
          },
          opFinal: r.archivo,
          responsableId,
          avanzar: (cambios) => dispatch({ type: 'setBorrador', cambios }),
        })
      } catch (err) {
        console.warn('[pvc] no se pudo guardar la OP generada en Monday', err)
        avisos = [
          ...avisos,
          'La OP final se generó, pero no se pudo guardar en el tablero de órdenes. Podés enviarla igual: al finalizar la operación se vuelve a intentar.',
        ]
      } finally {
        setGuardando(false)
      }
      if (avisos.length) setAvisos(avisos)
    } finally {
      setArmando(false)
    }
  }

  const verOpFinal = () => {
    if (!opFinal) return
    const url = URL.createObjectURL(opFinal)
    window.open(url, '_blank')
    /* La dirección vive lo que tarda en abrirse la pestaña: después se libera la memoria. */
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const errorCorrida: string | null = null

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Emitir y Enviar OP"
        descripcion="Revisá el resumen, generá la OP final y mandásela al cliente o al constructor."
      />

      <div className="emision-grid">
        <div className="emision-col">
          <div className="card card--flush resumen-emision">
            <h3 className="resumen-title">Resumen OP final a generar</h3>

            <div className="rgroup">
              <Fila label="Usuario emisor">
                {emisor && (
                  <>
                    <Avatar ini={emisor.ini} color={emisor.color} size="sm" /> {emisor.name}
                  </>
                )}
              </Fila>
              <Fila label="Obra">
                <span className="rvalue-txt" title={obra.nombre}>
                  {obra.nombre}
                </span>
              </Fila>
              <Fila label="Tipo de obra">{obra.tipo.texto}</Fila>
              <Fila label="Coordinador" requerido={false}>
                {coord ? (
                  <span className="rvalue-txt" title={`${coord.nombre} (${coord.rol})`}>
                    {coord.nombre || 'Sin nombre'} ({coord.rol})
                  </span>
                ) : (
                  ''
                )}
              </Fila>
            </div>

            <hr className="rsep" />

            <div className="rgroup">
              <Fila label="N° de orden">{nro}</Fila>
              <Fila label="Medido por">{medidoPor}</Fila>
              <Fila label="Fecha de medición" requerido={false}>
                {fechaMed ? fecha(fechaMed) : ''}
              </Fila>
              {borrador.nOpHetmo && <Fila label="N° OP HETMO" requerido={false}>{borrador.nOpHetmo}</Fila>}
            </div>

            <hr className="rsep" />

            <div className="rgroup">
              <Fila label="Cantidad de aberturas" requerido={false}>
                {borrador.aberturas.length ? String(borrador.aberturas.length) : ''}
              </Fila>
              <Fila label="Observaciones cargadas" requerido={false}>
                {borrador.aberturas.length ? `${escritas} de ${borrador.aberturas.length}` : ''}
              </Fila>
              <Fila label="Documento HETMO">
                <span className="rvalue-txt" title={borrador.hetmo?.name}>
                  {borrador.hetmo?.name ?? ''}
                </span>
              </Fila>
            </div>

            <button
              type="button"
              className="btn-generar btn-mayus"
              onClick={pedirGenerar}
              disabled={generando || enviado}
              aria-busy={generando}
              title={
                enviado
                  ? 'La orden ya se envió: no se vuelve a generar.'
                  : generada
                    ? 'Tocá para volver a generar con los datos actuales'
                    : undefined
              }
              style={
                generada
                  ? { backgroundColor: 'var(--green)', color: '#fff' }
                  : (errorGen || errorCorrida) && !generando
                    ? { backgroundColor: 'var(--red)', color: '#fff' }
                    : undefined
              }
            >
              {generando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Generando OP final...
                </>
              ) : generada ? (
                <>
                  <i className="fas fa-check" /> OP final generada
                </>
              ) : errorGen || errorCorrida ? (
                <>
                  <i className="fas fa-xmark" /> Error de generación
                </>
              ) : (
                <>
                  <i className="far fa-file-pdf" /> Generar OP final
                </>
              )}
            </button>

            <div className="pres-pdf">
              <button
                type="button"
                className="btn btn-out pres-pdf-btn"
                disabled={!generada}
                title={generada ? 'Abrir la OP final en otra pestaña' : 'Se habilita cuando la OP final está generada'}
                onClick={() => void verOpFinal()}
              >
                <i className="fas fa-eye" /> Ver OP Final
              </button>
            </div>
            {(errorGen || errorCorrida) && (
              <div className="pres-pdf-aviso" role="alert">
                <i className="fas fa-circle-exclamation" /> {errorGen ?? errorCorrida}
              </div>
            )}
          </div>
        </div>

        <EnviarOp
          modo="cliente"
          orden={null}
          local={local}
          listo={generada}
          avisoNoListo="Falta generar la OP final. Generala para poder enviarla"
        />
      </div>

      <PieEtapa>
        <FinalizarOperacion
          detalle={nro.trim() ? `N° ${nro.trim()} · PVC` : undefined}
          registrar={() =>
            registrarPvc({
              obra,
              borrador,
              responsableId,
              avanzar: (cambios) => dispatch({ type: 'setBorrador', cambios }),
            })
          }
        />
      </PieEtapa>

      {avisos && (
        <Modal
          title="La OP final se generó, pero con las siguientes advertencias:"
          icon={<i className="fas fa-circle-info modal-icon--info" />}
          onClose={() => setAvisos(null)}
          actions={
            <button type="button" className="btn btn-primary btn-entendido" onClick={() => setAvisos(null)}>
              Entendido
            </button>
          }
        >
          <ul className="modal-faltantes">
            {avisos.map((a) => (
              <li key={a}>
                <i className="fas fa-circle-exclamation" /> {a}
              </li>
            ))}
          </ul>
          <p className="modal-clave modal-clave--pie">
            Revisá la OP generada clickeando en el botón «Ver OP Final» antes de enviarla.
          </p>
        </Modal>
      )}

      {faltan && (
        <AvisoModal titulo="Todavía no se puede generar" faltantes={faltan} onClose={() => setFaltan(null)}>
          {null}
        </AvisoModal>
      )}

      {leyendo && (
        <ModalCargando titulo="Generando la Orden de Producción final" detalle="La IA está leyendo el documento…" />
      )}
      {armando && !guardando && (
        <ModalCargando titulo="Generando la Orden de Producción final" detalle="Armando el PDF de la orden…" />
      )}
      {guardando && (
        <ModalCargando
          titulo="Guardando la orden en el tablero"
          detalle="Se está creando la OP como «Generada Pend de Enviar», con la OP de HETMO y la OP final adjuntas."
        />
      )}
    </section>
  )
}
