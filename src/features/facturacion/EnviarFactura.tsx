import { useEffect, useRef, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EditarCelular } from '@/features/envio/EditarCelular'
import { EstadoEnvioContacto, type EstadoFila } from '@/features/envio/EnviarOp'
import { useEnviarWhatsapp } from '@/features/envio/useEnviarWhatsapp'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { ROLES, advertenciasDestino, celularValido, destinoDe, faltantesDestino, formatoMonday, type DatosContacto, type Rol } from '@/lib/destinatario'
import { importeEscrito, nombreComprobante, textoFactura } from '@/lib/facturacion'
import { actualizarCelularContacto, pdfDelComprobante } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { todosEmitidos, type BorradorFactura } from './borrador'
import { MensajeFactura } from './MensajeFactura'

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
  'Ocurrió un error interno al intentar enviar el comprobante en la aplicación. El comprobante ya está emitido: volvé a intentar el envío en unos minutos. Si el error persiste, no dude en contactarse con el soporte de TAP.'

/** El constructor/arquitecto de las obras elegidas (el primero, si son varios). */
export function constructorDe(f: BorradorFactura) {
  const ids = new Set(f.elegidas.map((e) => e.obraId))
  return f.obras.find((o) => ids.has(o.id) && o.constructor)?.constructor ?? null
}

/** A quiénes se les puede mandar: el cliente de la cuenta y el constructor de las obras. */
export function datosEnvio(f: BorradorFactura): DatosContacto {
  const cons = constructorDe(f)
  return {
    ctaCteCliente: f.cuenta?.nombre ?? '',
    celCliente: f.cuenta?.cliente?.celular ?? '',
    emailCliente: f.cuenta?.cliente?.email ?? '',
    arquitecto: cons?.nombre ?? '',
    celArquitecto: cons?.celular ?? '',
  }
}

/**
 * Los textos de un destinatario: uno por comprobante, cada uno con su monto (el que quedó facturado; antes
 * de emitir, el elegido en la etapa 2).
 */
export function textosDe(f: BorradorFactura, nombre: string, cuando: Date): string[] {
  /* El tipo como lo nombra el tablero ("Factura" / "Nota de Credito"), como en la plantilla de Make. */
  const tipo = nombreComprobante(f.tipo).tipoTablero
  const lista = f.comprobantes.length
    ? f.comprobantes.map((c) => ({ tipo: c.leido?.tipo || tipo, monto: c.leido?.monto ?? c.monto }))
    : f.elegidas.map((e) => ({ tipo, monto: importeEscrito(e.monto) ?? 0 }))
  return lista.map((c) => textoFactura({ nombre, tipo: c.tipo, fecha: cuando, monto: c.monto }))
}

/**
 * El envío de la factura: el mismo bloque "Enviar OP" (`EnviarOp`) y "Enviar Presupuesto", con el mismo
 * markup y comportamiento —medio fijo WhatsApp, la lista de destinatarios con su celular y su estado,
 * corregir el celular sin salir, ver el mensaje, y el botón que pasa a "Enviando…", "Enviado
 * exitosamente" o "Error de Envío"—, SIN responsable de confirmar: la factura no se confirma.
 *
 * Se habilita recién con todos los comprobantes emitidos en ARCA. A cada destinatario le llega, por cada
 * comprobante, el texto de la plantilla y después su PDF. Sale por `/api/whatsapp` (Google Drive y
 * 360messenger), nunca por el escenario de Make del tablero.
 */
