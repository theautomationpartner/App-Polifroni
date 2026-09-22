import { useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { puedeDespacharAlTaller } from '@/lib/pasos'
import { fechaHora, htmlATexto } from '@/lib/texto'
import { ETIQUETA, RESPONSABLE_RECHAZO } from '@/services/monday'
import { useEnviarTaller } from './useEnviarTaller'

/**
 * Paso 5 · Confirmación del cliente y despacho al taller.
 *
 * Se entra con la OP final generada, esté confirmada o no: ésta es la pantalla donde se mira si el
 * cliente contestó, y cerrarla mientras se espera dejaría sin ningún lugar donde verlo. La
 * confirmación NO se decide en la app —la carga el cliente desde el formulario y el escenario la
 * escribe en el tablero—; acá se muestra y, sobre ella, se habilita el despacho al taller.
 */
export function ConfirmacionView() {
  const obra = useObra()
  const refrescar = useRefrescarObra()
  const { estado, correr, seguirEsperando, enCurso, noArranco } = useEnviarTaller(obra)
  const [refrescando, setRefrescando] = useState(false)

  const confirmacion = obra.confirmacionOp.texto
  const confirmada = confirmacion === ETIQUETA.confirmado
  const rechazada = confirmacion === ETIQUETA.noConfirmado
  /* A esta pantalla se entra con la OP generada, confirmada o no: es donde se mira si el cliente
     contestó. Lo que la confirmación gobierna es el DESPACHO. */
  const despacho = puedeDespacharAlTaller(obra)
  const yaEnTaller = obra.estadoEnvioTaller.texto === ETIQUETA.tallerEnviado
  const opPdf = obra.opFinal.find((a) => !a.esImagen) ?? null
  /* Ante un rechazo, el escenario menciona a quien sigue el material de la obra. Se anticipa acá
     para que quien está mirando la pantalla sepa a quién le llegó el aviso. */
  const responsable = RESPONSABLE_RECHAZO[obra.tipo.texto] ?? null

  const actualizar = async () => {
    setRefrescando(true)
    try {
      await refrescar()
    } finally {
      setRefrescando(false)
    }
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        numero={5}
        titulo="Confirmación del cliente y taller"
        descripcion={
          <>
            Con la orden confirmada por el cliente se habilita el despacho al taller.
          </>
        }
      />


      <div className="paso-grid">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-clipboard-check" /> Respuesta del cliente
          </div>
          <p className="panel-d">
            Lo que el cliente marcó en el formulario queda en la columna{' '}
            <strong>Confirmacion de la Op</strong>. Esta pantalla la lee del tablero: no se completa
            a mano.
          </p>

          <div className="obs-pie" style={{ marginTop: 0 }}>
            <EstadoBadge label="Confirmación" estado={obra.confirmacionOp} />
            <button
              type="button"
              className="btn btn-out btn--sm"
              disabled={refrescando || enCurso}
              onClick={() => void actualizar()}
            >
              {refrescando ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Consultando…
                </>
              ) : (
                <>
                  <i className="fas fa-rotate" /> Consultar respuesta
                </>
              )}
            </button>
          </div>

          <div className="resultado">
            {confirmada && (
              <Aviso tono="ok">
                El cliente confirmó la Orden de Producción. Ya se puede mandar al taller.
              </Aviso>
            )}
            {!confirmada && !rechazada && (
              <Aviso tono="info">
                Todavía no contestó. Cuando confirme desde el formulario, el tablero lo registra y
                se habilita el envío al taller.
              </Aviso>
            )}
            {rechazada && (
              <Aviso tono="err">
                El cliente rechazó la orden. El motivo que cargó queda en el registro de la obra
                {responsable ? (
                  <>
                    , con la mención automática a <strong>{responsable}</strong> por ser una obra de{' '}
                    {obra.tipo.texto}
                  </>
                ) : null}
                .
              </Aviso>
            )}
          </div>

          <div className="panel-sep" />

          <div className="panel-t">
            <i className="fas fa-screwdriver-wrench" /> Despacho al taller
          </div>
          <p className="panel-d">
            Se dispara el escenario con el id de esta obra. La app no toca ninguna columna: el estado
            lo escribe el escenario, que es el que sabe si el mensaje salió.
          </p>

          <div className="obs-pie" style={{ marginTop: 0, marginBottom: 12 }}>
            <EstadoBadge label="Envío al taller" estado={obra.estadoEnvioTaller} />
          </div>

          <div className="acciones-fila">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!despacho.ok || enCurso}
              title={despacho.motivo || undefined}
              onClick={() => void correr()}
            >
              {enCurso ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Enviando…
                </>
              ) : (
                <>
                  <i className="fas fa-industry" /> Enviar OP al taller
                </>
              )}
            </button>
            {yaEnTaller && !enCurso && (
              <span className="obs-estado obs-estado--ok">
                <i className="fas fa-circle-check" /> Ya enviada al taller
              </span>
            )}
          </div>

          <div className="resultado">
            {estado.fase === 'esperando' && !noArranco && (
              <Aviso tono="info">Pedido enviado. Esperando que la automatización lo tome…</Aviso>
            )}
            {noArranco && (
              <Aviso tono="warn">
                El tablero todavía no registró ningún movimiento del
                envío al taller. El escenario no tomó el pedido: revisá que esté activo en Make.
                Sigo mirando.
              </Aviso>
            )}
            {estado.fase === 'trabajando' && (
              <Aviso tono="info">
                Mandando la orden al taller. Podés dejar la pantalla
                abierta: cuando termine, el estado cambia solo.
              </Aviso>
            )}
            {estado.fase === 'listo' && (
              <Aviso tono="ok">
                La orden salió al taller de fabricación.
                <span className="origen">
                  {' '}
                  · lo avisó {estado.origen === 'respuesta' ? 'el escenario' : 'el tablero'}
                </span>
              </Aviso>
            )}
            {estado.fase === 'demorado' && (
              <>
                <Aviso tono="warn">
                  El tablero todavía no confirma el envío. La corrida sigue en Make: dejé de
                  preguntar, no de esperar.
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
                  El escenario no pudo mandar la orden al taller.
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
            <i className="fas fa-file-pdf" /> La orden que sale al taller
          </div>
          <p className="panel-d">
            Es el mismo documento que confirmó el cliente, y el que va a fabricarse.
          </p>
          <VisorPdf archivo={opPdf} vacio="Esta obra todavía no tiene una OP final generada." />
        </div>
      </div>

      <PasoNav nota="Este es el último paso del proceso de Orden de Producción." />
    </section>
  )
}
