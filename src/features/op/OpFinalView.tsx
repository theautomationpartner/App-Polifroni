import { Aviso, EstadoBadge } from '@/components/ui/Aviso'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { fechaHora, htmlATexto } from '@/lib/texto'
import { COL, ETIQUETA } from '@/services/monday'
import { puedeGenerar, requisitosOp } from './requisitos'
import { useGenerarOp } from './useGenerarOp'

/** Los segundos como "1:05", que es como se lee una espera. */
const reloj = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Paso 3 · Generación de la Orden de Producción final.
 *
 * La app no arma el documento: eso lo hace un escenario de Make que lee el PDF de ETMO con IA y lo
 * vuelca en la plantilla. Acá se verifica que estén los datos que ese escenario necesita, se toca
 * el timbre y se sigue la corrida mirando el tablero, que es donde queda el resultado.
 */
export function OpFinalView() {
  const obra = useObra()
  const refrescar = useRefrescarObra()
  const { estado, generar, seguirEsperando, enCurso, noArranco } = useGenerarOp(obra)

  const requisitos = requisitosOp(obra)
  const listoParaGenerar = puedeGenerar(obra)
  const opPdf = obra.opFinal.find((a) => !a.esImagen) ?? null
  const generado = obra.estadoOpFinal.texto === ETIQUETA.opGenerado && obra.opFinal.length > 0

  /** El cartel del visor mientras el escenario trabaja. Dice EN QUÉ va, no sólo que espere. */
  const trabajando =
    estado.fase === 'disparando'
      ? 'Avisándole a la automatización…'
      : estado.fase === 'esperando'
        ? `Esperando que la automatización tome el pedido… ${reloj(estado.segundos)}`
        : estado.fase === 'generando'
          ? `Generando la Orden de Producción… ${reloj(estado.segundos)}`
          : null

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        numero={3}
        titulo="Generar la Orden de Producción final"
        descripcion={
          <>
            La automatización lee el PDF de ETMO, estructura los datos y arma la OP final con las
            observaciones cargadas. El documento queda adjunto a la obra.
          </>
        }
      />

      <ObraFicha obra={obra} />

      <div className="paso-grid">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-robot" /> Leer documento y generar
          </div>
          <p className="panel-d">
            Antes de disparar se verifica lo mismo que necesita el escenario. Si falta algo, se
            corrige en el paso anterior y no se gasta una corrida.
          </p>

          {/* Los requisitos, con su estado. El que falta dice DÓNDE se arregla. */}
          <ul className="reqs">
            {requisitos.map((r) => (
              <li className={`req ${r.ok ? 'req--ok' : 'req--falta'}`} key={r.columna}>
                <i className={`fas ${r.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} />
                <div>
                  <div className="req-t">
                    {r.titulo}
                    <span className="campo-col">{r.columna}</span>
                  </div>
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
              onClick={() => void generar()}
            >
              {enCurso ? (
                <>
                  <i className="fas fa-circle-notch spin" /> {reloj(estado.segundos)}
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
                Pasaron {reloj(estado.segundos)} y el tablero todavía no pasó a{' '}
                <strong>Generando</strong>. El escenario no tomó el pedido: revisá que esté activo
                en Make. Sigo mirando por las dudas.
              </Aviso>
            )}
            {estado.fase === 'generando' && (
              <Aviso tono="info">
                La automatización está trabajando ({reloj(estado.segundos)}). Podés dejar la pantalla
                abierta: cuando termine, el documento aparece solo.
              </Aviso>
            )}
            {estado.fase === 'listo' && (
              <Aviso tono="ok">
                Orden de Producción final generada y adjunta a la obra en {reloj(estado.segundos)}.
              </Aviso>
            )}
            {estado.fase === 'demorado' && (
              <>
                <Aviso tono="warn">
                  Pasaron 5 minutos y todavía no hay documento. La corrida sigue en Make: dejé de
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

          <div className="panel-sep" />
          <span className="campo-l">
            Observaciones que se vuelcan en la orden
            <span className="campo-col">{COL.observaciones}</span>
          </span>
          <div
            className={`dato-v ${obra.observaciones ? '' : 'dato-v--vacio'}`}
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {obra.observaciones || 'Sin observaciones cargadas.'}
          </div>
        </div>

        <div className="card">
          <div className="panel-t">
            <i className="fas fa-file-circle-check" /> Orden de Producción final
          </div>
          <p className="panel-d">
            El documento que se le va a mandar al cliente. Si no es el correcto, corregí las
            observaciones y volvé a generarlo.
          </p>
          <VisorPdf
            archivo={opPdf}
            vacio="Todavía no hay una OP final generada para esta obra."
            trabajando={trabajando}
          />
        </div>
      </div>

      <PasoNav
        siguiente="Enviar al cliente"
        bloqueado={!generado}
        nota={
          generado
            ? undefined
            : 'La OP final tiene que estar generada y adjunta para poder mandarla al cliente.'
        }
      />
    </section>
  )
}