export function EnviarFactura() {
  const { factura, enviado } = useApp()
  /* "Factura" o "Nota de Crédito": cómo se nombra lo que sale. */
  const nom = nombreComprobante(factura.tipo)
  const dispatch = useDispatch()
  const datos = datosEnvio(factura)
  const cons = constructorDe(factura)
  const wsp = useEnviarWhatsapp(ERROR_RED)
  const listos = todosEmitidos(factura)

  /** A quiénes se envía: arranca con el cliente; el constructor se agrega desde el selector. */
  const [roles, setRoles] = useState<Rol[]>(() => (datos.ctaCteCliente ? ['Cliente'] : []))
  const [verMensaje, setVerMensaje] = useState(false)
  const [editandoCel, setEditandoCel] = useState<Rol | null>(null)
  const [faltan, setFaltan] = useState<{ titulo: string; items: string[] } | null>(null)
  const [bajando, setBajando] = useState(false)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)
  const enCurso = useRef<Rol[] | null>(null)

  const enviando = wsp.enCurso || bajando
  useAccionEnCurso('Esperá a que termine el envío de la factura.', enviando)

  const elegidos = roles.map((r) => ({ r, d: destinoDe(datos, r) }))
  const candidatos = ROLES.map((r) => ({ r, d: destinoDe(datos, r) })).filter((c) => c.d.nombre)
  const disponibles = candidatos.filter((c) => !roles.includes(c.r))
  const advertencias = [...new Set(roles.flatMap((r) => advertenciasDestino(datos, r)))].filter(
    /* La advertencia del mismo celular habla del enlace de confirmación: la factura no lo lleva. */
    (a) => !a.includes('enlace'),
  )
  const sinDestinatarios = roles.length === 0
  const avisoNoListo = `Primero emití ${nom.articulo}: se envía con el PDF del comprobante`
  const fase = wsp.estado.fase
  const estadoBoton: 'idle' | 'enviando' | 'enviado' | 'error' = enviado
    ? 'enviado'
    : enviando
      ? 'enviando'
      : fase === 'error' || errorPdf
        ? 'error'
        : 'idle'
  const estadoFila: EstadoFila = enviado ? 'ok' : enviando ? 'enviando' : estadoBoton === 'error' ? 'error' : 'idle'

  const confirmar = async () => {
    if (enviando || enviado || !listos) return
    const f = roles.length ? roles.flatMap((r) => faltantesDestino(datos, r)) : faltantesDestino(datos, '')
    if (f.length) {
      setFaltan({ titulo: 'Todavía no se puede enviar', items: f.map((x) => x.replace('la orden', nom.articulo)) })
      return
    }
    /* Los PDF de los comprobantes, tal como los dejó ARCA en el sistema. */
    setErrorPdf(null)
    setBajando(true)
    let pdfs: File[]
    try {
      pdfs = await Promise.all(factura.comprobantes.map((c) => pdfDelComprobante(c.leido!.pdf!)))
    } catch {
      setErrorPdf(`No se pudo leer el PDF de ${nom.articulo} en el sistema. Volvé a intentar el envío en unos segundos.`)
      return
    } finally {
      setBajando(false)
    }
    enCurso.current = [...roles]
    const cuando = new Date()
    const [primero, ...resto] = pdfs
    void wsp.correr(
      {
        documento: 'factura',
        destinos: roles.map((r) => {
          const d = destinoDe(datos, r)
          return { tipo: d.tipo, nombre: d.nombre, whatsapp: d.whatsapp, confirmador: false, textos: textosDe(factura, d.nombre, cuando) }
        }),
        reenvio: false,
        ordenId: null,
        obraId: factura.elegidas[0]?.obraId ?? '',
        numero: '',
        tipo: '',
      },
      primero,
      primero.name || `${nom.titulo}.pdf`,
      resto.map((p) => ({ archivo: p, nombre: p.name || `${nom.titulo}.pdf` })),
    )
  }

  /* Salió: se guarda a quiénes y cuándo, para registrarlo al finalizar. */
  useEffect(() => {
    const e = enCurso.current
    if (!e || fase !== 'listo') return
    dispatch({ type: 'setFactura', cambios: { envio: { roles: e, cuando: new Date().toISOString() } } })
    dispatch({ type: 'setEnviado' })
    // Sólo importa el cambio de fase; el resto se lee de `enCurso`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase])

  const errorCorrida = errorPdf ?? (fase === 'error' ? wsp.estado.problema || ERROR_RED : null)

  return (
    <div className={`card card--neutral card--flush card-pad fac-enviar ${listos ? '' : 'fac-enviar--espera'}`}>
      <h3 className="resumen-title">Enviar {nom.titulo}</h3>

      <div className="igp">
        <div className="envio-medio-fila">
          <span className="envio-medio-lbl">Medio de Envío por defecto:</span>
          <div className="envio-medio-fijo">
            <i className="fab fa-whatsapp" aria-hidden="true" /> WhatsApp
          </div>
        </div>
      </div>

      <div className="igp">
        <label htmlFor="fac-destinatario">Destinatarios *</label>
        {candidatos.length === 0 ? (
          <div className="envio-sin-contactos" role="alert">
            <i className="fas fa-triangle-exclamation" />
            <div>
              <div className="envio-sin-contactos-t">No hay a quién enviarle {nom.articulo}</div>
              <p>La cuenta corriente no tiene un cliente vinculado ni las obras un constructor/arquitecto.</p>
            </div>
          </div>
        ) : (
          <select
            id="fac-destinatario"
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
                    {!d.whatsapp ? 'SIN TELEFONO' : celularValido(d.whatsapp) ? formatoMonday(d.whatsapp) : `TELEFONO INVALIDO (${d.whatsapp})`}
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
                <span className="cbadge ok">{r}</span>
                <button
                  type="button"
                  className="del"
                  aria-label={`Quitar ${d.nombre || r}`}
                  disabled={enviando || enviado}
                  title={enviado ? `Ya se envió ${nom.articulo}: no se puede quitar destinatarios` : undefined}
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
          disabled={enviando || enviado || !listos || sinDestinatarios}
          aria-busy={enviando}
          title={
            enviando || enviado
              ? undefined
              : !listos
                ? avisoNoListo
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
              <i className="fas fa-paper-plane" /> Enviar {nom.titulo}
            </>
          )}
        </button>

        {!listos && !enviado && (
          <div className="enviar-avisos" role="status" aria-live="polite">
            <p className="enviar-aviso enviar-aviso--info">
              <i className="fas fa-circle-info" aria-hidden="true" />
              <span>
                <strong>{avisoNoListo}.</strong> Tocá «Confirmar y emitir {nom.titulo.toLowerCase()}» en el resumen.
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
          queSeEnvia={nom.articulo}
          onCerrar={() => setEditandoCel(null)}
          guardar={async (celular) => {
            const id = editandoCel === 'Cliente' ? factura.cuenta?.cliente?.id : cons?.id
            if (!id) throw new Error('No hay a quién actualizarle el celular.')
            await actualizarCelularContacto(editandoCel, id, celular)
          }}
          onActualizado={(celular) => {
            /* La app sigue con el número nuevo: es el de la ficha de la persona. */
            if (editandoCel === 'Cliente' && factura.cuenta?.cliente) {
              dispatch({
                type: 'setFactura',
                cambios: { cuenta: { ...factura.cuenta, cliente: { ...factura.cuenta.cliente, celular } } },
              })
            } else if (cons) {
              dispatch({
                type: 'setFactura',
                cambios: {
                  obras: factura.obras.map((o) => (o.constructor?.id === cons.id ? { ...o, constructor: { ...o.constructor, celular } } : o)),
                },
              })
            }
          }}
        />
      )}

      {verMensaje && (
        <MensajeFactura nombres={elegidos.map(({ r, d }) => ({ rol: r, nombre: d.nombre }))} onClose={() => setVerMensaje(false)} />
      )}

      {faltan && (
        <AvisoModal titulo={faltan.titulo} faltantes={faltan.items} onClose={() => setFaltan(null)}>
          {faltan.items.length > 1 ? `No se envió nada. Corregí lo siguiente y volvé a tocar "Enviar ${nom.titulo}":` : null}
        </AvisoModal>
      )}
    </div>
  )
}
