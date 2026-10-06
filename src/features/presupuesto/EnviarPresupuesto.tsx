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
import { datosContacto, nuevaClave, rolesIniciales, textoPresupuesto } from '@/lib/presupuesto'
import { actualizarCelularContacto } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
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

/**
 * El envío del presupuesto: el mismo bloque "Enviar OP" (`EnviarOp`), con el mismo markup y el mismo
 * comportamiento —medio fijo WhatsApp, la lista de destinatarios con su celular y su estado, corregir
 * el celular sin salir, ver el mensaje, y el botón que pasa a "Enviando…", "Enviado exitosamente" o
 * "Error de Envío"—.
 *
 * Como en la OP, con los dos destinatarios se elige el "Responsable de confirmar el presupuesto"; con
 * uno solo, confirma ése. Sólo a quien confirma le llega el enlace para confirmarlo, con la clave del
 * presupuesto (`nuevaClave`), que al finalizar queda guardada en el subelemento. Sale por la misma ruta
 * que la OP (`/api/whatsapp`: el PDF a Google Drive y el mensaje por 360messenger), que confirma en la
 * cola que cada mensaje salió.
 *
 * Enviar no escribe nada en Monday: lo que salió queda en el borrador y se registra al finalizar.
 */
export function EnviarPresupuesto({ listo, avisoNoListo }: { listo: boolean; avisoNoListo: string }) {
  const { presupuesto, enviado } = useApp()
  const dispatch = useDispatch()
  const { cliente, arquitecto, bolsa, archivo } = presupuesto
  const datos = datosContacto(cliente, arquitecto)
  const wsp = useEnviarWhatsapp(ERROR_RED)

  /** A quiénes se envía: los que ya tenía la bolsa o, en una nueva, los contactos elegidos. */
  const [roles, setRoles] = useState<Rol[]>(() => rolesIniciales(bolsa?.enviarA ?? '', !!cliente, !!arquitecto))
  /**
   * Quién confirma el presupuesto cuando se envía a los DOS: lo elige el usuario. Con uno solo,
   * confirma ése y no se pregunta.
   */
  const [confirmadorElegido, setConfirmadorElegido] = useState<Rol | null>(null)
  const [verMensaje, setVerMensaje] = useState(false)
  const [editandoCel, setEditandoCel] = useState<Rol | null>(null)
  const [faltan, setFaltan] = useState<{ titulo: string; items: string[] } | null>(null)
  /** Los destinatarios con que salió ESTA corrida: el cierre los usa aunque la pantalla cambie. */
  const enCurso = useRef<{ roles: Rol[]; confirmador: Rol | null } | null>(null)

  const enviando = wsp.enCurso
  useAccionEnCurso('Esperá a que termine el envío del presupuesto.', enviando)

  const elegidos = roles.map((r) => ({ r, d: destinoDe(datos, r) }))
  const candidatos = ROLES.map((r) => ({ r, d: destinoDe(datos, r) })).filter((c) => c.d.nombre)
  const disponibles = candidatos.filter((c) => !roles.includes(c.r))
  const advertencias = [...new Set(roles.flatMap((r) => advertenciasDestino(datos, r)))]
  const sinDestinatarios = roles.length === 0
  const ambos = roles.length === 2
  /* El confirmador vigente: el único destinatario, o el elegido si sigue en la lista. */
  const confirmador: Rol | null =
    roles.length === 1 ? roles[0] : confirmadorElegido && roles.includes(confirmadorElegido) ? confirmadorElegido : null
  const sinDocumento = !listo || !archivo
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
    if (enviando || enviado || sinDocumento || !archivo) return
    const f = roles.length ? roles.flatMap((r) => faltantesDestino(datos, r)) : faltantesDestino(datos, '')
    if (f.length) {
      setFaltan({ titulo: 'Todavía no se puede enviar', items: f })
      return
    }
    /* A los dos sin decir quién confirma: no sale nada. */
    if (ambos && !confirmador) {
      setFaltan({
        titulo: 'Falta indicar quién confirma el presupuesto',
        items: ['Elegí en «Responsable de confirmar el presupuesto» si confirma el cliente o el constructor.'],
      })
      return
    }
    /* La clave del enlace: una por presupuesto. Un reintento manda el mismo enlace. */
    const clave = presupuesto.clave ?? nuevaClave()
    if (!presupuesto.clave) dispatch({ type: 'setPresupuesto', cambios: { clave } })
    enCurso.current = { roles: [...roles], confirmador }
    void wsp.correr(
      {
        documento: 'presupuesto',
        destinos: roles.map((r) => {
          const d = destinoDe(datos, r)
          const confirma = r === confirmador
          /* El texto de quien confirma lleva la marca del enlace: el servidor pone ahí el enlace
             firmado con la clave. */
          return { tipo: d.tipo, nombre: d.nombre, whatsapp: d.whatsapp, confirmador: confirma, texto: textoPresupuesto(d.nombre, new Date(), confirma) }
        }),
        clave,
        reenvio: false,
        ordenId: null,
        obraId: '',
        numero: '',
        tipo: presupuesto.tipo,
      },
      archivo,
      archivo.name || 'Presupuesto.pdf',
    )
  }

  /* Salió: se guarda a quiénes y cuándo, para registrarlo al finalizar. Nada se escribe ahora. */
  useEffect(() => {
    const e = enCurso.current
    if (!e || fase !== 'listo') return
    dispatch({
      type: 'setPresupuesto',
      cambios: { envio: { roles: e.roles, confirmador: e.confirmador, cuando: new Date().toISOString() } },
    })
    dispatch({ type: 'setEnviado' })
    // Sólo importa el cambio de fase; el resto se lee de `enCurso`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  const errorCorrida = fase === 'error' ? wsp.estado.problema || ERROR_RED : null

  return (
    <div className="card card--neutral card--flush card-pad">
      <h3 className="resumen-title">Enviar Presupuesto</h3>

      <div className="igp">
        <div className="envio-medio-fila">
          <span className="envio-medio-lbl">Medio de Envío por defecto:</span>
          <div className="envio-medio-fijo">
            <i className="fab fa-whatsapp" aria-hidden="true" /> WhatsApp
          </div>
        </div>
      </div>

      <div className="igp">
        <label htmlFor="pres-destinatario">Destinatarios *</label>
        {candidatos.length === 0 ? (
          <div className="envio-sin-contactos" role="alert">
            <i className="fas fa-triangle-exclamation" />
            <div>
              <div className="envio-sin-contactos-t">No hay a quién enviarle el presupuesto</div>
              <p>Volvé a la etapa anterior y elegí un cliente o un constructor/arquitecto.</p>
            </div>
          </div>
        ) : (
          <select
            id="pres-destinatario"
            className="full w-contactos"
            style={{ cursor: 'pointer' }}
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

      {ambos && (
        <div className="igp">
          <label htmlFor="pres-confirmador">Responsable de confirmar el presupuesto *</label>
          <select
            id="pres-confirmador"
            className={`full w-contactos ${faltan && !confirmador ? 'is-falta' : ''}`}
            style={{ cursor: 'pointer' }}
            value={confirmador ?? ''}
            disabled={enviando || enviado}
            onChange={(e) => setConfirmadorElegido((e.target.value || null) as Rol | null)}
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
            background:
              estadoBoton === 'enviado' ? 'var(--green)' : estadoBoton === 'error' ? 'var(--red)' : 'var(--primary-blue)',
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
                    ? 'Tocá para reintentar el envío'
                    : undefined
          }
          onClick={confirmar}
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
                  <strong>No se pudo enviar.</strong> {errorCorrida}
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
          onActualizado={(celular) => {
            /* La app sigue con el número nuevo: es el de la ficha de la persona. */
            const cambios =
              editandoCel === 'Cliente'
                ? { cliente: cliente ? { ...cliente, celular } : null }
                : { arquitecto: arquitecto ? { ...arquitecto, celular } : null }
            dispatch({ type: 'setPresupuesto', cambios })
          }}
        />
      )}

      {verMensaje && (
        <MensajePresupuesto
          nombres={elegidos.map(({ r, d }) => ({ rol: r, nombre: d.nombre }))}
          confirmador={confirmador}
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
