import { useState } from 'react'
import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { Modal } from '@/components/ui/Modal'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { accesoAlPaso } from '@/lib/pasos'
import { fechaHora, htmlATexto } from '@/lib/texto'
import { useDispatch } from '@/state/hooks'
import { puedeGenerar, requisitosOp } from './requisitos'
import { useGenerarOp } from './useGenerarOp'

/**
 * Paso 3 · Generación de la Orden de Producción final.
 *
 * La app no arma el documento: eso lo hace un escenario de Make que lee el PDF de ETMO con IA y lo
 * vuelca en la plantilla. Acá se verifica que estén los datos que ese escenario necesita, se toca
 * el timbre y se sigue la corrida mirando el tablero, que es donde queda el resultado.
 */
export function OpFinalView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()
  const { estado, correr, seguirEsperando, enCurso, noArranco } = useGenerarOp(obra)

  /* Última oportunidad de cargar observaciones. Se pregunta UNA vez al llegar —por eso el estado
     arranca con la respuesta ya calculada y no con un efecto—: quien dijo "no" en el paso anterior
     puede haber cambiado de idea, y quien dice "no" acá quiere generar sin ellas. */
  const [proponerObs, setProponerObs] = useState(
    () => obra.ordenEtmo.length > 0 && !obra.observaciones.trim(),
  )

  const requisitos = requisitosOp(obra)
  const listoParaGenerar = puedeGenerar(obra)
  const opPdf = obra.opFinal.find((a) => !a.esImagen) ?? null
  /* Al paso siguiente se pasa con la MISMA regla que usa el stepper (ver lib/pasos), para que el
     pie no deje pasar a donde la barra de etapas frena. */
  const accesoAlEnvio = accesoAlPaso('envio', obra)

  /** El cartel del visor mientras el escenario trabaja. Dice EN QUÉ va, no sólo que espere. */
  const trabajando =
    estado.fase === 'disparando'
      ? 'Avisándole a la automatización…'
      : estado.fase === 'esperando'
        ? 'Esperando que la automatización tome el pedido…'
        : estado.fase === 'trabajando'
          ? 'Generando la Orden de Producción…'
          : null

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo numero={3} titulo="Generar la Orden de Producción final" />

      <ObraFicha obra={obra} />

      <div className="paso-grid">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-robot" /> Leer documento y generar
          </div>

          {/* Los requisitos, con su estado. El que falta dice DÓNDE se arregla. */}
          <ul className="reqs">
            {requisitos.map((r) => (
              <li className={`req ${r.ok ? 'req--ok' : 'req--falta'}`} key={r.columna}>
                <i className={`fas ${r.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
                <div>
                  <div className="req-t">{r.titulo}</div>
                  <div className="req-d">{r.detalle}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="acciones-fila">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!listoParaGenerar || enCurso}
              title={listoParaGenerar ? undefined : 'Faltan datos que la automatización necesita.'}
              onClick={() => void correr()}
            >
              {enCurso ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Generando…
                </>
              ) : (
                <>
                  <i className="fas fa-file-import" /> Leer documento
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-out btn--sm"
              disabled={enCurso}
              onClick={() => void refrescar()}
            >
              <i className="fas fa-rotate" /> Refrescar desde el tablero
            </button>
            <EstadoBadge label="Estado OP final" estado={obra.estadoOpFinal} />
          </div>

          <div className="resultado">
            {estado.fase === 'esperando' && !noArranco && (
              <Aviso tono="info">Pedido enviado. Esperando que la automatización lo tome…</Aviso>
            )}
            {noArranco && (
              <Aviso tono="warn">
                El tablero todavía no se movió. El escenario no tomó el pedido: revisá que esté
                activo en Make. Sigo mirando.
              </Aviso>
            )}
            {estado.fase === 'trabajando' && (
              <Aviso tono="info">
                Generando. Cuando termine, el documento aparece solo.
              </Aviso>
            )}
            {estado.fase === 'listo' && (
              <Aviso tono="ok">Orden de Producción generada y adjunta a la obra.</Aviso>
            )}
            {estado.fase === 'demorado' && (
              <>
                <Aviso tono="warn">
                  Todavía no hay documento. La corrida sigue en Make: dejé de preguntar, no de
                  esperar.
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
            {estado.fase === 'error' && estado.problema && (
              <Aviso tono="err">{estado.problema}</Aviso>
            )}
            {estado.fase === 'error' && !estado.problema && (
              <>
                <Aviso tono="err">
                  La automatización no pudo generar la orden.
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
            <i className="fas fa-file-circle-check" /> Orden de Producción final
          </div>
          <VisorPdf
            archivo={opPdf}
            vacio="Todavía no hay una OP final generada para esta obra."
            trabajando={trabajando}
          />
        </div>
      </div>

      {proponerObs && (
        <Modal
          title="¿Generar sin observaciones?"
          icon={<i className="fas fa-circle-question modal-icon--info" />}
          onClose={() => setProponerObs(false)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-out"
                onClick={() => {
                  setProponerObs(false)
                  dispatch({ type: 'goto', paso: 'etmo' })
                }}
              >
                Cargar observaciones
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setProponerObs(false)}>
                Generar sin observaciones
              </button>
            </>
          }
        >
          Esta obra no tiene observaciones cargadas. La Orden de Producción se puede generar igual;
          si querés agregarlas, te llevamos al paso anterior.
        </Modal>
      )}

      {/* La misma regla que usa el stepper: el pie no puede dejar pasar a donde el stepper frena. */}
      <PasoNav
        siguiente="Enviar al cliente"
        bloqueado={!accesoAlEnvio.ok}
        nota={accesoAlEnvio.motivo || undefined}
      />
    </section>
  )
}
