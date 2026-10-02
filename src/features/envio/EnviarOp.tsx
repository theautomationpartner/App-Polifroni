import { useEffect, useRef, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { nombreOrden } from '@/features/shared/nombreOrden'
import {
  ROLES,
  advertenciasDestino,
  celularValido,
  destinoDe,
  faltantesDestino,
  formatoMonday,
  type Rol,
} from '@/lib/destinatario'
import { VISTA_ESTADO, aptaParaTaller } from '@/lib/estadosOp'
import { fechaHora, htmlATexto } from '@/lib/texto'
import {
  BOARD_ORDENES,
  COL,
  ESTADO_ENVIO_OP,
  ESTADO_OP,
  ETIQUETA,
  guardarConfirmador,
  guardarLinkOrden,
  leerOrden,
  setEstado,
  setEstadoEnvioOrden,
  setEstadoOrden,
  type ResumenOrden,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra } from '@/types'
import { EditarCelular } from './EditarCelular'
import { MensajeEjemplo } from './MensajeEjemplo'
import { linkDeRespuesta, registrarActividadEnvio } from './actividadEnvio'
import { useEnviarOp } from './useEnviarOp'
import { useEnviarTaller } from './useEnviarTaller'

/** La única vía de envío: WhatsApp, por la automatización de Monday. */
const VIA = 'Whatsapp'

/**
 * El tablero y el ítem que el escenario de envío tiene que abrir: los de la OP (tablero Orden de
 * Produccion), no los de la obra. La obra igual viaja en `itemIdObra`.
 */
const sobreDeLaOp = (ordenId: string | null) =>
  ordenId ? { boardId: String(BOARD_ORDENES), pulseId: Number(ordenId) } : {}

/** Los destinatarios que la obra ya tenía elegidos: "Cliente", "Constructor" o "Ambos". */
const rolesIniciales = (texto: string): Rol[] =>
  texto === 'Ambos' ? [...ROLES] : (ROLES as readonly string[]).includes(texto) ? [texto as Rol] : []

/** Cómo se escribe la lista en `✋ Orden de Produccion a:` (Cliente | Constructor | Ambos). */
const etiquetaDestinatarios = (roles: readonly Rol[]): string =>
  roles.length === 2 ? 'Ambos' : (roles[0] ?? '')

const COLOR_ROL: Record<Rol | 'Taller', string> = {
  Cliente: 'var(--primary-blue)',
  Constructor: '#575ce5',
  Taller: 'var(--avatar-orange)',
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?'

type EstadoFila = 'idle' | 'enviando' | 'ok' | 'error'

/** El círculo de estado de la fila, el mismo de La Batea (`cobro-ok`). */
function EstadoEnvioContacto({ estado, motivo }: { estado: EstadoFila; motivo?: string }) {
  if (estado === 'enviando') {
    return (
      <span className="cobro-ok cobro-ok--cargando" role="status" aria-label="Enviando">
        <i className="fas fa-circle-notch spin" />
      </span>
    )
  }
  const titulo =
    estado === 'ok' ? 'Enviado' : estado === 'error' ? `No se pudo enviar${motivo ? `: ${motivo}` : ''}` : 'Sin enviar'
  return (
    <span className={`cobro-ok ${estado === 'ok' ? 'on' : estado === 'error' ? 'err' : ''}`} title={titulo} aria-label={titulo}>
      <i className={`fas ${estado === 'error' ? 'fa-xmark' : 'fa-check'}`} />
    </span>
  )
}

interface EnviarOpProps {
  modo: 'cliente' | 'taller'
  /** La OP que se envía, leída del tablero. `null` mientras no existe o se está leyendo. */
  orden: ResumenOrden | null
  /** La OP final ya está lista para mandarse. Sin ella el botón queda apagado y se dice por qué. */
  listo: boolean
  /** Qué falta cuando no está lista ("Falta generar la OP final"). */
  avisoNoListo?: string
  /**
   * Orden nueva cuyo registro se hace al finalizar (Aluminio y PVC). El documento ya está adjunto en
   * la OP —el escenario lo descarga de ahí— pero el envío no escribe estados en el tablero: lo que
   * salió queda en el borrador y se registra al finalizar la operación.
   */
  local?: OrdenLocal | null
  /**
   * Lo que tiene que quedar en Monday ANTES de disparar el escenario (PVC: la OP final adjunta en la
   * OP, de donde la toma el envío). Si falla, no se envía.
   */
  antesDeEnviar?: () => Promise<void>
  /**
   * Fuera de la operación de envío (el reenvío desde la consulta): la obra y el "enviado" son de
   * quien lo usa, no del estado global de la operación.
   */
  contexto?: ContextoEnvio
}

/** La obra y el cierre del envío, cuando los maneja la pantalla que usa `EnviarOp`. */
export interface ContextoEnvio {
  obra: Obra
  enviado: boolean
  onEnviado: () => void
  /** La obra con un dato corregido (el celular de un destinatario). */
  onObra: (obra: Obra) => void
}

/** Lo que se sabe de una orden cuyo documento todavía no está en Monday. */
export interface OrdenLocal {
  /** La OP del tablero: nace al cargar el documento (el PDF de Aluminio o el HETMO de PVC). */
  ordenId: string | null
  archivo: File
  numero: string
  tipo: string
  medidoPor: string
  /** `YYYY-MM-DD`. */
  fecha: string
  observacion: string
}

/**
 * El envío de la OP: el mismo bloque "Enviar presupuesto" de La Batea (`EnviarDocumento`).
 *
 * Al cliente o constructor: el medio es fijo (WhatsApp) y el destinatario es UNO —el que confirma—.
 * La fila muestra su nombre, su celular y cómo le fue el envío. El mensaje lleva SIEMPRE el enlace
 * de confirmación. Al taller: el destinatario es el taller, y sólo sale una OP confirmada.
 *
 * Antes de disparar se relee la OP: si otra persona la mandó o la canceló mientras tanto, no se
 * manda de nuevo. Terminado bien, el botón queda en verde y fijo —aunque se vaya y se vuelva con el
 * stepper— y "Finalizar Operación" cierra.
 */
export function EnviarOp({ modo, orden, listo, avisoNoListo, local = null, antesDeEnviar, contexto }: EnviarOpProps) {
  const app = useApp()
  const dispatch = useDispatch()
  const obra = contexto?.obra ?? app.obra
  if (!obra) throw new Error('No hay obra seleccionada')
  const enviado = contexto ? contexto.enviado : app.enviado
  const marcarEnviado = () => (contexto ? contexto.onEnviado() : dispatch({ type: 'setEnviado' }))
  const cambiarObra = (o: Obra) => (contexto ? contexto.onObra(o) : dispatch({ type: 'refrescarObra', obra: o }))
  const cliente = useEnviarOp(obra)
  const taller = useEnviarTaller(obra)
  const corrida = modo === 'cliente' ? cliente : taller

  /**
   * A quiénes se envía: el cliente, el constructor o los dos. Se agregan desde el selector a la
   * lista de destinatarios, y cada uno se quita con su tacho. Elegirlos no escribe nada en Monday.
   */
  const [roles, setRoles] = useState<Rol[]>(() =>
    modo === 'cliente' ? rolesIniciales(obra.opDestinatario.texto) : [],
  )
  /**
   * Quién confirma la orden cuando se envía a los DOS: lo elige el usuario. Con uno solo, confirma
   * ése y no se pregunta.
   */
  const [confirmadorElegido, setConfirmadorElegido] = useState<Rol | null>(null)
  const [verMensaje, setVerMensaje] = useState(false)
  /** El destinatario cuyo celular se está corrigiendo (ver `EditarCelular`). */
  const [editandoCel, setEditandoCel] = useState<Rol | null>(null)
  const [faltan, setFaltan] = useState<{ titulo: string; items: string[] } | null>(null)
  const [preparando, setPreparando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  /** La OP y los destinatarios con que salió ESTA corrida: el cierre los usa aunque la pantalla cambie. */
  const enCurso = useRef<{
    orden: ResumenOrden | null
    roles: Rol[]
    reenvio: boolean
    confirmador: Rol | null
  } | null>(null)
  const disparando = useRef(false)

  const enviando = preparando || corrida.enCurso || cerrando
  useAccionEnCurso(
    modo === 'cliente' ? 'Esperá a que termine el envío de la OP.' : 'Esperá a que termine el envío al taller.',
    enviando,
  )

  const elegidos = modo === 'cliente' ? roles.map((r) => ({ r, d: destinoDe(obra, r) })) : []
  const candidatos = ROLES.map((r) => ({ r, d: destinoDe(obra, r) })).filter((c) => c.d.nombre)
  /** Los que todavía se pueden agregar a la lista. */
  const disponibles = candidatos.filter((c) => !roles.includes(c.r))
  /* Las advertencias de cada destinatario, sin repetir: "el mismo celular" sale igual para los dos. */
  const advertencias =
    modo === 'cliente' ? [...new Set(roles.flatMap((r) => advertenciasDestino(obra, r)))] : []
  const sinDestinatarios = modo === 'cliente' && roles.length === 0
  const ambos = modo === 'cliente' && roles.length === 2
  /* El confirmador vigente: el único destinatario, o el elegido si sigue en la lista. */
  const confirmador: Rol | null =
    modo !== 'cliente'
      ? null
      : roles.length === 1
        ? roles[0]
        : confirmadorElegido && roles.includes(confirmadorElegido)
          ? confirmadorElegido
          : null
  /* Reenviar es mandar de nuevo una que ya espera respuesta: el estado de la OP no cambia. */
  const reenvio = orden?.estadoOrden === 'pendiente'
  /* Una orden local se envía recién cuando su documento ya está adjunto en una OP del tablero. */
  const sinDocumento = !listo || (!orden && !local?.ordenId)
  const fase = corrida.estado.fase
  const estadoBoton: 'idle' | 'enviando' | 'enviado' | 'error' = enviado
    ? 'enviado'
    : enviando
      ? 'enviando'
      : fase === 'error' || fallo
        ? 'error'
        : 'idle'

  const estadoFila: EstadoFila = enviado ? 'ok' : enviando ? 'enviando' : estadoBoton === 'error' ? 'error' : 'idle'

  const confirmar = async () => {
    if (enviando || enviado || sinDocumento || disparando.current) return
    setFallo(null)
    if (modo === 'cliente') {
      const f = roles.length ? roles.flatMap((r) => faltantesDestino(obra, r)) : faltantesDestino(obra, '')
      if (f.length) {
        setFaltan({ titulo: 'Todavía no se puede enviar', items: f })
        return
      }
      /* A los dos sin decir quién confirma: no sale nada. */
      if (ambos && !confirmador) {
        setFaltan({
          titulo: 'Falta indicar quién confirma la orden',
          items: ['Elegí en «Responsable de confirmar la orden» si confirma el cliente o el constructor.'],
        })
        return
      }
    }
    disparando.current = true
    setPreparando(true)
    try {
      /* Orden que todavía no está en Monday: va el PDF de la app y no se escribe nada en el tablero
         —ni el destinatario en la obra—. Todo eso se registra al finalizar. */
      if (local) {
        if (antesDeEnviar) await antesDeEnviar()
        const destinos = roles.map((r) => destinoDe(obra, r))
        enCurso.current = { orden: null, roles: [...roles], reenvio: false, confirmador }
        void cliente.correr({
          ...sobreDeLaOp(local.ordenId),
          ordenId: local.ordenId,
          itemIdObra: obra.id,
          idOp: '',
          numero: local.numero,
          tipo: local.tipo,
          medidoPor: local.medidoPor,
          fechaMedicion: local.fecha ? local.fecha.split('-').reverse().join('/') : '',
          destinatario: etiquetaDestinatarios(roles),
          via: VIA,
          celCliente: obra.celCliente,
          celArquitecto: obra.celArquitecto,
          destinos: destinos.map((d) => ({
            tipo: d.tipo,
            nombre: d.nombre,
            whatsapp: d.whatsapp,
            email: d.email,
            confirmador: d.tipo === confirmador,
          })),
          /* Quién es el responsable de confirmar la orden: "Cliente" o "Constructor". */
          confirmador,
          conEnlaceConfirmacion: true,
          /* Sin el PDF en el pedido: el escenario lo descarga de la OP (`ordenId`) —Aluminio:
             🤖OP OriginaL; PVC: 🤖Op V2 Mejorada—. Así el pedido no tiene tope de tamaño. */
          reenvio: false,
        })
        return
      }
      if (!orden) return
      /* La OP sigue en un estado que admite este envío. */
      const fresca = await leerOrden(orden.id)
      const admitidos = modo === 'cliente' ? ['generada', 'pendiente'] : ['confirmada']
      /* Al taller, además, que no se haya enviado ya (ver `aptaParaTaller`). */
      if (fresca && modo === 'taller' && !aptaParaTaller(fresca.estadoOrden, fresca.envioTaller)) {
        setFaltan({
          titulo: 'La orden ya se envió al taller',
          items: [`${nombreOrden(fresca)} ya tiene su envío al taller («${fresca.envioTaller}»). No se envió nada.`],
        })
        return
      }
      if (!fresca || !admitidos.includes(fresca.estadoOrden)) {
        setFaltan({
          titulo: 'La orden cambió de estado',
          items: [
            fresca
              ? `${nombreOrden(fresca)} ahora está «${VISTA_ESTADO[fresca.estadoOrden].rotulo}». No se envió nada.`
              : 'La orden ya no está en el tablero. No se envió nada.',
          ],
        })
        return
      }
      const pdf = fresca.opFinal.find((a) => !a.esImagen) ?? fresca.opFinal[0]
      if (modo === 'taller') {
        enCurso.current = { orden: fresca, roles: [], reenvio: false, confirmador: null }
        void taller.correr({
          ...sobreDeLaOp(fresca.id),
          ordenId: fresca.id,
          itemIdObra: obra.id,
          idOp: fresca.idOp,
          numero: fresca.numero,
          assetId: pdf?.assetId ?? null,
          fileName: pdf?.nombre ?? null,
        })
        return
      }
      const destinos = roles.map((r) => destinoDe(obra, r))
      const etiqueta = etiquetaDestinatarios(roles)
      /* Recién ahora se escribe en la obra a quiénes y por dónde: el escenario lo lee de ahí. Elegir
         los destinatarios no escribe nada: navegar no deja registros a medias. */
      if (obra.opDestinatario.texto !== etiqueta) await setEstado(obra.id, COL.opDestinatario, etiqueta)
      if (obra.opVia.texto !== VIA) await setEstado(obra.id, COL.opVia, VIA)
      const esReenvio = fresca.estadoOrden === 'pendiente'
      enCurso.current = { orden: fresca, roles: [...roles], reenvio: esReenvio, confirmador }
      void cliente.correr({
        ...sobreDeLaOp(fresca.id),
        ordenId: fresca.id,
        itemIdObra: obra.id,
        idOp: fresca.idOp,
        numero: fresca.numero,
        destinatario: etiqueta,
        via: VIA,
        celCliente: obra.celCliente,
        celArquitecto: obra.celArquitecto,
        /* Una entrada por destinatario: el escenario las recorre y le manda a cada uno. */
        destinos: destinos.map((d) => ({
          tipo: d.tipo,
          nombre: d.nombre,
          whatsapp: d.whatsapp,
          email: d.email,
          confirmador: d.tipo === confirmador,
        })),
        /* Quién es el responsable de confirmar la orden: "Cliente" o "Constructor". */
        confirmador,
        /* El mensaje SIEMPRE lleva el enlace, a cada destinatario (ver formularios/LEEME.md). */
        conEnlaceConfirmacion: true,
        reenvio: esReenvio,
      })
    } catch {
      setFallo('No se pudo preparar el envío en Monday. Reintentá.')
      dispatch({ type: 'errorMonday', accion: 'preparar el envío de la OP' })
    } finally {
      setPreparando(false)
      disparando.current = false
    }
  }

  /** La actividad "OP Enviada" en la línea de tiempo de la obra, con todo lo del envío. */
  const registrarEnvio = async (o: ResumenOrden, rs: Rol[], esReenvio: boolean) => {
    const cuerpo = await cliente.esperarRespuesta(15_000)
    const link = linkDeRespuesta(cuerpo)
    if (link) await guardarLinkOrden(o.id, link).catch(() => {})
    await registrarActividadEnvio(obra, o, rs, esReenvio, link).catch((e) =>
      console.warn('[envio] no se pudo crear la actividad OP Enviada', e),
    )
  }
  /* Cómo terminó la corrida. Lo que queda escrito es de la OP que se mandó (`enCurso`). */
  useEffect(() => {
    const e = enCurso.current
    if (!e) return
    if (fase === 'error') {
      if (modo === 'cliente' && e.orden) void setEstadoEnvioOrden(e.orden.id, ESTADO_ENVIO_OP.error).catch(() => {})
      return
    }
    if (fase !== 'listo') return
    void (async () => {
      setCerrando(true)
      if (!e.orden) {
        /* Orden local: nada se escribe ahora. Se guarda qué salió, a quiénes y el link, para
           registrarlo todo al finalizar la operación. */
        const cuerpo = await cliente.esperarRespuesta(15_000)
        dispatch({
          type: 'setBorrador',
          cambios: {
            envio: {
              roles: e.roles,
              confirmador: e.confirmador,
              link: linkDeRespuesta(cuerpo),
              cuando: new Date().toISOString(),
            },
          },
        })
      } else if (modo === 'taller') {
        await setEstadoOrden(e.orden.id, ESTADO_OP.taller).catch((err) =>
          console.warn('[taller] no se pudo marcar la OP como enviada a taller', err),
        )
      } else {
        if (!e.reenvio) await setEstadoOrden(e.orden.id, ESTADO_OP.enviada).catch(() => {})
        /* Quién confirma esta orden: la consulta lo muestra cuando la confirman. */
        if (e.confirmador) {
          await guardarConfirmador(e.orden.id, e.confirmador).catch((err) =>
            console.warn('[envio] no se pudo guardar el responsable de confirmar', err),
          )
        }
        /* Una OP nueva todavía no tiene respuesta: una respuesta vieja en la obra no es la suya. */
        if (obra.confirmacionOp.texto !== ETIQUETA.pendConfirmar) {
          await setEstado(obra.id, COL.confirmacionOp, ETIQUETA.pendConfirmar).catch(() => {})
        }
        await registrarEnvio(e.orden, e.roles, e.reenvio)
      }
      marcarEnviado()
      setCerrando(false)
    })()
    // Sólo importa el cambio de fase; el resto se lee de `enCurso`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  /* Lo que salió mal, dicho al lado del botón. */
  const errorCorrida =
    fase === 'error'
      ? (corrida.estado.updateError ? htmlATexto(corrida.estado.updateError.body) : corrida.estado.problema) ||
        'La automatización no confirmó el envío. Reintentá.'
      : null


  return (
    <div className="card card--neutral card--flush card-pad">
      <h3 className="resumen-title">{modo === 'taller' ? 'Enviar OP al taller' : reenvio ? 'Reenviar OP' : 'Enviar OP'}</h3>

      <div className="igp">
        <div className="envio-medio-fila">
          <span className="envio-medio-lbl">Medio de Envío por defecto:</span>
          {/* El medio es WhatsApp también para el taller: el destinatario es el taller, el canal no. */}
          <div className="envio-medio-fijo">
            <i className="fab fa-whatsapp" aria-hidden="true" /> WhatsApp
          </div>
        </div>
      </div>

      {modo === 'cliente' && (
        <div className="igp">
          <label htmlFor="op-destinatario">Destinatarios *</label>
          {candidatos.length === 0 ? (
            <div className="envio-sin-contactos" role="alert">
              <i className="fas fa-triangle-exclamation" />
              <div>
                <div className="envio-sin-contactos-t">La obra no tiene a quién enviarle la orden</div>
                <p>
                  <strong>{obra.nombre}</strong> no tiene una cuenta corriente de cliente ni un
                  constructor vinculados. Cargalos en la obra y volvé a intentar.
                </p>
              </div>
            </div>
          ) : (
            <select
              id="op-destinatario"
              className="full w-contactos"
              style={{ cursor: 'pointer' }}
              /* El selector AGREGA a la lista y vuelve a "Agregar…": no es una elección excluyente. */
              value=""
              disabled={enviando || enviado || disponibles.length === 0}
              onChange={(e) => {
                const r = e.target.value as Rol
                if (!r) return
                setFallo(null)
                setRoles((prev) => (prev.includes(r) ? prev : ROLES.filter((x) => x === r || prev.includes(x))))
              }}
            >
              <option value="" disabled>
                {disponibles.length === 0 ? 'Ya están todos en la lista' : 'Agregar destinatario…'}
              </option>
              {disponibles.map(({ r, d }) => (
                <option key={r} value={r}>
                  {r} · {d.nombre}
                  {d.whatsapp ? ` · ${formatoMonday(d.whatsapp)}` : ' · sin celular'}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {ambos && (
        <div className="igp">
          <label htmlFor="op-confirmador">Responsable de confirmar la orden *</label>
          <select
            id="op-confirmador"
            className={`full w-contactos ${faltan && !confirmador ? 'is-falta' : ''}`}
            style={{ cursor: 'pointer' }}
            value={confirmador ?? ''}
            disabled={enviando || enviado}
            onChange={(e) => {
              setFallo(null)
              setConfirmadorElegido((e.target.value || null) as Rol | null)
            }}
          >
            <option value="" disabled>
              Elegí quién confirma…
            </option>
            {elegidos.map(({ r, d }) => (
              <option key={r} value={r}>
                {r} ({d.nombre || 'sin nombre'})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="font-b" style={{ fontSize: 14, marginTop: 24 }}>
        Destinatarios seleccionados ({modo === 'taller' ? 1 : roles.length})
      </div>
      <div className="selc">
        {modo === 'taller' && (
          <div className="citem">
            <div className="cinfo">
              <div className="cava" style={{ background: COLOR_ROL.Taller }}>
                <i className="fas fa-industry" />
              </div>
              <div>
                <div className="citem-name">Taller de fabricación</div>
                <div className="citem-sub">Recibe la orden confirmada para fabricar</div>
              </div>
            </div>
            <div className="citem-right">
              <span className="cbadge ok">Taller</span>
              <EstadoEnvioContacto estado={estadoFila} motivo={errorCorrida ?? fallo ?? undefined} />
            </div>
          </div>
        )}
        {elegidos.map(({ r, d }) => {
          const telInvalido = !d.whatsapp || !celularValido(d.whatsapp)
          return (
            <div className={`citem ${telInvalido ? 'citem--sin-dato' : ''}`} key={r}>
              <div className="cinfo">
                <div className="cava" style={{ background: COLOR_ROL[r] }}>
                  {iniciales(d.nombre)}
                </div>
                <div>
                  <div className="citem-name">{d.nombre || 'Sin nombre'}</div>
                  <div className={`citem-sub ${telInvalido ? 'citem-sub--falta' : ''}`}>
                    {!d.whatsapp
                      ? 'SIN TELEFONO'
                      : celularValido(d.whatsapp)
                        ? formatoMonday(d.whatsapp)
                        : `TELEFONO INVALIDO (${d.whatsapp})`}
                    {/* Corregir el número sin salir del envío, también después de enviar: el celular
                        es de la ficha de la persona, no de esta orden. Mientras sale el mensaje, no. */}
                    <button
                      type="button"
                      className="citem-editar"
                      disabled={enviando}
                      title={enviando ? 'Esperá a que termine el envío' : undefined}
                      onClick={() => setEditandoCel(r)}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              </div>
              <div className="citem-right">
                {r === confirmador && <span className="cbadge cbadge--confirmador">Confirmador</span>}
                <span className="cbadge ok">{r}</span>
                <button
                  type="button"
                  className="del"
                  aria-label={`Quitar ${d.nombre || r}`}
                  disabled={enviando || enviado}
                  title={enviado ? 'Ya se envió la orden: no se puede quitar destinatarios' : undefined}
                  onClick={() => setRoles((prev) => prev.filter((x) => x !== r))}
                >
                  🗑️
                </button>
                <EstadoEnvioContacto estado={estadoFila} motivo={errorCorrida ?? fallo ?? undefined} />
              </div>
            </div>
          )
        })}
      </div>
      {modo === 'cliente' && (
        <button type="button" className="enviar-mas" onClick={() => setVerMensaje(true)}>
          <i className="far fa-comment-dots" /> Ver el mensaje que le llega
        </button>
      )}

      <div className="enviar-row">
        <button
          type="button"
          className="btn-block btn-block--enviar btn-mayus"
          style={{
            background:
              estadoBoton === 'enviado'
                ? 'var(--green)'
                : estadoBoton === 'error'
                  ? 'var(--red)'
                  : 'var(--primary-blue)',
            ...(estadoBoton === 'enviado' ? { opacity: 1 } : {}),
          }}
          disabled={enviando || enviado || sinDocumento || sinDestinatarios}
          aria-busy={enviando}
          title={
            enviando || enviado
              ? undefined
              : sinDocumento
                ? (avisoNoListo ?? 'Todavía no hay una OP final para enviar.')
                : sinDestinatarios
                  ? 'Agregá al menos un destinatario'
                  : estadoBoton === 'error'
                    ? 'Tocá para reintentar el envío'
                    : undefined
          }
          onClick={() => void confirmar()}
        >
          {estadoBoton === 'enviando' ? (
            <>
              <i className="fas fa-circle-notch spin" /> Enviando...
            </>
          ) : estadoBoton === 'enviado' ? (
            <>
              <i className="fas fa-check" /> Enviado exitosamente
            </>
          ) : estadoBoton === 'error' ? (
            <>
              <i className="fas fa-xmark" /> Error de Envío
            </>
          ) : (
            <>
              <i className="fas fa-paper-plane" /> Confirmar y Enviar
            </>
          )}
        </button>

        {sinDocumento && !enviado && (
          <div className="enviar-avisos" role="status" aria-live="polite">
            <p className="enviar-aviso enviar-aviso--err">
              <i className="fas fa-circle-exclamation" aria-hidden="true" />
              <span>
                <strong>{avisoNoListo ?? 'Todavía no hay una OP final para enviar'}.</strong>
              </span>
            </p>
          </div>
        )}
        {!enviado && (advertencias.length > 0 || errorCorrida || fallo || fase === 'demorado') && (
          <div className="enviar-avisos" role="status" aria-live="polite">
            {advertencias.map((a) => (
              <p key={a} className="enviar-aviso enviar-aviso--warn">
                <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                <span>{a}</span>
              </p>
            ))}
            {(errorCorrida || fallo) && (
              <p className="enviar-aviso enviar-aviso--err">
                <i className="fas fa-circle-exclamation" aria-hidden="true" />
                {corrida.estado.vencida ? (
                  /* Pasó el tope de espera: el mensaje es uno solo y dice a quién acudir. */
                  <span>{errorCorrida}</span>
                ) : (
                  <span>
                    <strong>No se pudo enviar.</strong> {errorCorrida ?? fallo}
                    {corrida.estado.updateError && ` (${fechaHora(corrida.estado.updateError.fecha)})`}
                  </span>
                )}
              </p>
            )}
            {fase === 'demorado' && (
              <p className="enviar-aviso enviar-aviso--warn">
                <i className="fas fa-hourglass-half" aria-hidden="true" />
                <span>
                  <strong>Está tardando más de lo normal.</strong>{' '}
                  <button type="button" className="enviar-mas" onClick={() => void corrida.seguirEsperando()}>
                    Seguir esperando
                  </button>
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {editandoCel && (
        <EditarCelular
          obra={obra}
          rol={editandoCel}
          nombre={destinoDe(obra, editandoCel).nombre}
          actual={destinoDe(obra, editandoCel).whatsapp}
          onCerrar={() => setEditandoCel(null)}
          onActualizado={(celular) => {
            /* La app sigue con el número nuevo: el de la obra es un espejo del de la persona. */
            setFallo(null)
            cambiarObra(editandoCel === 'Cliente' ? { ...obra, celCliente: celular } : { ...obra, celArquitecto: celular })
          }}
        />
      )}

      {verMensaje && (
        <MensajeEjemplo
          destinatario={etiquetaDestinatarios(roles) || 'Cliente'}
          roles={roles}
          confirmador={confirmador}
          reenvio={reenvio}
          onClose={() => setVerMensaje(false)}
        />
      )}

      {faltan && (
        <AvisoModal titulo={faltan.titulo} faltantes={faltan.items} onClose={() => setFaltan(null)}>
          {faltan.items.length > 1 ? 'No se envió nada. Corregí lo siguiente y volvé a tocar "Confirmar y Enviar":' : null}
        </AvisoModal>
      )}
    </div>
  )
}
