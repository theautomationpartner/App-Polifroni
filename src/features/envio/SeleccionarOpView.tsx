import { aptaParaTaller, enElTaller } from '@/lib/estadosOp'
import { useEffect, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useRefrescarObra } from '@/features/shared/PasoNav'
import { respuestaCliente, etiquetaPaso, tipoDe } from '@/lib/pasos'
import {
  ESTADO_OP,
  copiarRespuestaAOrden,
  getUrlArchivo,
  ordenesDeObra,
  type ResumenOrden,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'

const fecha = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

/**
 * Etapa 2 · Seleccionar OP A Enviar (envío al taller).
 *
 * Todas las órdenes de la obra, del tablero de órdenes, en una tabla. Se elige UNA. Sólo se puede
 * elegir una CONFIRMADA por el cliente o el constructor: el resto se ve —para saber en qué está
 * cada una— pero no se puede tocar. Sin confirmación no se fabrica.
 *
 * La respuesta del cliente llega a la OBRA (la escribe el escenario del formulario) y se copia acá
 * a la OP que la estaba esperando, la más nueva de las enviadas: así una orden recién confirmada
 * aparece elegible sin tocar nada.
 *
 * La misma tabla sirve para "Enviar una ya cargada" al cliente o constructor (`existente`). Ahí se
 * listan las órdenes del TIPO de la obra (PVC o Aluminio) y se puede elegir una que todavía no fue
 * confirmada: generada (se envía) o pendiente de confirmar (se reenvía).
 */
export function SeleccionarOpView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const refrescar = useRefrescarObra()
  const { ordenId, destino, existente } = useApp()
  /** Al cliente con una ya cargada; si no, al taller. */
  const alCliente = destino === 'cliente' && existente
  /** Qué órdenes se pueden elegir en cada caso. */
  const elegibleEn = (o: ResumenOrden) =>
    alCliente ? o.estadoOrden === 'pendiente' : aptaParaTaller(o.estadoOrden, o.envioTaller)
  /** Al cliente sólo se listan las del tipo de la obra: una OP de Aluminio no es de una obra de PVC. */
  const delTipo = (o: ResumenOrden) =>
    !alCliente || !obra.tipo.texto || o.tipo.trim().toLowerCase() === obra.tipo.texto.trim().toLowerCase()
  const [ordenes, setOrdenes] = useState<ResumenOrden[] | null>(null)
  const [error, setError] = useState(false)
  const [faltan, setFaltan] = useState(false)
  /** "Volver a intentar": vuelve a leer las órdenes (una recién cargada puede tardar en aparecer). */
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        let todas = await ordenesDeObra(obra.ordenesIds)
        const ultima = todas.find((o) => o.estadoOrden !== 'borrador' && o.estadoOrden !== 'cancelada')
        const r = respuestaCliente(obra, null)
        if (ultima?.estadoOrden === 'pendiente' && r !== 'pendiente') {
          const etiqueta = r === 'confirmada' ? ESTADO_OP.confirmada : ESTADO_OP.noConfirmada
          if (await copiarRespuestaAOrden(ultima.id, ultima.estado, etiqueta)) {
            todas = await ordenesDeObra(obra.ordenesIds)
          }
        }
        if (!vivo) return
        /* TODAS las órdenes de la obra (del tipo de la obra, al cliente), también las que quedaron
           sin generar —se cargó el original y la OP final nunca salió—: se tienen que ver, aunque
           no se puedan enviar. */
        /* Al cliente con una ya cargada se listan SÓLO las que están "Enviada Pend Confirmar"
           (`🤖Estado OP`): son las que ya se mandaron y esperan la respuesta, y se reenvían. Al
           taller, todas —las que no están confirmadas se ven apagadas—. */
        setOrdenes(todas.filter(delTipo).filter((o) => !alCliente || o.estadoOrden === 'pendiente'))
        setError(false)
      } catch {
        if (vivo) {
          setError(true)
          setOrdenes([])
        }
      }
    })()
    return () => {
      vivo = false
    }
    // `delTipo` depende de la obra y del modo, que no cambian dentro de la etapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra, intento])

  /* Mientras haya órdenes esperando respuesta, la obra se relee cada 15 s: si el cliente confirma,
     la fila se habilita sola. */
  const hayPendientes = (ordenes ?? []).some((o) => o.estadoOrden === 'pendiente')
  useEffect(() => {
    if (!hayPendientes) return
    const cada = setInterval(() => void refrescar().catch(() => {}), 15_000)
    return () => clearInterval(cada)
  }, [hayPendientes, refrescar])

  const verPdf = async (o: ResumenOrden) => {
    const pdf = o.opFinal.find((a) => !a.esImagen) ?? o.opFinal[0]
    if (!pdf) return
    const ventana = window.open('', '_blank')
    try {
      const url = await getUrlArchivo(pdf.assetId)
      if (ventana) ventana.location.href = url
    } catch {
      ventana?.close()
      dispatch({ type: 'errorMonday', accion: 'abrir el documento' })
    }
  }

  const elegida = ordenes?.find((o) => o.id === ordenId && elegibleEn(o)) ?? null
  const elegibles = (ordenes ?? []).filter(elegibleEn).length

  return (
    <section className="view paso-layout obras-v2 anticipos-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Seleccionar OP A Enviar"
        descripcion={
          alCliente
            ? `Elegí la orden de ${obra.tipo.texto || 'la obra'} que querés enviar al cliente o al constructor. Solamente se pueden enviar las órdenes que todavía no fueron confirmadas.`
            : 'Elegí la orden que sale al taller. Sólo se pueden enviar las confirmadas por el cliente o el constructor.'
        }
      />


      {/* La card de los Anticipos de La Batea (Aplicación de Anticipo contra Facturas): título,
          bajada, la tabla con su casilla por fila y el renglón de avisos que cierra la card. Acá
          la casilla elige UNA sola orden: tildar otra destilda la anterior. */}
      <div className="cobro-static">
        <div className="cobro-card">
          <h3 className="cobro-card-title">Órdenes de producción disponibles</h3>
          <p className="cobro-card-desc">
            {alCliente
              ? `Órdenes de ${obra.tipo.texto || 'la obra'} de ${obra.nombre} enviadas y pendientes de confirmar. Elegí la que se vuelve a enviar al cliente o al constructor.`
              : `Órdenes de ${obra.nombre}. Elegí la confirmada que sale al taller.`}
          </p>

          {/* La tabla está SIEMPRE, con sus columnas fijas: buscando, sin resultados o con órdenes.
              Lo que cambia es el cuerpo; el aviso va centrado en él, ocupando todo el ancho. */}
          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija">
              <colgroup>
                <col className="ant-w-check" />
                <col className="ant-w-orden" />
                <col className="ant-w-fecha" />
                <col className="ant-w-medido" />
                <col className="ant-w-fecha" />
                <col className="ant-w-estado" />
                <col className="ant-w-op" />
              </colgroup>
              <thead>
                <tr>
                  <th className="ant-col-check" />
                  <th>Orden de producción</th>
                  <th className="ant-col-cen">Fecha de creación</th>
                  <th className="ant-col-cen">Medido por</th>
                  <th className="ant-col-cen">Fecha de medición</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">OP final</th>
                </tr>
              </thead>
              <tbody>
                {ordenes === null ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Buscando las órdenes de la obra...
                    </td>
                  </tr>
                ) : ordenes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="ant-aviso">
                      <i className="fas fa-circle-info" />{' '}
                      {error ? (
                        'No se pudieron leer las órdenes desde Monday.'
                      ) : alCliente ? (
                        <>
                          <strong>{obra.nombre}</strong> no tiene órdenes de producción de{' '}
                          {obra.tipo.texto || 'su tipo'} enviadas y pendientes de confirmar.
                        </>
                      ) : (
                        <>
                          <strong>{obra.nombre}</strong> todavía no tiene órdenes de producción.
                        </>
                      )}{' '}
                      <button
                        type="button"
                        className="cobro-reintentar"
                        onClick={() => {
                          setOrdenes(null)
                          setIntento((n) => n + 1)
                        }}
                      >
                        Volver a intentar
                      </button>
                    </td>
                  </tr>
                ) : (
                  ordenes.map((o) => {
                    const elegible = elegibleEn(o)
                    const on = elegida?.id === o.id
                    /* Las que no se pueden mandar siguen a la vista —se tiene que ver en qué está
                       cada una— pero apagadas y sin casilla, con el motivo en el tooltip. */
                    const vedada = !elegible
                    const motivo =
                      o.estadoOrden === 'borrador'
                        ? 'Esta orden todavía no tiene la OP final generada: no hay documento para enviar.'
                        : alCliente
                          ? 'Esta orden ya fue confirmada, enviada al taller o cancelada: no se envía al cliente.'
                          : enElTaller(o.estadoOrden, o.envioTaller)
                            ? 'Esta orden ya se envió al taller: no se vuelve a enviar.'
                            : 'Sólo se puede enviar al taller una orden confirmada.'
                    return (
                      <tr
                        key={o.id}
                        className={`ant-row ${on ? 'ant-row--on' : ''} ${vedada ? 'ant-row--off' : ''}`}
                        title={vedada ? motivo : undefined}
                      >
                        <td className="ant-col-check">
                          <input
                            type="checkbox"
                            className="ant-check"
                            checked={on}
                            disabled={vedada}
                            onChange={() => dispatch({ type: 'elegirOrden', ordenId: on ? null : o.id })}
                            aria-label={`Elegir la orden ${o.idOp || o.nombre}`}
                          />
                        </td>
                        <td>
                          {/* Arriba, en negrita, el N° de la orden —con el que se la nombra en la
                              fábrica—; abajo el IDOP del tablero y el tipo. */}
                          <span className="ant-nro">{o.numero ? `N° ${o.numero}` : 'Sin N°'}</span>
                          <span className="ant-detalle">{[o.idOp, o.tipo].filter(Boolean).join(' · ') || '—'}</span>
                        </td>
                        <td className="ant-col-cen">{fecha(o.creada) || <span className="ant-sd">—</span>}</td>
                        <td className="ant-col-cen">{o.medidoPor || <span className="ant-sd">—</span>}</td>
                        <td className="ant-col-cen">
                          {o.fechaMedicion ? o.fechaMedicion.split('-').reverse().join('/') : <span className="ant-sd">—</span>}
                        </td>
                        <td className="ant-col-cen">
                          <EstadoOrdenBadge estado={o.estadoOrden} chico />
                        </td>
                        <td className="ant-col-cen">
                          {o.opFinal.length > 0 ? (
                            <button type="button" className="ant-ver" onClick={() => void verPdf(o)}>
                              <i className="fas fa-file-pdf" /> Ver
                            </button>
                          ) : (
                            <span className="ant-sd">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* El renglón de avisos de La Batea: reserva su lugar, aparezca o no. */}
          <div className="cobro-card-acts">
            {ordenes && ordenes.length > 0 && (
              <span
                className={`cobro-bloqueo-inline ${
                  elegida ? 'cobro-bloqueo-inline--ok' : elegibles === 0 ? '' : 'cobro-bloqueo-inline--info'
                }`}
              >
                <i
                  className={`fas ${elegida ? 'fa-circle-check' : elegibles === 0 ? 'fa-circle-exclamation' : 'fa-circle-info'}`}
                />{' '}
                {elegibles === 0
                  ? alCliente
                    ? (ordenes ?? []).every((o) => o.estadoOrden === 'borrador')
                  ? 'Ninguna orden de esta obra tiene la OP final generada todavía: no hay documento para enviar.'
                  : 'Ninguna orden de esta obra está para enviar: están sin generar, confirmadas, enviadas al taller o canceladas.'
                    : 'Ninguna orden está confirmada todavía: apenas el cliente confirme, se habilita sola.'
                  : elegida
                    ? `Orden elegida: ${elegida.idOp}${elegida.numero ? ` · N° ${elegida.numero}` : ''}.`
                    : alCliente
                      ? `${elegibles} ${elegibles === 1 ? 'orden' : 'órdenes'} para elegir. Tildá la que se envía.`
                      : `${elegibles} ${elegibles === 1 ? 'orden confirmada' : 'órdenes confirmadas'} para elegir. Tildá la que sale al taller.`}
              </span>
            )}
          </div>
        </div>
      </div>

      <PieEtapa>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => (elegida ? dispatch({ type: 'goto', paso: 'envio' }) : setFaltan(true))}
        >
          Continuar a {etiquetaPaso('envio', destino, tipoDe(obra), existente)} <i className="fas fa-arrow-right" />
        </button>
      </PieEtapa>

      {faltan && (
        <AvisoModal titulo="Elegí la orden a enviar" onClose={() => setFaltan(false)}>
          {alCliente
            ? 'Seleccioná en la tabla la orden que querés enviar para pasar al envío.'
            : 'Seleccioná en la tabla la orden confirmada que sale al taller para pasar al envío.'}
        </AvisoModal>
      )}
    </section>
  )
}
