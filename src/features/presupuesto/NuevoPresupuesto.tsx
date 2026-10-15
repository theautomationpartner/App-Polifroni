import { useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ModalErrorConsulta } from '@/features/agenda/ModalErrorConsulta'
import { etiquetaEnviarA } from '@/lib/presupuesto'
import type { PresupuestoGestion } from '@/services/monday'
import { useApp } from '@/state/hooks'
import { idFila } from './borrador'
import { DatosPresupuesto } from './DatosPresupuesto'
import { EnvioPresupuestos, type EnvioHecho } from './EnvioPresupuestos'
import { registrarNuevoEnBolsa, type AvanceNuevo } from './registrar'

type Registro = { fase: 'nada' } | { fase: 'registrando' } | { fase: 'ok' } | { fase: 'error' }

/**
 * «+Nuevo» de Consultar y Gestionar Presupuestos (regla del usuario, 15/10/2026): otro presupuesto para
 * una bolsa que ya existe. A la izquierda, los datos del presupuesto (el mismo formulario de la etapa 2
 * de Crear, sin la lista); a la derecha, el envío (el mismo de la etapa 3: destinatarios y, si se
 * quiere, el responsable de confirmar).
 *
 * Sólo se puede enviar con el tipo de carpintería, el color y el PDF. Apenas sale por WhatsApp, se
 * registra en Monday como subelemento de la bolsa (`registrarNuevoEnBolsa`) y la consulta lo suma a la
 * lista de sus presupuestos (`onRegistrado`). Si el registro falla, se reintenta desde acá sin volver a
 * enviar.
 */
export function ModalNuevoPresupuesto({
  bolsa,
  onClose,
  onRegistrado,
  onCelular,
}: {
  bolsa: PresupuestoGestion
  /** `sinRegistrar`: salió por WhatsApp pero no quedó en Monday. */
  onClose: (sinRegistrar: boolean) => void
  onRegistrado: (cambios: { enviarA: string }) => void
  onCelular: (rol: 'Cliente' | 'Constructor', celular: string) => void
}) {
  const { accionEnCurso } = useApp()
  /** El id local del presupuesto: fijo, así la clave que se genere se le queda pegada. */
  const [id] = useState(idFila)
  const [tipo, setTipo] = useState('')
  const [color, setColor] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [clave, setClave] = useState<string | null>(null)
  const [preparando, setPreparando] = useState(false)
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  const [envio, setEnvio] = useState<EnvioHecho | null>(null)
  const [registro, setRegistro] = useState<Registro>({ fase: 'nada' })
  const avance = useRef<AvanceNuevo>({ subitemId: null, pdfSubido: false })

  const enviado = envio !== null
  const completo = !!(tipo && color && archivo)
  const ocupado = preparando || registro.fase === 'registrando' || !!accionEnCurso

  const registrar = async (e: EnvioHecho) => {
    if (!archivo) return
    setRegistro({ fase: 'registrando' })
    const enviarA = etiquetaEnviarA(e.roles)
    try {
      await registrarNuevoEnBolsa({
        bolsa,
        tipo,
        color,
        archivo,
        /* La clave, sólo si se pidió confirmarlo: con ella el enlace encuentra este presupuesto. */
        clave: e.confirmador && e.aConfirmar.includes(id) ? (e.claves[id] ?? clave) : null,
        enviarA,
        cuando: e.cuando,
        avance: avance.current,
      })
      setRegistro({ fase: 'ok' })
      onRegistrado({ enviarA: enviarA || bolsa.enviarA })
    } catch (err) {
      console.warn('[presupuesto] no se pudo registrar el presupuesto nuevo', err)
      setRegistro({ fase: 'error' })
    }
  }

  const cerrar = () => {
    if (ocupado) return
    onClose(enviado && registro.fase !== 'ok')
  }

  return (
    <Modal
      title="Nuevo presupuesto"
      icon={<i className="fas fa-file-circle-plus modal-icon--info" />}
      onClose={cerrar}
      cerrable={!ocupado}
      className="pres-modal-nuevo"
      /* Sin «Volver»: se cierra con la X. Abajo queda sólo el reintento del registro, si hace falta. */
      actions={
        registro.fase === 'error' && envio ? (
          <button type="button" className="btn btn-primary btn-marca" onClick={() => void registrar(envio)}>
            <i className="fas fa-rotate-right" /> Reintentar el registro
          </button>
        ) : undefined
      }
    >
      {/* Los datos y el envío en UN componente, separados sólo por una línea divisoria (como la etapa 2). */}
      <div className="card carga-datos pres-unido pres-nuevo-grid">
        <DatosPresupuesto
          tipo={tipo}
          color={color}
          archivo={archivo}
          bloqueado={enviado}
          listo={
            enviado
              ? { titulo: 'Presupuesto enviado', detalle: [tipo, color].join(' · ') }
              : {
                  titulo: 'Presupuesto cargado',
                  detalle: completo ? `${tipo} · ${color}: listo para enviar` : 'Indicá el tipo de carpintería y el color para poder enviarlo',
                }
          }
          onCambiar={(c) => {
            if (c.tipo !== undefined) setTipo(c.tipo)
            if (c.color !== undefined) setColor(c.color)
            if (c.archivo !== undefined) setArchivo(c.archivo)
          }}
          onPreparando={setPreparando}
          onErrorMonday={setErrorMonday}
        />

        <div className="pres-unido-envio">
          <EnvioPresupuestos
            cliente={bolsa.cliente}
            arquitecto={bolsa.arquitecto}
            enviarA={bolsa.enviarA}
            presupuestos={completo && archivo ? [{ id, archivo, tipo, color, clave }] : []}
            enviado={enviado}
            avisoNoListo="Para enviarlo, indicá el tipo de carpintería y el color y cargá el PDF del presupuesto"
            sinContactos="El presupuesto no tiene un cliente ni un constructor/arquitecto vinculado: vinculalo en Monday."
            onClaves={(l) => setClave(l[0]?.clave ?? clave)}
            onEnviado={(e) => {
              setEnvio(e)
              void registrar(e)
            }}
            onCelular={onCelular}
          />
        </div>
      </div>

      {registro.fase !== 'nada' && (
        <p
          className={`cobro-bloqueo-inline ${registro.fase === 'ok' ? 'cobro-bloqueo-inline--ok' : ''} pres-nuevo-estado`}
          role="status"
          aria-live="polite"
        >
          {registro.fase === 'registrando' && (
            <>
              <i className="fas fa-circle-notch spin" /> Registrando el presupuesto en el sistema...
            </>
          )}
          {registro.fase === 'ok' && (
            <>
              <i className="fas fa-circle-check" /> El presupuesto se envió y quedó en la lista de {bolsa.nombre}.
            </>
          )}
          {registro.fase === 'error' && (
            <>
              <i className="fas fa-circle-exclamation" /> El presupuesto YA se envió por WhatsApp, pero no se pudo registrar en Monday.
              Tocá «Reintentar el registro» en unos segundos.
            </>
          )}
        </p>
      )}

      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
    </Modal>
  )
}
