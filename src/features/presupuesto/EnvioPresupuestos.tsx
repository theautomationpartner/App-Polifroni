import { useEffect, useRef, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EditarCelular } from '@/features/envio/EditarCelular'
import { EstadoEnvioContacto, type EstadoFila } from '@/features/envio/EnviarOp'
import { useEnviarWhatsapp } from '@/features/envio/useEnviarWhatsapp'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import {
  ROLES,
  advertenciasDestino,
  celularValido,
  destinoDe,
  faltantesDestino,
  formatoMonday,
  type Rol,
} from '@/lib/destinatario'
import { datosContacto, esSinArquitecto, etiquetaPresupuesto, nuevaClave, rolesIniciales, textoPresupuestos } from '@/lib/presupuesto'
import { actualizarCelularContacto, type Contacto } from '@/services/monday'
import { MensajePresupuesto } from './MensajePresupuesto'

const COLOR_ROL: Record<Rol, string> = {
  Cliente: 'var(--primary-blue)',
  Constructor: '#575ce5',
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || '?'

const ERROR_RED =
  'Ocurrió un error interno al intentar enviar el presupuesto en la aplicación. No se registró nada en el sistema: volvé a intentar el envío en unos minutos. Si el error persiste, no dude en contactarse con el soporte de TAP.'

/** Lo que sale: el PDF (ya en la app), su tipo, su color y —si el responsable lo confirma— su clave. */
export interface PresupuestoAEnviar {
  id: string
  archivo: File
  tipo: string
  color: string
  /** La clave del enlace de confirmación. Un reintento (o un reenvío) manda la MISMA. */
  clave: string | null
}

/** Lo que salió: a quiénes, cuándo, quién confirma y qué, con la clave de cada presupuesto. */
export interface EnvioHecho {
  roles: Rol[]
  confirmador: Rol | null
  aConfirmar: string[]
  cuando: string
  /** Las claves de los presupuestos a confirmar, por id. */
  claves: Record<string, string>
}

/**
 * El envío de presupuestos por WhatsApp: el mismo bloque "Enviar OP" (`EnviarOp`), con el mismo markup
 * y el mismo comportamiento —medio fijo WhatsApp, la lista de destinatarios con su celular y su
 * estado, corregir el celular sin salir, ver el mensaje, y el botón que pasa a "Enviando…", "Enviado
 * exitosamente" o "Error de Envío"—. Lo usan la etapa 3 de "Crear y Cargar Presupuestos"
 * (`EnviarPresupuesto`) y la fila desplegada de "Consultar y Gestionar Presupuestos".
 *
 * Salen TODOS los presupuestos que recibe: el texto genérico ("Le adjuntamos los presupuestos
 * solicitados..." o, en un reenvío, "Te REENVIAMOS...") y después cada PDF, en su mensaje.
 *
 * La confirmación es OPCIONAL: si se quiere, se elige el responsable y, con más de un presupuesto,
 * cuál confirma. Sólo a él le llega un enlace por presupuesto a confirmar, con su clave. Sale por
 * `/api/whatsapp` (los PDF a Google Drive y los mensajes por 360messenger).
 *
 * No escribe nada en Monday: avisa lo que salió (`onEnviado`) y quien lo usa lo registra.
 */
export function EnvioPresupuestos({
  cliente,
  arquitecto: arquitectoElegido,
  enviarA,
  presupuestos,
  enviado,
  reenvio = false,
  sinContactos = 'Volvé a la etapa anterior y elegí un cliente o un constructor/arquitecto.',
  avisoNoListo = 'No hay presupuestos para enviar: volvé a la etapa anterior y agregá al menos uno',
  onClaves,
  onEnviado,
  onCelular,
  onAConfirmar,
}: {
  cliente: Contacto | null
  arquitecto: Contacto | null
  /** ✋Enviar a de la bolsa: los destinatarios con que arranca (vacío: los contactos que hay). */
  enviarA: string
  presupuestos: PresupuestoAEnviar[]
  /** Ya salió: todo queda fijo y el botón dice "Enviado exitosamente". */
  enviado: boolean
  /** Un reenvío: los textos y el mensaje lo dicen. */
  reenvio?: boolean
  /** Qué hacer si no hay a quién enviarle. */
  sinContactos?: string
  /** Qué falta para poder enviar, si todavía no hay presupuesto (sin punto final). */
  avisoNoListo?: string
  /** Las claves recién generadas, para guardarlas antes de mandar (un reintento manda las mismas). */
  onClaves?: (lista: PresupuestoAEnviar[]) => void
  onEnviado: (e: EnvioHecho) => void
  /** Se corrigió el celular de un contacto (ya quedó en Monday). */
  onCelular: (rol: Rol, celular: string) => void
  onAConfirmar?: (ids: string[]) => void
}) {
  /* "SIN ARQUITECTO" no es una persona: no se le envía (regla del usuario, 13/10/2026). */
  const arquitecto = esSinArquitecto(arquitectoElegido) ? null : arquitectoElegido
  const datos = datosContacto(cliente, arquitecto)
  const wsp = useEnviarWhatsapp(ERROR_RED)
  const que = reenvio ? 'reenviar' : 'enviar'

  const [roles, setRoles] = useState<Rol[]>(() => rolesIniciales(enviarA, !!cliente, !!arquitecto))
  /** Quién confirma: lo elige el usuario si quiere (`null` = sin confirmación). */
  const [confirmadorElegido, setConfirmadorElegido] = useState<Rol | null>(null)
  /** Con más de un presupuesto, cuál confirma: `todos` o el id de uno. */
  const [cual, setCual] = useState<string>('')
  const [verMensaje, setVerMensaje] = useState(false)
  const [editandoCel, setEditandoCel] = useState<Rol | null>(null)
  const [faltan, setFaltan] = useState<{ titulo: string; items: string[] } | null>(null)
  /** Lo que salió en ESTA corrida: el cierre lo usa aunque la pantalla cambie. */
  const enCurso = useRef<Omit<EnvioHecho, 'cuando'> | null>(null)

  const enviando = wsp.enCurso
  useAccionEnCurso(`Esperá a que termine el ${reenvio ? 'reenvío' : 'envío'} del presupuesto.`, enviando)

  const elegidos = roles.map((r) => ({ r, d: destinoDe(datos, r) }))
  const candidatos = ROLES.map((r) => ({ r, d: destinoDe(datos, r) })).filter((c) => c.d.nombre)
  const disponibles = candidatos.filter((c) => !roles.includes(c.r))
  const advertencias = [...new Set(roles.flatMap((r) => advertenciasDestino(datos, r)))]
  const sinDestinatarios = roles.length === 0
  /* El confirmador vigente: el elegido, si sigue en la lista. Sin elegir, no se pide confirmación. */
  const confirmador: Rol | null = confirmadorElegido && roles.includes(confirmadorElegido) ? confirmadorElegido : null
  const varios = presupuestos.length > 1
  /** Los presupuestos que el responsable tiene que confirmar (ninguno sin responsable). */
  const aConfirmar: string[] = !confirmador
    ? []
    : !varios
      ? presupuestos.map((p) => p.id)
      : cual === 'todos'
        ? presupuestos.map((p) => p.id)
        : presupuestos.some((p) => p.id === cual)
          ? [cual]
          : []
  const clavesAConfirmar = aConfirmar.join(',')
  useEffect(() => onAConfirmar?.(aConfirmar), [clavesAConfirmar]) // eslint-disable-line react-hooks/exhaustive-deps
  const sinDocumento = presupuestos.length === 0
  const fase = wsp.estado.fase
  const estadoBoton: 'idle' | 'enviando' | 'enviado' | 'error' = enviado
    ? 'enviado'
    : enviando
      ? 'enviando'
      : fase === 'error'
        ? 'error'
        : 'idle'
  const estadoFila: EstadoFila = enviado ? 'ok' : enviando ? 'enviando' : estadoBoton === 'error' ? 'error' : 'idle'

  const confirmar = () => {
    if (enviando || enviado || sinDocumento) return
    const f = roles.length ? roles.flatMap((r) => faltantesDestino(datos, r)) : faltantesDestino(datos, '')
    if (f.length) {
      setFaltan({ titulo: `Todavía no se puede ${que}`, items: f })
      return
    }
    /* Con responsable y varios presupuestos, hay que decir cuál confirma. */
    if (confirmador && aConfirmar.length === 0) {
      setFaltan({
        titulo: 'Falta indicar qué presupuesto se confirma',
        items: ['Elegí en «¿Qué presupuesto tiene que confirmar?» uno de la lista o «Todos los presupuestos».'],
      })
      return
    }
    /* La clave de cada presupuesto a confirmar: una por presupuesto, fija. Un reintento (o un reenvío
       de uno que ya la tenía) manda el mismo enlace. */
    const lista = presupuestos.map((p) => (aConfirmar.includes(p.id) && !p.clave ? { ...p, clave: nuevaClave() } : p))
    if (lista.some((p, i) => p !== presupuestos[i])) onClaves?.(lista)
    const confirmables = lista
      .filter((p) => aConfirmar.includes(p.id))
      .map((p) => ({
        etiqueta: etiquetaPresupuesto({ nombreArchivo: p.archivo.name, tipo: p.tipo, color: p.color }),
        clave: p.clave,
      }))
    enCurso.current = {
      roles: [...roles],
      confirmador,
      aConfirmar: [...aConfirmar],
      claves: Object.fromEntries(lista.filter((p) => aConfirmar.includes(p.id) && p.clave).map((p) => [p.id, p.clave ?? ''])),
    }
    const [primero, ...resto] = lista
    void wsp.correr(
      {
        documento: 'presupuesto',
        destinos: roles.map((r) => {
          const d = destinoDe(datos, r)
          const confirma = r === confirmador
          /* El texto de quien confirma lleva una marca por presupuesto a confirmar: el servidor pone
             ahí el enlace firmado con su clave. */
          return {
            tipo: d.tipo,
            nombre: d.nombre,
            whatsapp: d.whatsapp,
            confirmador: confirma,
            texto: textoPresupuestos(d.nombre, lista.length, new Date(), confirma ? confirmables : [], reenvio),
          }
        }),
        claves: confirmables.map((c) => c.clave ?? ''),
        reenvio,
        ordenId: null,
        obraId: '',
        numero: '',
        tipo: primero.tipo,
      },
      primero.archivo,
      primero.archivo.name || 'Presupuesto.pdf',
      resto.map((p) => ({ archivo: p.archivo, nombre: p.archivo.name || 'Presupuesto.pdf' })),
    )
  }

  /* Salió: se avisa a quiénes y cuándo. Quien usa el bloque lo registra. */
  useEffect(() => {
    const e = enCurso.current
    if (!e || fase !== 'listo') return
    onEnviado({ ...e, cuando: new Date().toISOString() })
    // Sólo importa el cambio de fase; el resto se lee de `enCurso`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  const errorCorrida = fase === 'error' ? wsp.estado.problema || ERROR_RED : null

  return (
    <div className="card card--neutral card--flush card-pad">
      <h3 className="resumen-title">{reenvio ? 'Reenviar Presupuesto' : 'Enviar Presupuesto'}</h3>

      <div className="igp">
        <div className="envio-medio-fila">
          <span className="envio-medio-lbl">Medio de Envío por defecto:</span>
          <div className="envio-medio-fijo">
            <i className="fab fa-whatsapp" aria-hidden="true" /> WhatsApp
          </div>
        </div>
      </div>

      <div className="igp">
        <label>Destinatarios *</label>
        {candidatos.length === 0 ? (
          <div className="envio-sin-contactos" role="alert">
            <i className="fas fa-triangle-exclamation" />
            <div>
              <div className="envio-sin-contactos-t">No hay a quién {que}le el presupuesto</div>
              <p>{sinContactos}</p>
            </div>
          </div>
        ) : (
          <select
            className="full w-contactos"
            style={{ cursor: 'pointer' }}
            aria-label="Agregar destinatario"
            /* El selector AGREGA a la lista y vuelve a "Agregar…": no es una elección excluyente. */
            value=""
            disabled={enviando || enviado || disponibles.length === 0}
            onChange={(e) => {
              const r = e.target.value as Rol
              if (!r) return
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

      {/* El responsable y, a su derecha, qué presupuesto confirma (uno debajo del otro si no hay ancho). */}
      {elegidos.length > 0 && (
        <div className="pres-confirmar-fila">
          <div className="igp">
            <label>
              {reenvio
                ? '¿Deseás asignar un responsable de confirmar el presupuesto? (opcional)'
                : 'Responsable de confirmar el presupuesto (opcional)'}
            </label>
            <select
              className="full w-contactos"
              style={{ cursor: 'pointer' }}
              aria-label="Responsable de confirmar el presupuesto"
              value={confirmador ?? ''}
              disabled={enviando || enviado}
              onChange={(e) => setConfirmadorElegido((e.target.value || null) as Rol | null)}
            >
              <option value="">Sin confirmación</option>
              {elegidos.map(({ r, d }) => (
                <option key={r} value={r}>
                  {r} ({d.nombre || 'sin nombre'})
                </option>
              ))}
            </select>
          </div>

          {confirmador && varios && (
            <div className="igp">
              <label>¿Qué presupuesto tiene que confirmar? *</label>
              <select
                className={`full w-contactos ${faltan && aConfirmar.length === 0 ? 'is-falta' : ''}`}
                style={{ cursor: 'pointer' }}
                aria-label="Qué presupuesto tiene que confirmar"
                value={cual}
                disabled={enviando || enviado}
                onChange={(e) => setCual(e.target.value)}
              >
                <option value="" disabled>
                  Elegí qué presupuesto confirma…
                </option>
                <option value="todos">Todos los presupuestos ({presupuestos.length})</option>
                {presupuestos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {etiquetaPresupuesto({ nombreArchivo: p.archivo.name, tipo: p.tipo, color: p.color })}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="font-b" style={{ fontSize: 14, marginTop: 24 }}>
        Destinatarios seleccionados ({roles.length})
      </div>
      <div className="selc">
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
                    <button
                      type="button"
                      className="citem-editar"
                      disabled={enviando}
                      title={enviando ? `Esperá a que termine el ${reenvio ? 'reenvío' : 'envío'}` : undefined}
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
                  title={enviado ? 'Ya se envió el presupuesto: no se puede quitar destinatarios' : undefined}
                  onClick={() => setRoles((prev) => prev.filter((x) => x !== r))}
                >
                  🗑️
                </button>
                <EstadoEnvioContacto estado={estadoFila} motivo={errorCorrida ?? undefined} />
              </div>
            </div>
          )
        })}
      </div>
      <button type="button" className="enviar-mas" onClick={() => setVerMensaje(true)}>
        <i className="far fa-comment-dots" /> Ver el mensaje que le llega
      </button>

      <div className="enviar-row">
        <button
          type="button"
          className="btn-block btn-block--enviar btn-mayus"
          style={{
            background: estadoBoton === 'enviado' ? 'var(--green)' : estadoBoton === 'error' ? 'var(--red)' : 'var(--primary-blue)',
            ...(estadoBoton === 'enviado' ? { opacity: 1 } : {}),
          }}
          disabled={enviando || enviado || sinDocumento || sinDestinatarios}
          aria-busy={enviando}
          title={
            enviando || enviado
              ? undefined
              : sinDocumento
                ? avisoNoListo
                : sinDestinatarios
                  ? 'Agregá al menos un destinatario'
                  : estadoBoton === 'error'
                    ? `Tocá para reintentar el ${reenvio ? 'reenvío' : 'envío'}`
                    : undefined
          }
          onClick={confirmar}
        >
          {estadoBoton === 'enviando' ? (
            <>
              <i className="fas fa-circle-notch spin" /> {reenvio ? 'Reenviando...' : 'Enviando...'}
            </>
          ) : estadoBoton === 'enviado' ? (
            <>
              <i className="fas fa-check" /> {reenvio ? 'Reenviado exitosamente' : 'Enviado exitosamente'}
            </>
          ) : estadoBoton === 'error' ? (
            <>
              <i className="fas fa-xmark" /> {reenvio ? 'Error de Reenvío' : 'Error de Envío'}
            </>
          ) : (
            <>
              <i className={`fas ${reenvio ? 'fa-rotate-right' : 'fa-paper-plane'}`} />{' '}
              {reenvio ? 'Confirmar y Reenviar' : 'Confirmar y Enviar'}
            </>
          )}
        </button>

        {sinDocumento && !enviado && (
          <div className="enviar-avisos" role="status" aria-live="polite">
            <p className="enviar-aviso enviar-aviso--err">
              <i className="fas fa-circle-exclamation" aria-hidden="true" />
              <span>
                <strong>{avisoNoListo}.</strong>
              </span>
            </p>
          </div>
        )}
        {!enviado && (advertencias.length > 0 || errorCorrida) && (
          <div className="enviar-avisos" role="status" aria-live="polite">
            {advertencias.map((a) => (
              <p key={a} className="enviar-aviso enviar-aviso--warn">
                <i className="fas fa-triangle-exclamation" aria-hidden="true" />
                <span>{a}</span>
              </p>
            ))}
            {errorCorrida && (
              <p className="enviar-aviso enviar-aviso--err">
                <i className="fas fa-circle-exclamation" aria-hidden="true" />
                <span style={{ whiteSpace: 'pre-line' }}>
                  <strong>No se pudo {que}.</strong> {errorCorrida}
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {editandoCel && (
        <EditarCelular
          rol={editandoCel}
          nombre={destinoDe(datos, editandoCel).nombre}
          actual={destinoDe(datos, editandoCel).whatsapp}
          queSeEnvia="el presupuesto"
          onCerrar={() => setEditandoCel(null)}
          guardar={async (celular) => {
            const c = editandoCel === 'Cliente' ? cliente : arquitecto
            if (!c) throw new Error('No hay a quién actualizarle el celular.')
            await actualizarCelularContacto(editandoCel, c.id, celular)
          }}
          onActualizado={(celular) => onCelular(editandoCel, celular)}
        />
      )}

      {verMensaje && (
        <MensajePresupuesto
          nombres={elegidos.map(({ r, d }) => ({ rol: r, nombre: d.nombre }))}
          confirmador={confirmador}
          presupuestos={presupuestos}
          aConfirmar={aConfirmar}
          reenvio={reenvio}
          onClose={() => setVerMensaje(false)}
        />
      )}

      {faltan && (
        <AvisoModal titulo={faltan.titulo} faltantes={faltan.items} onClose={() => setFaltan(null)}>
          {faltan.items.length > 1
            ? `No se ${reenvio ? 'reenvió' : 'envió'} nada. Corregí lo siguiente y volvé a tocar "${reenvio ? 'Confirmar y Reenviar' : 'Confirmar y Enviar'}":`
            : null}
        </AvisoModal>
      )}
    </div>
  )
}
