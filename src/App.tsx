import { useEffect, useRef, useState } from 'react'
import { CargandoAcceso, MuroAcceso } from '@/components/ui/PantallaAcceso'
import { MfaGuard } from '@/components/ui/MfaGuard'
import { ModalErrorMonday } from '@/components/ui/ModalErrorMonday'
import { ModalErrorSeguridad } from '@/components/ui/ModalErrorSeguridad'
import { ConfirmacionView } from '@/features/envio/ConfirmacionView'
import { EnvioClienteView } from '@/features/envio/EnvioClienteView'
import { InicioView } from '@/features/inicio/InicioView'
import { ListadoView } from '@/features/listado/ListadoView'
import { ObrasView } from '@/features/obras/ObrasView'
import { EtmoView } from '@/features/op/EtmoView'
import { useErrorSeguridad } from '@/hooks/useErrorSeguridad'
import { bloqueaLaApp, notificarErrorSeguridad } from '@/lib/errorSeguridad'
import { enMonday, getSessionToken, resumenSessionToken } from '@/lib/mondayAuth'
import { estadoSegundoFactor } from '@/services/mfa'
import { getUsuarioActual, getUsuarios } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Paso } from '@/types'

/** Una vista por etapa. El orden de las etapas vive en `appState`, no acá. */
const VISTAS: Record<Paso, () => JSX.Element> = {
  obra: ObrasView,
  etmo: EtmoView,
  envio: EnvioClienteView,
  confirmacion: ConfirmacionView,
}

