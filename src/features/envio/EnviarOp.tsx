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
import { nuevaClave } from '@/lib/claveConfirmacion'
import { VISTA_ESTADO, aptaParaTaller } from '@/lib/estadosOp'
import { fechaRecordatorio } from '@/lib/recordatorio'
import { fechaHora, htmlATexto } from '@/lib/texto'
import {
  BOARD_ORDENES,
  COL,
  ESTADO_ENVIO_OP,
  ESTADO_OP,
  ETIQUETA,
  getUrlArchivo,
  guardarClaveOrden,
  guardarConfirmador,
  guardarLinkOrden,
  guardarRecordatorio,
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
import { useEnviarTaller } from './useEnviarTaller'
import { useEnviarWhatsapp, type DestinoWsp } from './useEnviarWhatsapp'

/** La única vía de envío: WhatsApp (al cliente o constructor, por 360messenger desde la app). */
const VIA = 'Whatsapp'

/**
 * El tablero y el ítem que el escenario de envío tiene que abrir: los de la OP (tablero Orden de
 * Produccion), no los de la obra. La obra igual viaja en `itemIdObra`.
 */
const sobreDeLaOp = (ordenId: string | null) =>
  ordenId ? { boardId: String(BOARD_ORDENES), pulseId: Number(ordenId) } : {}

/** El link al PDF compartido en Drive que devuelve el envío (`link_op`). */
const linkDeRespuesta = (cuerpo: { link_op?: string } | null): string => {
  const link = String(cuerpo?.link_op ?? '').trim()
  return /^https?:\/\//i.test(link) ? link : ''
}

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

export type EstadoFila = 'idle' | 'enviando' | 'ok' | 'error'

/** El círculo de estado de la fila, el mismo de La Batea (`cobro-ok`). */
export function EstadoEnvioContacto({ estado, motivo }: { estado: EstadoFila; motivo?: string }) {
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
   * Orden nueva, que todavía no existe en Monday (Aluminio y PVC): la OP se crea al finalizar. El
   * PDF va DENTRO del pedido al escenario y el envío no escribe nada en el tablero: lo que salió
   * queda en el borrador y se registra al finalizar la operación.
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
  /** La OP del tablero. En una orden nueva es `null`: la OP nace al finalizar. */
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
  /* Al cliente o constructor: por WhatsApp desde la app, sin escenario. Al taller: su escenario. */
  const cliente = useEnviarWhatsapp()
  const taller = useEnviarTaller(obra)

  /**
   * A quiénes se envía: el cliente, el constructor o los dos. Se agregan desde el selector a la
   * lista de destinatarios, y cada uno se quita con su tacho. Elegirlos no escribe nada en Monday.
   */
  const [roles, setRoles] = useState<Rol[]>(() =>
    modo === 'cliente' ? rolesIniciales(obra.opDestinatario.texto) : [],
  )
  /**
   * El responsable de confirmar que la OP ya tiene asignado (`🤖Responsable de Confirmar`). Sólo
   * importa en un reenvío: la orden ya salió y alguien quedó a cargo de confirmarla.
   */
  const confirmadorAsignado: Rol | null =
    orden?.estadoOrden === 'pendiente' && (ROLES as readonly string[]).includes(orden.confirmador.trim())
      ? (orden.confirmador.trim() as Rol)
      : null
  /**
   * Quién confirma la orden cuando se envía a los DOS: lo elige el usuario. Con uno solo, confirma
   * ése y no se pregunta. En un reenvío arranca con el que ya tiene asignado la orden —su etiqueta
   * "Confirmador" se ve de entrada— y se puede reasignar.
   */
  const [confirmadorElegido, setConfirmadorElegido] = useState<Rol | null>(confirmadorAsignado)
  /* La orden puede llegar (o cambiar) después de montar: se toma su responsable si todavía no se
     eligió otro. */
  useEffect(() => {
    if (confirmadorAsignado) setConfirmadorElegido((actual) => actual ?? confirmadorAsignado)
  }, [orden?.id, confirmadorAsignado])
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
    /** La clave del enlace de confirmación que salió en el mensaje. */
    clave: string
  } | null>(null)
  const disparando = useRef(false)

  const enviando = preparando || (modo === 'cliente' ? cliente.enCurso : taller.enCurso) || cerrando
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
  /* Una orden local lleva su PDF en el pedido: no necesita estar en el tablero. */
  const sinDocumento = !listo || (!orden && !local)
  const fase = modo === 'cliente' ? cliente.estado.fase : taller.estado.fase
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
          items: ['Elegí quién confirma la orden: el cliente o el constructor.'],
        })
        return
      }
    }
    disparando.current = true
    setPreparando(true)
    /* Los destinatarios, como los recibe el envío: a cada uno, si es quien confirma. */
    const destinosWsp = (): DestinoWsp[] =>
      roles.map((r) => {
        const d = destinoDe(obra, r)
        return { tipo: d.tipo, nombre: d.nombre, whatsapp: d.whatsapp, confirmador: d.tipo === confirmador }
      })
    try {
      /* Orden que todavía no está en Monday: va el PDF de la app y no se escribe nada en el tablero
         —ni el destinatario en la obra—. Todo eso se registra al finalizar. */
      if (local) {
        if (antesDeEnviar) await antesDeEnviar()
        /* La clave del enlace: una por orden. Un reintento manda el mismo enlace; se guarda en la OP
           al finalizar, junto con el resto del envío. */
        const clave = app.borrador.claveConfirmacion ?? nuevaClave()
        if (!app.borrador.claveConfirmacion) dispatch({ type: 'setBorrador', cambios: { claveConfirmacion: clave } })
        enCurso.current = { orden: null, roles: [...roles], reenvio: false, confirmador, clave }
        /* El PDF de la app va en el pedido: Aluminio, el PDF cargado; PVC, la OP final generada. */
        void cliente.correr(
          {
            destinos: destinosWsp(),
            reenvio: false,
            ordenId: local.ordenId,
            obraId: obra.id,
            numero: local.numero,
            tipo: local.tipo,
            clave,
          },
          local.archivo,
          local.archivo.name,
        )
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
        enCurso.current = { orden: fresca, roles: [], reenvio: false, confirmador: null, clave: '' }
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
      const etiqueta = etiquetaDestinatarios(roles)
      /* El PDF de la OP, del tablero: es el que se manda. */
      if (!pdf) {
        setFaltan({ titulo: 'La orden no tiene la OP final adjunta', items: [`${nombreOrden(fresca)} no tiene el PDF para enviar.`] })
        return
      }
      const bajada = await fetch(await getUrlArchivo(pdf.assetId))
      if (!bajada.ok) throw new Error(`No se pudo bajar la OP final (HTTP ${bajada.status})`)
      const archivo = await bajada.blob()
      /* Recién ahora se escribe en la obra a quiénes y por dónde. Elegir los destinatarios no escribe
         nada: navegar no deja registros a medias. */
      if (obra.opDestinatario.texto !== etiqueta) await setEstado(obra.id, COL.opDestinatario, etiqueta)
      if (obra.opVia.texto !== VIA) await setEstado(obra.id, COL.opVia, VIA)
      const esReenvio = fresca.estadoOrden === 'pendiente'
      /* La OP ya está en el tablero: su clave se guarda ANTES de mandar, así el enlace funciona apenas
         llega. Un reenvío reusa la que ya tenía: el enlace del primer mensaje sigue sirviendo. */
      const clave = fresca.clave || nuevaClave()
      if (!fresca.clave) await guardarClaveOrden(fresca.id, clave)
      enCurso.current = { orden: fresca, roles: [...roles], reenvio: esReenvio, confirmador, clave }
      await setEstadoEnvioOrden(fresca.id, ESTADO_ENVIO_OP.enviando).catch(() => {})
      void cliente.correr(
        {
          destinos: destinosWsp(),
          reenvio: esReenvio,
          ordenId: fresca.id,
          obraId: obra.id,
          numero: fresca.numero,
          tipo: fresca.tipo,
          clave,
        },
        archivo,
        pdf.nombre || 'Orden de Produccion.pdf',
      )
    } catch {
      setFallo('No se pudo preparar el envío en Monday. Reintentá.')
      dispatch({ type: 'errorMonday', accion: 'preparar el envío de la OP' })
    } finally {
      setPreparando(false)
      disparando.current = false
    }
  }

  /** El link al PDF que devolvió el envío, guardado en la OP. */
  const guardarLink = async (o: ResumenOrden) => {
    const link = linkDeRespuesta(cliente.respuesta())
    if (link) await guardarLinkOrden(o.id, link).catch(() => {})
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
        const cuerpo = cliente.respuesta()
        dispatch({
          type: 'setBorrador',
          cambios: {
            envio: {
              roles: e.roles,
              confirmador: e.confirmador,
              clave: e.clave,
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
        await setEstadoEnvioOrden(e.orden.id, ESTADO_ENVIO_OP.enviada).catch(() => {})
        if (!e.reenvio) {
          await setEstadoOrden(e.orden.id, ESTADO_OP.enviada).catch(() => {})
          /* Primer envío de una OP que ya estaba en el tablero: el recordatorio, a 5 días de hoy. */
          await guardarRecordatorio(e.orden.id, fechaRecordatorio(new Date())).catch((err) =>
            console.warn('[envio] no se pudo guardar la fecha de recordatorio', err),
          )
        }
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
        await guardarLink(e.orden)
      }
      marcarEnviado()
      setCerrando(false)
    })()
    // Sólo importa el cambio de fase; el resto se lee de `enCurso`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  /* Lo que salió mal, dicho al lado del botón. */
  const errorCorrida =
    fase !== 'error'
      ? null
      : modo === 'cliente'
        ? cliente.estado.problema || 'No se pudo confirmar el envío por WhatsApp. Reintentá.'
        : (taller.estado.updateError ? htmlATexto(taller.estado.updateError.body) : taller.estado.problema) ||
          'La automatización no confirmó el envío. Reintentá.'


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
          <label htmlFor="op-confirmador">
            {reenvio ? '¿Deseas reasignar al responsable de confirmar la orden?' : 'Responsable de confirmar la orden *'}
          </label>
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
                {modo === 'taller' && taller.estado.vencida ? (
                  /* Pasó el tope de espera: el mensaje es uno solo y dice a quién acudir. */
                  <span>{errorCorrida}</span>
                ) : (
                  <span style={{ whiteSpace: 'pre-line' }}>
                    <strong>No se pudo enviar.</strong> {errorCorrida ?? fallo}
                    {modo === 'taller' && taller.estado.updateError && ` (${fechaHora(taller.estado.updateError.fecha)})`}
                  </span>
                )}
              </p>
            )}
            {modo === 'taller' && fase === 'demorado' && (
              <p className="enviar-aviso enviar-aviso--warn">
                <i className="fas fa-hourglass-half" aria-hidden="true" />
                <span>
                  <strong>Está tardando más de lo normal.</strong>{' '}
                  <button type="button" className="enviar-mas" onClick={() => void taller.seguirEsperando()}>
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
