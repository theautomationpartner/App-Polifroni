import { useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { Dropdown } from '@/components/ui/Dropdown'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { accesoAlPaso } from '@/lib/pasos'
import { fechaHora, htmlATexto } from '@/lib/texto'
import { COL, setEstado } from '@/services/monday'
import { useDispatch } from '@/state/hooks'
import { useEnviarOp } from './useEnviarOp'

/** Opciones de las dos columnas de status que deciden a quién y por dónde se manda la orden. */
const DESTINATARIOS = ['Cliente', 'Constructor', 'Ambos'] as const
const VIAS = ['Whatsapp', 'Email', 'Ambos'] as const

/** Los segundos como "1:05", que es como se lee una espera. */
const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

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
  const { estado, correr, seguirEsperando, enCurso, noArranco } = useEnviarOp(obra)
  const [cambiando, setCambiando] = useState(false)

  const opPdf = obra.opFinal.find((a) => !a.esImagen) ?? null
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
  const accesoALaConfirmacion = accesoAlPaso('confirmacion', obra)

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

  const trabajando =
    estado.fase === 'disparando'
      ? 'Avisándole a la automatización…'
      : estado.fase === 'esperando'
        ? `Esperando que la automatización tome el pedido… ${reloj(estado.segundos)}`
        : estado.fase === 'trabajando'
          ? `Enviando el mensaje por WhatsApp… ${reloj(estado.segundos)}`
          : null

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        numero={4}
        titulo="Enviar la OP al cliente"
        descripcion={
          <>
            Se manda la Orden de Producción final por WhatsApp, con el enlace al formulario donde el
            cliente la confirma o la rechaza.
          </>
        }
      />

      <ObraFicha obra={obra} />

      <div className="paso-grid">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-paper-plane" /> Envío del documento
          </div>
          <p className="panel-d">
            El destinatario y la vía se guardan en el tablero, que es de donde los lee el escenario.
          </p>

          <div className="obra-vinculos" style={{ marginTop: 0 }}>
            <div className="vinculo">
              <span className="vinculo-ic">
                <i className="fas fa-user-check" />
              </span>
              <div>
                <div className="vinculo-l">
                  Orden de producción a
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
              <span className="vinculo-ic">
                <i className="fab fa-whatsapp" />
              </span>
              <div>
                <div className="vinculo-l">
                  Enviar por
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
              onClick={() => void correr()}
            >
              {enCurso ? (
                <>
                  <i className="fas fa-circle-notch spin" /> {reloj(estado.segundos)}
                </>
              ) : (
                <>
                  <i className="fab fa-whatsapp" /> Enviar OP por WhatsApp
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-out btn--sm"
              disabled={enCurso}
              onClick={() => void refrescar()}
            >
              <i className="fas fa-rotate" /> Refrescar estado
            </button>
          </div>

          <div className="obs-pie">
            <EstadoBadge label="Estado de envío" estado={obra.estadoEnvioOp} />
            <EstadoBadge label="Mensaje al cliente" estado={obra.mjsEnviadoCliente} />
          </div>

          <div className="resultado">
            {estado.fase === 'esperando' && !noArranco && (
              <Aviso tono="info">Pedido enviado. Esperando que la automatización lo tome…</Aviso>
            )}
            {noArranco && (
              <Aviso tono="warn">
                Pasaron {reloj(estado.segundos)} y el tablero no registró ningún movimiento del
                envío. El escenario no tomó el pedido: revisá que esté activo en Make. Sigo mirando.
              </Aviso>
            )}
            {estado.fase === 'trabajando' && (
              <Aviso tono="info">
                Mandando el mensaje ({reloj(estado.segundos)}). Podés dejar la pantalla abierta:
                cuando termine, el estado cambia solo.
              </Aviso>
            )}
            {estado.fase === 'listo' && (
              <Aviso tono="ok">
                Mensaje enviado en {reloj(estado.segundos)}. El cliente recibe la OP final y el
                enlace al formulario para confirmar o rechazar.
                <span className="origen">
                  {' '}
                  · lo avisó {estado.origen === 'respuesta' ? 'el escenario' : 'el tablero'}
                </span>
              </Aviso>
            )}
            {estado.fase === 'demorado' && (
              <>
                <Aviso tono="warn">
                  Pasaron 5 minutos y el tablero todavía no confirma el envío. La corrida sigue en
                  Make: dejé de preguntar, no de esperar.
                </Aviso>
                <div className="acciones-fila">
                  <button
                    type="button"
                    className="btn btn-out btn--sm"
                    onClick={() => void seguirEsperando()}
                  >
                    <i className="fas fa-hourglass-half" /> Seguir esperando
                  </button>
                </div>
              </>
            )}
            {estado.fase === 'error' && estado.problema && <Aviso tono="err">{estado.problema}</Aviso>}
            {estado.fase === 'error' && !estado.problema && (
              <>
                <Aviso tono="err">
                  El escenario no pudo enviar el mensaje.
                  {estado.updateError ? ' Esto es lo que informó:' : ' No dejó ningún detalle.'}
                </Aviso>
                {estado.updateError && (
                  <article className="update-corrida">
                    <div className="hist-cab">
                      <span className="hist-autor">{estado.updateError.autor}</span>
                      <span className="hist-fecha">{fechaHora(estado.updateError.fecha)}</span>
                    </div>
                    <p className="hist-txt" style={{ whiteSpace: 'pre-wrap' }}>
                      {htmlATexto(estado.updateError.body)}
                    </p>
                  </article>
                )}
              </>
            )}
          </div>
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
        nota={
          accesoALaConfirmacion.motivo ||
          'El cliente confirma o rechaza desde el formulario que le llega en el mensaje.'
        }
      />
    </section>
  )
}
