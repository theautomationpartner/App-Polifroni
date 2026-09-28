import { useEffect, useState } from 'react'
import { EstadoBadge } from '@/components/ui/Aviso'
import { VisorPdf } from '@/components/ui/VisorPdf'
import { useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { puedeDespacharAlTaller, respuestaCliente } from '@/lib/pasos'
import { htmlATexto } from '@/lib/texto'
import {
  ESTADO_OP,
  ETIQUETA,
  copiarRespuestaAOrden,
  getActividades,
  ultimaOrdenDeObra,
} from '@/services/monday'
import type { EstadoObra } from '@/types'
import { useEnviarTaller } from './useEnviarTaller'
import { ultimaOpFinal } from '@/features/op/ultimaOp'
import { ResultadoEnvio } from './ResultadoEnvio'

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
  const { estado, correr, seguirEsperando, enCurso } = useEnviarTaller(obra)
  /** Lo último que quedó escrito en la obra. Es donde el escenario deja el motivo del rechazo. */
  const [motivo, setMotivo] = useState<string>('')

  /** Si ya se releyó la obra al entrar: hasta entonces no se copia nada a la OP. */
  const [releida, setReleida] = useState(false)
  /** La última OP enviada y su estado. `undefined` mientras se lee. */
  const [op, setOp] = useState<{ id: string; estado: string } | null | undefined>(undefined)

  /* La obra en memoria puede ser de antes del envío, con la respuesta a una orden anterior: se
     relee una vez al entrar, y recién con ésa se decide qué copiar a la OP. */
  useEffect(() => {
    void refrescar()
      .catch(() => null)
      .finally(() => setReleida(true))
    // Sólo al entrar a la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Se relee la OP con cada relectura de la obra: su estado es parte de la respuesta. */
  useEffect(() => {
    let vivo = true
    void ultimaOrdenDeObra(obra.id)
      .then((u) => vivo && setOp(u ? { id: u.id, estado: u.estado } : null))
      .catch(() => vivo && setOp(null))
    return () => {
      vivo = false
    }
  }, [obra])

  const respuesta = respuestaCliente(obra, op?.estado ?? null)
  const confirmada = respuesta === 'confirmada'
  const rechazada = respuesta === 'rechazada'
  /* El cartel muestra la respuesta que se usa: si la OP ya tiene la suya, ésa, no la de la obra. */
  const etiquetaRespuesta: EstadoObra =
    op?.estado === ESTADO_OP.confirmada
      ? { texto: ETIQUETA.confirmado, color: '#00c875' }
      : op?.estado === ESTADO_OP.noConfirmada
        ? { texto: ETIQUETA.noConfirmado, color: '#df2f4a' }
        : obra.confirmacionOp
  /* A esta pantalla se entra con la OP generada, confirmada o no: es donde se mira si el cliente
     contestó. Lo que la confirmación gobierna es el DESPACHO. */
  const despacho = puedeDespacharAlTaller(respuesta)
  const yaEnTaller = obra.estadoEnvioTaller.texto === ETIQUETA.tallerEnviado
  const opPdf = ultimaOpFinal(obra)

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

  /* La respuesta del cliente se copia a la OP del tablero de órdenes —"Confirmada" o "NO
     Confirmado"— sólo si la OP la está esperando. Una OP que ya tiene respuesta no se pisa. */
  useEffect(() => {
    if (!releida || !op || respuesta === 'pendiente') return
    const etiqueta = respuesta === 'confirmada' ? ESTADO_OP.confirmada : ESTADO_OP.noConfirmada
    void copiarRespuestaAOrden(op.id, op.estado, etiqueta).then(
      (copiada) => copiada && setOp({ id: op.id, estado: etiqueta }),
    )
  }, [releida, op, respuesta])

  /* Sin botón de "consultar": mientras el cliente no contestó, la pantalla relee la obra sola cada
     15 s. Apenas confirma o rechaza desde el formulario, el cartel cambia sin tocar nada. */
  useEffect(() => {
    if (confirmada || rechazada || enCurso) return
    const cada = setInterval(() => void refrescar().catch(() => {}), 15_000)
    return () => clearInterval(cada)
  }, [confirmada, rechazada, enCurso, refrescar])

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        titulo="Envío De Orden Producción A Taller"
        descripcion={
          <>
            Con la orden confirmada por el cliente se habilita el despacho al taller.
          </>
        }
      />


      <div className="paso-grid paso-grid--parejo">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-clipboard-check" /> Respuesta del cliente
          </div>
          <div className="obs-pie" style={{ marginTop: 0 }}>
            <EstadoBadge label="Confirmación" estado={etiquetaRespuesta} />
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
                  {/* No se nombra a quién le llegó el aviso: hoy NINGUNA automatización avisa, y
                      decir que a alguien le llegó algo que no le llegó es peor que no decir nada
                      —se confía en que el tema está en manos de otro y nadie lo mira—. Cuando ese
                      aviso exista, acá vuelve el nombre. */}
                  <p className="veredicto-d">
                    Esta obra <strong>no se manda al taller</strong>. Hay que rehacer la orden y
                    volver a enviarla.
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

          <ResultadoEnvio estado={estado} seguirEsperando={() => void seguirEsperando()} />
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

      <PasoNav />
    </section>
  )
}