export function App() {
  const { proceso, paso, obra, listado, usuario } = useApp()
  const dispatch = useDispatch()
  const scrollRef = useRef<HTMLDivElement>(null)
  const { error: errorSeguridad, visible: avisoVisible } = useErrorSeguridad()
  /* Tapada mientras el rechazo siga en pie, aunque se cierre el aviso: el "Entendido" baja el
     cartel, no abre la puerta. De un rechazo del borde se sale recargando, no insistiendo. */
  const bloqueada = errorSeguridad !== null && bloqueaLaApp(errorSeguridad.clase)

  /*
   * ── La secuencia de tres pasos (la misma de La Batea) ──
   *
   * Nada de la app se dibuja hasta superarlos, y en este orden:
   *
   *   1. LISTA BLANCA. Se pide el `sessionToken` a Monday y se consulta `/api/usuario`, que verifica
   *      la firma y busca al usuario en el tablero privado de la lista blanca.
   *   2. EL USUARIO. El habilitado queda en el estado global: es quien aparece en el encabezado y
   *      quien queda como responsable de las OP que emita.
   *   3. MURO DEL SEGUNDO FACTOR. Se dibuja únicamente `MfaGuard`, hasta que el backend confirme el
   *      código de seis dígitos o valide el dispositivo de la jornada.
   *
   * El estado arranca resuelto —no en un efecto— para que el primer pintado ya sepa la respuesta: a
   * quien abrió el enlace fuera de Monday no se le muestra ni por un instante lo que hay adentro.
   * En desarrollo (`npm run dev`) no hay iframe ni funciones serverless: las capas no existen.
   */
  const [acceso, setAcceso] = useState<'verificando' | 'mfa' | 'permitido' | 'rechazado'>(() =>
    import.meta.env.DEV || enMonday() ? 'verificando' : 'rechazado',
  )

  /* Fuera del iframe no hay a quién preguntarle: el rechazo ya es la respuesta. Se avisa una sola
     vez, al montar. */
  useEffect(() => {
    if (!import.meta.env.DEV && !enMonday()) notificarErrorSeguridad('fueraDeMonday', 401)
  }, [])

  useEffect(() => {
    if (acceso !== 'verificando') return
    let vivo = true

    /* Antes de salir a la red: ¿Monday entregó una sesión? Si no, el problema es la instalación de
       la app y no el usuario, y pedir un alta no lo resolvería. */
    void (async () => {
      const sesion = await getSessionToken()
      if (!vivo) return
      if (!sesion && !import.meta.env.DEV) {
        notificarErrorSeguridad('sinSesionDeMonday', 401)
        setAcceso('rechazado')
        return
      }

      try {
        /* PASO 1 · una sola consulta contesta si el borde deja pasar y quién es el usuario. No exige
           el segundo factor: es el paso 1, y exigir el 3 acá haría imposible llegar al muro. */
        const usuario = await getUsuarioActual()
        if (!vivo) return
        /* PASO 2 · el usuario habilitado queda en el estado global. */
        dispatch({ type: 'setUsuario', usuario })

        /* PASO 3 · el segundo factor. Con el dispositivo de la jornada vigente no se pregunta nada;
           si el backend todavía no lo exige, la capa está apagada y se pasa de largo. */
        const mfa = await estadoSegundoFactor().catch(() => null)
        if (!vivo) return
        /* Si el estado no se pudo leer se muestra el muro igual: ante la duda, se pregunta. */
        const haceFalta = mfa === null || (mfa.exigido && !mfa.dispositivoConfiable)
        setAcceso(haceFalta ? 'mfa' : 'permitido')
      } catch {
        if (!vivo) return
        /* La sesión llegó y el servidor la rechazó. Sin los logs del servidor, esto es lo único que
           permite distinguir un secreto que no corresponde de un token con otra forma. No se
           imprime el token ni su firma: sólo su forma. */
        if (sesion) {
          console.warn(
            '[seguridad] el servidor rechazó la sesión · ' + JSON.stringify(resumenSessionToken(sesion)),
          )
        }
        /* En desarrollo un fallo acá no es "no autorizado": ese control no existe en localhost. */
        setAcceso(import.meta.env.DEV ? 'permitido' : 'rechazado')
      }
    })()

    return () => {
      vivo = false
    }
  }, [acceso, dispatch])

  /* La lista del selector de usuario, sólo para el admin —el único que puede elegir— y recién con
     el acceso confirmado: antes, los pedidos darían 403. */
  const esAdmin = Boolean(usuario?.isAdmin)
  useEffect(() => {
    if (acceso !== 'permitido' || !esAdmin) return
    let vivo = true
    getUsuarios()
      .then((us) => vivo && dispatch({ type: 'setUsuarios', usuarios: us }))
      .catch(() => vivo && dispatch({ type: 'setUsuarios', usuarios: [] }))
    return () => {
      vivo = false
    }
  }, [acceso, esAdmin, dispatch])

  // Cada etapa arranca desde arriba, como en una navegación real.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [paso, proceso])

  /* Sin obra elegida no hay ninguna etapa que dibujar: cualquier paso cae en la lista. Es una
     salvaguarda, no un camino: el estado ya vuelve solo a `obra` cuando se sale de una. */
  /* El listado es una consulta dentro del proceso: se abre desde el selector de acción y se sale
     con cualquier otra acción. Por eso gana sobre `paso`, que describe el circuito. */
  const Vista =
    proceso === null
      ? InicioView
      : listado
        ? ListadoView
        : !obra && paso !== 'obra'
          ? ObrasView
          : VISTAS[paso]

  return (
    <div className="scroll" ref={scrollRef}>
      {/* La app se dibuja SÓLO con los tres pasos superados. */}
      {acceso === 'permitido' && !bloqueada && <Vista />}
      {acceso === 'verificando' && <CargandoAcceso mensaje="Verificando acceso" />}
      {/* Rechazado: el aviso de seguridad va sobre el mismo fondo con la marca, no sobre una pantalla
          en blanco que parece rota. */}
      {(acceso === 'rechazado' || (acceso === 'permitido' && bloqueada)) && (
        /* Si se cierra el aviso, la tarjeta no queda vacía: dice qué pasó y qué hacer. */
        <MuroAcceso>
          <h2 className="mfa-titulo">Acceso no disponible</h2>
          <p className="mfa-texto">Abrí la aplicación desde Monday. Si ya estás ahí, recargá la página.</p>
        </MuroAcceso>
      )}
      {acceso === 'mfa' && <MfaGuard onListo={() => setAcceso('permitido')} />}
      {/* Un solo aviso a la vez, y el de seguridad manda: el otro invita a reintentar, y un rechazo
          del borde no se arregla reintentando. */}
      {errorSeguridad && avisoVisible ? <ModalErrorSeguridad error={errorSeguridad} /> : <ModalErrorMonday />}
    </div>
  )
}
