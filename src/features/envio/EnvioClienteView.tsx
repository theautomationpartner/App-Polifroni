import { useEffect, useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { Dropdown } from '@/components/ui/Dropdown'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { ResultadoEnvio } from './ResultadoEnvio'
import { useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { accesoAlPaso } from '@/lib/pasos'
import { COL, ESTADO_OP, setEstado, sincronizarEstadoOrden } from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import { useEnviarOp } from './useEnviarOp'
import { ultimaOpFinal } from '@/features/op/ultimaOp'

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
  const { estado, correr, seguirEsperando, enCurso } = useEnviarOp(obra)
  const [cambiando, setCambiando] = useState(false)

  const opPdf = ultimaOpFinal(obra)
  const hayOp = obra.opFinal.length > 0
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

  /* Salió el mensaje: la OP del tablero de órdenes pasa a "Enviada Pend Confirmar". */
  useEffect(() => {
    if (estado.fase === 'listo') void sincronizarEstadoOrden(obra.id, ESTADO_OP.enviada)
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

  /* Lo que dice el visor mientras sale el mensaje. Sin nombrar procesos: sólo que se está enviando. */
  const trabajando = enCurso ? 'Enviando…' : null

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        titulo="Enviar OP al Cliente"
        descripcion={
          <>
            Se manda la Orden de Producción final por WhatsApp, con el enlace al formulario donde el
            cliente la confirma o la rechaza.
          </>
        }
      />


      <div className="paso-grid paso-grid--parejo">
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
            telefonos.map((t) => (
              <div className="archivo-item" key={t}>
                <i className="fab fa-whatsapp" style={{ color: '#25d366' }} />
                <span className="archivo-item-n">{t}</span>
              </div>
            ))
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
              onClick={() => void correr()}
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
            <EstadoBadge label="Estado de envío" estado={obra.estadoEnvioOp} />
            <EstadoBadge label="Mensaje al cliente" estado={obra.mjsEnviadoCliente} />
          </div>

          <ResultadoEnvio estado={estado} seguirEsperando={() => void seguirEsperando()} />
        </div>

        <div className="card">
          <div className="panel-t">
            <i className="fas fa-file-pdf" /> Documento que se envía
          </div>
          <p className="panel-d">
            Es el archivo adjunto en <strong>🤖OP Final</strong>. Si tenés que corregirlo, volvé al
            paso anterior y generalo de nuevo.
          </p>
          <VisorPdf
            archivo={opPdf}
            vacio="Todavía no hay una OP final generada para esta obra."
            trabajando={trabajando}
          />
        </div>
      </div>

      {/* Al paso 5 se entra sólo con el mensaje enviado Y la orden confirmada: es lo que habilita
          el despacho al taller, y no tiene sentido llegar antes. */}
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
