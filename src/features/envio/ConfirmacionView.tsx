import { useEffect, useState } from 'react'
import { EstadoBadge } from '@/components/ui/Aviso'
import { Dropdown } from '@/components/ui/Dropdown'
import { useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { respuestaCliente, type RespuestaCliente } from '@/lib/pasos'
import { htmlATexto } from '@/lib/texto'
import {
  COLOR_ESTADO_OP,
  ESTADO_OP,
  ETIQUETA,
  copiarRespuestaAOrden,
  getActividades,
  ordenesEmitidas,
  type ResumenOrden,
} from '@/services/monday'
import type { EstadoObra } from '@/types'
import { DocumentoOrden, DocumentoOrdenVacio } from './DocumentoOrden'
import { useEnviarTaller } from './useEnviarTaller'
import { ResultadoEnvio } from './ResultadoEnvio'

/** En qué está la OP elegida, visto desde el despacho al taller. */
type Situacion = 'sinElegir' | 'sinEnviar' | RespuestaCliente

const SIN_DATO: EstadoObra = { texto: '', color: '' }
/** Sin OP elegida no hay valor que dar: una raya, que se lee como "acá va a ir algo". */
const RAYA = '—'

/** La etiqueta "Confirmación" de cada situación: sin OP elegida, "sin definir". */
const ETIQUETA_SITUACION: Record<Situacion, EstadoObra> = {
  sinElegir: SIN_DATO,
  sinEnviar: { texto: 'Sin enviar al cliente', color: '#c4c4c4' },
  pendiente: { texto: ETIQUETA.pendConfirmar, color: '#fdab3d' },
  confirmada: { texto: ETIQUETA.confirmado, color: '#00c875' },
  rechazada: { texto: ETIQUETA.noConfirmado, color: '#df2f4a' },
}

/** "IDOP-025 · N° A3003": cómo se nombra una OP en el selector. */
const nombreOrden = (o: ResumenOrden) =>
  [o.idOp || 'OP', o.numero ? `N° ${o.numero}` : ''].filter(Boolean).join(' · ')

/**
 * Paso 5 · Confirmación del cliente y despacho al taller.
 *
 * Se entra con la OP final generada, esté confirmada o no: ésta es la pantalla donde se mira si el
 * cliente contestó, y cerrarla mientras se espera dejaría sin ningún lugar donde verlo. La
 * confirmación NO se decide en la app —la carga el cliente desde el formulario y el escenario la
 * escribe en el tablero—; acá se muestra.
 *
 * Al taller se manda UNA orden de producción, elegida de las que tiene la obra: el botón aparece
 * recién con una elegida que esté "Confirmada", y el escenario recibe el id de esa OP.
 */
export function ConfirmacionView() {
  const obra = useObra()
  const refrescar = useRefrescarObra()
  const { estado, correr, seguirEsperando, enCurso } = useEnviarTaller(obra)
  /** Lo último que quedó escrito en la obra. Es donde el escenario deja el motivo del rechazo. */
  const [motivo, setMotivo] = useState<string>('')

  /** Si ya se releyó la obra al entrar: hasta entonces no se copia nada a la OP. */
  const [releida, setReleida] = useState(false)
  /** Las OP emitidas de la obra, de la más nueva a la más vieja. `undefined` mientras se leen. */
  const [ordenes, setOrdenes] = useState<ResumenOrden[] | undefined>(undefined)
  /** La OP elegida para mandar al taller. */
  const [elegidaId, setElegidaId] = useState<string | null>(null)
  const elegida = ordenes?.find((o) => o.id === elegidaId) ?? null
  /** La última OP emitida: la que espera la respuesta del cliente. */
  const op = ordenes?.[0] ?? null

  /* La obra en memoria puede ser de antes del envío, con la respuesta a una orden anterior: se
     relee una vez al entrar, y recién con ésa se decide qué copiar a la OP. */
  useEffect(() => {
    void refrescar()
      .catch(() => null)
      .finally(() => setReleida(true))
    // Sólo al entrar a la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Se releen las OP con cada relectura de la obra: su estado es parte de la respuesta. */
  useEffect(() => {
    let vivo = true
    void ordenesEmitidas(obra.ordenesIds)
      .then((lista) => vivo && setOrdenes(lista))
      .catch(() => vivo && setOrdenes((previas) => previas ?? []))
    return () => {
      vivo = false
    }
  }, [obra])

  /* La respuesta a la ÚLTIMA OP: es la que se copia de la obra a la OP y la que decide si hace falta
     seguir mirando el tablero. No es lo que se muestra: eso depende de la OP elegida. */
  const respuestaUltima = respuestaCliente(obra, op?.estado ?? null)

  /* Todo lo que la pantalla dice es de la OP ELEGIDA. Sin una elegida no hay respuesta que mostrar:
     la obra puede tener varias órdenes, cada una con la suya. */
  const esUltima = !!elegida && elegida.id === op?.id
  const situacion: Situacion = !elegida
    ? 'sinElegir'
    : elegida.estado === ESTADO_OP.confirmada
      ? 'confirmada'
      : elegida.estado === ESTADO_OP.noConfirmada
        ? 'rechazada'
        : elegida.estado === ESTADO_OP.enviada
          ? /* La última OP puede tener la respuesta en la obra antes de que se copie a la OP. */
            esUltima
            ? respuestaUltima
            : 'pendiente'
          : 'sinEnviar'
  const rechazada = situacion === 'rechazada'
  const etiquetaRespuesta: EstadoObra = ETIQUETA_SITUACION[situacion]
  /* Al taller sólo sale una OP que el cliente APROBÓ: sin una elegida y confirmada, no hay botón. */
  const puedeDespachar = situacion === 'confirmada'
  /* El estado del envío al taller vive en la obra, no en cada OP: sólo se puede atribuir a la
     última. De una orden anterior no se sabe, y se dice "sin definir". */
  const envioTaller: EstadoObra = esUltima ? obra.estadoEnvioTaller : SIN_DATO
  const yaEnTaller = esUltima && obra.estadoEnvioTaller.texto === ETIQUETA.tallerEnviado

  const despachar = () => {
    if (!elegida) return
    const pdf = elegida.opFinal.find((a) => !a.esImagen) ?? elegida.opFinal[0]
    void correr({
      ordenId: elegida.id,
      idOp: elegida.idOp,
      numero: elegida.numero,
      assetId: pdf?.assetId ?? null,
      fileName: pdf?.nombre ?? null,
    })
  }

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
    if (!releida || !op || respuestaUltima === 'pendiente') return
    const etiqueta = respuestaUltima === 'confirmada' ? ESTADO_OP.confirmada : ESTADO_OP.noConfirmada
    void copiarRespuestaAOrden(op.id, op.estado, etiqueta).then(
      (copiada) =>
        copiada &&
        setOrdenes((lista) => lista?.map((o) => (o.id === op.id ? { ...o, estado: etiqueta } : o))),
    )
  }, [releida, op, respuestaUltima])

  /* Sin botón de "consultar": mientras el cliente no contestó, la pantalla relee la obra sola cada
     15 s. Apenas confirma o rechaza desde el formulario, el cartel cambia sin tocar nada. */
  useEffect(() => {
    if (respuestaUltima !== 'pendiente' || enCurso) return
    const cada = setInterval(() => void refrescar().catch(() => {}), 15_000)
    return () => clearInterval(cada)
  }, [respuestaUltima, enCurso, refrescar])

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


      <div className="paso-grid paso-grid--parejo paso-grid--taller">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-clipboard-check" /> Respuesta del cliente
          </div>
          <div className="obs-pie" style={{ marginTop: 0 }}>
            <EstadoBadge
              label="Confirmación"
              estado={etiquetaRespuesta}
              vacio={situacion === 'sinElegir' ? RAYA : undefined}
            />
          </div>

          {/* El estado de la confirmación NO es un renglón más: decide si esta obra sigue o se
              frena. Por eso se muestra como un cartel que ocupa lugar y se lee de lejos, con una
              sola frase arriba y el detalle abajo. */}
          <div className="resultado" key={elegidaId ?? 'nada'}>
            {situacion === 'sinEnviar' && (
              <div className="veredicto veredicto--pend">
                <i className="fas fa-paper-plane" />
                <div>
                  <p className="veredicto-t">Todavía no se mandó al cliente</p>
                  <p className="veredicto-d">
                    Esta orden no tiene respuesta porque no se le envió al cliente. Mandala desde el
                    paso anterior.
                  </p>
                </div>
              </div>
            )}

            {situacion === 'confirmada' && (
              <div className="veredicto veredicto--ok">
                <i className="fas fa-circle-check" />
                <div>
                  <p className="veredicto-t">El cliente confirmó la orden</p>
                  <p className="veredicto-d">Ya se puede mandar al taller.</p>
                </div>
              </div>
            )}

            {situacion === 'pendiente' && (
              <div className="veredicto veredicto--pend">
                <i className="fas fa-hourglass-half" />
                <div>
                  <p className="veredicto-t">Pendiente de confirmar</p>
                  <p className="veredicto-d">
                    El cliente todavía no contestó, así que <strong>no se puede mandar al taller</strong>.
                    Cuando confirme desde el formulario, el tablero lo registra y el botón aparece.
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
                    Esta orden <strong>no se manda al taller</strong>. Hay que rehacer la orden y
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
            <EstadoBadge label="Envío al taller" estado={envioTaller} vacio={elegida ? undefined : RAYA} />
          </div>

          <div className="acciones-fila">
            {puedeDespachar || enCurso ? (
              <button type="button" className="btn btn-primary" disabled={enCurso} onClick={despachar}>
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
            ) : (
              elegida && (
                <p className="panel-d" style={{ margin: 0 }}>
                  Al taller sólo se manda una orden Confirmada.
                </p>
              )
            )}
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
          <div className={`vinculo taller-sel ${elegida || !ordenes?.length ? '' : 'taller-sel--pide'}`}>
            <div>
              <div className="vinculo-l">
                <i className="fas fa-list-check" /> Orden de producción
              </div>
              <Dropdown<ResumenOrden>
                label={
                  elegida ? (
                    <span className="selbox-val">
                      <span className="selbox-val-txt">
                        {nombreOrden(elegida)} — {elegida.estado || 'sin estado'}
                      </span>
                    </span>
                  ) : (
                    <span className="selbox-ph">
                      {ordenes === undefined
                        ? 'Buscando las órdenes…'
                        : ordenes.length
                          ? 'Elegí la orden que sale al taller'
                          : 'La obra no tiene órdenes emitidas'}
                    </span>
                  )
                }
                items={ordenes ?? []}
                itemKey={(o) => o.id}
                esElegido={(o) => o.id === elegidaId}
                renderItem={(o) => (
                  <span>
                    {nombreOrden(o)}{' '}
                    <span style={{ color: COLOR_ESTADO_OP[o.estado] ?? 'inherit', fontWeight: 600 }}>
                      — {o.estado || 'sin estado'}
                    </span>
                  </span>
                )}
                disabled={!ordenes?.length || enCurso}
                onSelect={(o) => setElegidaId(o.id)}
              />
            </div>
          </div>
          {elegida ? (
            <DocumentoOrden key={elegida.id} orden={elegida} cargando={false} insignia="estadoOp" />
          ) : (
            <DocumentoOrdenVacio />
          )}
        </div>
      </div>

      <PasoNav />
    </section>
  )
}
