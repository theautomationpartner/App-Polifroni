import { useEffect, useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { puedeDespacharAlTaller } from '@/lib/pasos'
import { fechaHora, htmlATexto } from '@/lib/texto'
import { ETIQUETA, RESPONSABLE_RECHAZO, getActividades } from '@/services/monday'
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
  /** Lo último que quedó escrito en la obra. Es donde el escenario deja el motivo del rechazo. */
  const [motivo, setMotivo] = useState<string>('')

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

  /* El motivo del rechazo no vive en una columna: el escenario lo deja como update de la obra.
     Sólo se muestra el update que HABLA del rechazo. El último update a secas no sirve: en la obra
     conviven avisos de otras automatizaciones —"⚠️Datos Faltantes"— y presentar uno de ésos bajo el
     rótulo "Motivo" sería inventarle al cliente una razón que no dio. Si no aparece ninguno, el
     cartel va igual sin él: que rechazó es lo que hay que ver. */
  useEffect(() => {
    if (!rechazada) {
      setMotivo('')
      return
    }
    let vivo = true
    void getActividades(obra.id, 8)
      .then((lista) => {
        const texto =
          lista
            .map((a) => htmlATexto(a.body).trim())
            .find((t) => t.length > 0 && /rechaz|no confirm|motivo/i.test(t)) ?? ''
        if (vivo) setMotivo(texto.slice(0, 400))
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [rechazada, obra.id])

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

          {/* El estado de la confirmación NO es un renglón más: decide si esta obra sigue o se
              frena. Por eso se muestra como un cartel que ocupa lugar y se lee de lejos, con una
              sola frase arriba y el detalle abajo. */}
          <div className="resultado">
            {confirmada && (
              <div className="veredicto veredicto--ok">
                <i className="fas fa-circle-check" />
                <div>
                  <p className="veredicto-t">El cliente confirmó la orden</p>
                  <p className="veredicto-d">Ya se puede mandar al taller.</p>
                </div>
              </div>
            )}

            {!confirmada && !rechazada && (
              <div className="veredicto veredicto--pend">
                <i className="fas fa-hourglass-half" />
                <div>
                  <p className="veredicto-t">Pendiente de confirmar</p>
                  <p className="veredicto-d">
                    El cliente todavía no contestó, así que <strong>no se puede mandar al taller</strong>.
                    Cuando confirme desde el formulario, el tablero lo registra y el botón se habilita.
                  </p>
                </div>
              </div>
            )}

            {rechazada && (
              <div className="veredicto veredicto--mal">
                <i className="fas fa-circle-xmark" />
                <div>
                  <p className="veredicto-t">El cliente NO confirmó la orden</p>
                  <p className="veredicto-d">
                    Esta obra <strong>no se manda al taller</strong>. Hay que rehacer la orden y
                    volver a enviarla
                    {responsable ? (
                      <>
                        {' '}
                        —el aviso ya le llegó a <strong>{responsable}</strong>, por ser una obra de{' '}
                        {obra.tipo.texto}—
                      </>
                    ) : null}
                    .
                  </p>
                  {motivo && (
                    <p className="veredicto-motivo">
                      <span className="veredicto-motivo-l">Motivo</span>
                      {motivo}
                    </p>
                  )}
                </div>
              </div>
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
