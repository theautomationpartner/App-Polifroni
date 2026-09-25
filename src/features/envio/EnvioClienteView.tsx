import { useEffect, useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { Dropdown } from '@/components/ui/Dropdown'
import { ResultadoEnvio } from './ResultadoEnvio'
import { useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { accesoAlPaso } from '@/lib/pasos'
import {
  ACTIVIDAD,
  COL,
  COLOR_ENVIO_OP,
  crearActividad,
  guardarLinkOrden,
  html,
  ESTADO_ENVIO_OP,
  ESTADO_OP,
  setEstado,
  setEstadoEnvioOrden,
  sincronizarEstadoOrden,
  ultimaOrdenEmitida,
  type ResumenOrden,
} from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import { destinosDe, useEnviarOp } from './useEnviarOp'
import { DocumentoOrden } from './DocumentoOrden'
import { MensajeEjemplo } from './MensajeEjemplo'

/** Opciones de las dos columnas de status que deciden a quién y por dónde se manda la orden. */
const DESTINATARIOS = ['Cliente', 'Constructor', 'Ambos'] as const
const VIAS = ['Whatsapp', 'Email', 'Ambos'] as const

/**
 * Paso 4 · Envío de la OP final al cliente.
 *
 * El escenario de Make manda el documento por WhatsApp junto con el enlace al formulario donde el
 * cliente confirma o rechaza. La app elige destinatario y vía —dos columnas del tablero—, toca el
 * timbre y se queda esperando, igual que en la generación: con el reloj a la vista y mirando el
 * tablero hasta que el estado del envío CAMBIE.
 */
export function EnvioClienteView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()
  const { estado, correr, seguirEsperando, enCurso, esperarRespuesta } = useEnviarOp(obra)
  const [cambiando, setCambiando] = useState(false)
  const [verMensaje, setVerMensaje] = useState(false)

  /* La orden que se manda: la ÚLTIMA OP EMITIDA de la obra, con su OP final. El documento vive en
     la OP del tablero de órdenes, no en la obra. */
  const [orden, setOrden] = useState<ResumenOrden | null>(null)
  const [cargandoOrden, setCargandoOrden] = useState(true)
  const idsOrdenes = obra.ordenesIds.join(',')
  useEffect(() => {
    let vivo = true
    setCargandoOrden(true)
    ultimaOrdenEmitida(obra.ordenesIds)
      .then((o) => vivo && setOrden(o))
      .catch(() => vivo && setOrden(null))
      .finally(() => vivo && setCargandoOrden(false))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsOrdenes])
  const hayOp = !!orden
  const destinatario = obra.opDestinatario.texto
  const via = obra.opVia.texto
  /* A quién le llega el mensaje según el destinatario elegido: es el dato que hay que mirar ANTES
     de mandar, porque el número sale de la cuenta corriente o del arquitecto, no de la obra. */
  const telefonos = [
    destinatario !== 'Constructor' && obra.celCliente ? `Cliente: ${obra.celCliente}` : '',
    destinatario !== 'Cliente' && obra.celArquitecto ? `Constructor: ${obra.celArquitecto}` : '',
  ].filter(Boolean)
  const sinTelefono = telefonos.length === 0
  const puedeEnviar = hayOp && !!destinatario && !sinTelefono && !enCurso
  /* Por qué no se puede mandar. Son las mismas condiciones que el escenario valida por su cuenta:
     sin ellas corta en su filtro, deja la obra en "Error de Envío" y no manda nada. Dicho en el
     botón, se entiende sin tener que leer los carteles de arriba. */
  const motivoSinEnvio = !hayOp
    ? 'Falta la OP final adjunta.'
    : !destinatario
      ? 'Elegí a quién se le manda la orden.'
      : sinTelefono
        ? 'El destinatario elegido no tiene celular de WhatsApp cargado en el tablero.'
        : ''
  /* Recién enviada, el paso siguiente se abre aunque la relectura de la obra todavía no haya traído
     el "Enviado" del tablero: la respuesta del envío ya lo confirmó. */
  const accesoALaConfirmacion =
    estado.fase === 'listo' ? { ok: true, motivo: '' } : accesoAlPaso('confirmacion', obra)

  /** Mueve el estado de envío de la OP en el tablero y en la pantalla. */
  const marcarEnvio = (etiqueta: string) => {
    if (!orden) return
    setOrden((o) => (o ? { ...o, estadoEnvio: etiqueta } : o))
    void setEstadoEnvioOrden(orden.id, etiqueta).catch((e) =>
      console.warn('[envio] no se pudo actualizar el estado de envío de la OP', e),
    )
  }

  /* "Enviando..." al tocar el botón; "Enviada" cuando el envío termina bien (y la OP pasa a
     "Enviada Pend Confirmar"); "Error De Envio" si falla. */
  const enviar = () => {
    marcarEnvio(ESTADO_ENVIO_OP.enviando)
    void correr({ ordenId: orden?.id ?? null })
  }
  /**
   * La actividad "OP Enviada" en la línea de tiempo de la obra, con todo lo del envío: cuándo, qué
   * orden, a quién (nombre y teléfono), la medición y el link al PDF que devuelve el escenario.
   */
  const registrarEnvio = async () => {
    const cuerpo = await esperarRespuesta(15_000)
    const link = String(cuerpo?.linkPdf ?? cuerpo?.shareLink ?? cuerpo?.webContentLink ?? '').trim()
    /* El mismo link queda en la OP (columna "Ver Orden De Produccion"). */
    if (link && orden) {
      void guardarLinkOrden(orden.id, link).catch((e) =>
        console.warn('[envio] no se pudo guardar el link del PDF en la OP', e),
      )
    }
    const destinos = destinosDe(obra)
    const ahora = new Date()
    const cuando = `${ahora.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} - ${ahora.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs`
    const fechaMed = orden?.fechaMedicion ? orden.fechaMedicion.split('-').reverse().join('/') : ''
    const renglon = (titulo: string, valor: string) =>
      `<p><b>${titulo}:</b> ${valor ? html(valor) : '—'}</p>`
    /* Cada dato con su TÍTULO, el mismo de la columna del tablero Orden de Produccion: nada suelto
       que haya que adivinar a qué se refiere. */
    const esAluminio = /alum/i.test(orden?.tipo ?? '')
    const contenido = [
      renglon('Fecha De Envío', cuando),
      renglon(esAluminio ? 'N° OP Aluminio' : 'N° OP PVC', orden?.numero ?? ''),
      renglon('N° OP HETMO', orden?.nOpHetmo ?? ''),
      renglon('Tipo', orden?.tipo ?? ''),
      ...destinos.map(
        (d) =>
          `<p><b>Enviada A ${html(d.tipo)}:</b> ${html(d.nombre || '—')} — <b>Teléfono:</b> ${html(d.whatsapp || 'sin teléfono')}</p>`,
      ),
      renglon('Medido Por', orden?.medidoPor ?? ''),
      renglon('Fecha De Medición', fechaMed),
      renglon('Observación', orden?.observacion ?? ''),
      link
        ? `<p><b>Link PDF:</b> <a href="${html(link)}">${html(link)}</a></p>`
        : renglon('Link PDF', ''),
    ].join('')
    await crearActividad({
      itemId: obra.id,
      actividadId: ACTIVIDAD.opEnviada,
      titulo: 'OP Enviada',
      resumen: `Enviada a ${destinos.map((d) => `${d.tipo} ${d.nombre}`.trim()).join(' y ')}`,
      contenido,
      url: link || undefined,
      telefono: destinos[0]?.whatsapp || undefined,
      cuando: ahora,
    }).catch((e) => console.warn('[envio] no se pudo crear la actividad OP Enviada', e))
  }

  useEffect(() => {
    if (estado.fase === 'listo') {
      marcarEnvio(ESTADO_ENVIO_OP.enviada)
      void sincronizarEstadoOrden(obra.id, ESTADO_OP.enviada)
      void registrarEnvio()
    } else if (estado.fase === 'error') {
      marcarEnvio(ESTADO_ENVIO_OP.error)
    }
    // `marcarEnvio` usa la orden del render: sólo importa el cambio de fase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.fase, obra.id])

  const cambiarColumna = async (columna: string, etiqueta: string) => {
    setCambiando(true)
    try {
      await setEstado(obra.id, columna, etiqueta)
      await refrescar()
    } catch {
      dispatch({ type: 'errorMonday', accion: 'cambiar la configuración del envío' })
    } finally {
      setCambiando(false)
    }
  }


  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        titulo="Enviar Orden De Producción"
        descripcion={
          <>
            Se manda la Orden de Producción final por WhatsApp, con el enlace al formulario donde el
            cliente la confirma o la rechaza.
          </>
        }
      />


      <div className="paso-grid paso-grid--parejo paso-grid--envio">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-paper-plane" /> Envío del documento
          </div>
          <div className="obra-vinculos envio-dest">
            <div className="vinculo">
              <div>
                <div className="vinculo-l">
                  <i className="fas fa-user-check" /> Orden de producción a
                </div>
                <Dropdown<string>
                  label={
                    destinatario ? (
                      <span className="selbox-val">
                        <span className="selbox-val-txt">{destinatario}</span>
                      </span>
                    ) : (
                      <span className="selbox-ph">Seleccionar...</span>
                    )
                  }
                  items={DESTINATARIOS as readonly string[]}
                  esElegido={(d) => d === destinatario}
                  itemKey={(d) => d}
                  renderItem={(d) => d}
                  disabled={cambiando || enCurso}
                  onSelect={(d) => void cambiarColumna(COL.opDestinatario, d)}
                />
              </div>
            </div>

            <div className="vinculo">
              <div>
                <div className="vinculo-l">
                  <i className="fab fa-whatsapp" /> Enviar por
                </div>
                <Dropdown<string>
                  label={
                    via ? (
                      <span className="selbox-val">
                        <span className="selbox-val-txt">{via}</span>
                      </span>
                    ) : (
                      <span className="selbox-ph">Seleccionar...</span>
                    )
                  }
                  items={VIAS as readonly string[]}
                  esElegido={(v) => v === via}
                  itemKey={(v) => v}
                  renderItem={(v) => v}
                  disabled={cambiando || enCurso}
                  onSelect={(v) => void cambiarColumna(COL.opVia, v)}
                />
              </div>
            </div>
          </div>

          <div className="panel-sep" />

          <span className="campo-l">Destinos del mensaje</span>
          {sinTelefono ? (
            <Aviso tono="warn">
              No hay un celular de WhatsApp para el destinatario elegido. Se toma de la cuenta
              corriente del cliente y del constructor/arquitecto vinculados a la obra.
            </Aviso>
          ) : (
            <div className="envio-destinos">
              {telefonos.map((t) => (
                <div className="archivo-item" key={t}>
                  <i className="fab fa-whatsapp" style={{ color: '#25d366' }} />
                  <span className="archivo-item-n">{t}</span>
                </div>
              ))}
            </div>
          )}

          {!hayOp && (
            <div style={{ marginTop: 12 }}>
              <Aviso tono="warn">
                Todavía no hay una OP final adjunta: generala en el paso anterior antes de enviarla.
              </Aviso>
            </div>
          )}

          <div className="acciones-fila">
            <button
              type="button"
              className="btn btn-green"
              disabled={!puedeEnviar}
              title={motivoSinEnvio || undefined}
              onClick={enviar}
            >
              {enCurso ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Enviando…
                </>
              ) : (
                <>
                  <i className="fab fa-whatsapp" /> Enviar OP por WhatsApp
                </>
              )}
            </button>
          </div>

          {/* Los dos estados juntos: son la misma respuesta —¿salió el mensaje?— vista desde dos
              columnas. Separados a los extremos se leían como dos datos sin relación. */}
          <div className="envio-estados">
            <EstadoBadge
              label="Estado de envío"
              estado={{
                texto: orden?.estadoEnvio ?? '',
                color: COLOR_ENVIO_OP[orden?.estadoEnvio ?? ''] ?? '',
              }}
              vacio="Sin enviar"
              pendiente
            />
            {/* En lugar de una etiqueta "sin definir" que no decía nada: ver QUÉ mensaje le va a
                llegar a quien recibe la orden, antes de mandarlo. */}
            <button type="button" className="btn-mensaje" onClick={() => setVerMensaje(true)}>
              <i className="far fa-comment-dots" /> Ver mensaje
            </button>
          </div>

          <ResultadoEnvio estado={estado} seguirEsperando={() => void seguirEsperando()} />
        </div>

        <div className="card">
          <div className="panel-t">
            <i className="fas fa-file-pdf" /> Documento que se envía
          </div>
          <p className="panel-d">
            La OP final de la orden emitida. Si tenés que corregirla, volvé al paso anterior y
            generala de nuevo.
          </p>
          <DocumentoOrden orden={orden} cargando={cargandoOrden} />
        </div>
      </div>

      {/* Al paso 5 se entra sólo con el mensaje enviado Y la orden confirmada: es lo que habilita
          el despacho al taller, y no tiene sentido llegar antes. */}
      {verMensaje && (
        <MensajeEjemplo destinatario={destinatario} onClose={() => setVerMensaje(false)} />
      )}

      <PasoNav
        siguiente="Ver confirmación del cliente"
        bloqueado={!accesoALaConfirmacion.ok}
        /* Sin nota cuando se puede pasar: explicar que el cliente contesta por el formulario no
           cambia nada de lo que hay que hacer acá, y ocupa el renglón donde está el botón. */
        nota={accesoALaConfirmacion.motivo || undefined}
      />
    </section>
  )
}
