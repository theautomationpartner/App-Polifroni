import { useEffect, useRef, useState } from 'react'
import { CargandoAcceso, MuroAcceso } from '@/components/ui/PantallaAcceso'
import { MfaGuard } from '@/components/ui/MfaGuard'
import { ModalErrorMonday } from '@/components/ui/ModalErrorMonday'
import { ModalErrorSeguridad } from '@/components/ui/ModalErrorSeguridad'
import { CierreOperacion } from '@/components/ui/CierreOperacion'
import { EnviarOpView } from '@/features/envio/EnviarOpView'
import { SeleccionarOpView } from '@/features/envio/SeleccionarOpView'
import { InicioView, ProduccionInicioView } from '@/features/inicio/InicioView'
import { ListadoView } from '@/features/listado/ListadoView'
import { CrearTurnoClienteView } from '@/features/agenda/CrearTurnoClienteView'
import { CrearTurnoDatosView } from '@/features/agenda/CrearTurnoDatosView'
import { CrearTurnoRegistrarView } from '@/features/agenda/CrearTurnoRegistrarView'
import { GestionarTurnosView } from '@/features/agenda/GestionarTurnosView'
import { conDestinatario } from '@/features/presupuesto/borrador'
import { CargarPresupuestoView } from '@/features/presupuesto/CargarPresupuestoView'
import { GestionarPresupuestosView } from '@/features/presupuesto/GestionarPresupuestosView'
import { PresupuestoDestinatarioView } from '@/features/presupuesto/PresupuestoDestinatarioView'
import { VidriosObraView } from '@/features/vidrios/VidriosObraView'
import { VidriosSeleccionView } from '@/features/vidrios/VidriosSeleccionView'
import { VidriosSolicitudView } from '@/features/vidrios/VidriosSolicitudView'
import { ObrasView } from '@/features/obras/ObrasView'
import { CargarHetmoView } from '@/features/op/CargarHetmoView'
import { CargarOpView } from '@/features/op/CargarOpView'
import { EmitirEnviarView } from '@/features/op/EmitirEnviarView'
import { EditarBuscarView } from '@/features/editar/EditarBuscarView'
import { EditarDibujoView } from '@/features/editar/EditarDibujoView'
import { EditarEnviarView } from '@/features/editar/EditarEnviarView'
import { tipoDe } from '@/lib/pasos'
import { puedeOperar } from '@/lib/permisos'
import { useErrorSeguridad } from '@/hooks/useErrorSeguridad'
import { bloqueaLaApp, notificarErrorSeguridad } from '@/lib/errorSeguridad'
import { enMonday, getSessionToken, resumenSessionToken } from '@/lib/mondayAuth'
import { estadoSegundoFactor } from '@/services/mfa'
import { getUsuarioActual, getUsuarios } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { areaPermitida, type AppState } from '@/state/appState'

/**
 * Qué pantalla corresponde. La tercera etapa y la segunda cambian según a quién se envía y el tipo
 * de obra (ver `lib/pasos`): al cliente, PVC carga HETMO y emite; Aluminio carga el PDF y envía; al
 * taller se elige una OP confirmada y se envía.
 */
function vistaDe({ proceso, operacion, destino, paso, obra, turno, presupuesto, edicion, usuario }: AppState): () => JSX.Element {
  /* Lo que el team del usuario no habilita no se dibuja, llegue como llegue (ver `lib/permisos`). */
  if (proceso === null || !areaPermitida(proceso, usuario?.roles)) return InicioView
  if (operacion === null || !puedeOperar(usuario?.roles, operacion)) return ProduccionInicioView
  /* Presupuesto · Crear y Cargar: a quién (o qué bolsa abierta), y el presupuesto con su envío. Sin
     a quién mandarlo no hay etapa 2 que dibujar. */
  /* Presupuesto · Consultar y Gestionar: una sola pantalla, la tabla de los que siguen abiertos. */
  if (operacion === 'gestionarPresupuestos') return GestionarPresupuestosView
  if (operacion === 'presupuestos') {
    return paso === 'obra' || !conDestinatario(presupuesto) ? PresupuestoDestinatarioView : CargarPresupuestoView
  }
  /* Agenda: crear un turno (cliente, datos, registro) o gestionar los que ya están. */
  if (operacion === 'gestionarTurnos') return GestionarTurnosView
  if (operacion === 'crearTurno') {
    if (!turno.cliente || paso === 'obra') return CrearTurnoClienteView
    /* El registro necesita los datos completos: si se cambió el tipo y se saltó con el stepper, la
       obra elegida ya no vale y se vuelve a los datos. */
    const completo = Boolean(turno.elementos && turno.tipo && turno.elementoId)
    return paso === 'carga' || !completo ? CrearTurnoDatosView : CrearTurnoRegistrarView
  }
  if (operacion === 'consultar') return ListadoView
  /* Editar OP: la orden, el dibujo nuevo (la IA detecta qué cambió) y el envío de la OP final nueva
     (sólo con ella generada). */
  if (operacion === 'editar') {
    if (!edicion.orden || paso === 'obra') return EditarBuscarView
    return paso === 'envio' && edicion.generada && edicion.obra ? EditarEnviarView : EditarDibujoView
  }
  /* Solicitud de cortes de vidrio: la obra, los vidrios de sus OP en el taller, la solicitud. */
  if (operacion === 'vidrios') {
    if (!obra || paso === 'obra') return VidriosObraView
    return paso === 'carga' ? VidriosSeleccionView : VidriosSolicitudView
  }
  /* Sin obra (o sin a quién enviar) no hay etapa 2 ni 3 que dibujar: cualquier paso cae en la obra. */
  if (!obra || !destino || paso === 'obra') return ObrasView
  const pvc = tipoDe(obra) === 'PVC'
  /* Al taller se elige una orden confirmada de la tabla; al cliente se carga una nueva. */
  if (paso === 'carga') {
    return destino === 'taller' ? SeleccionarOpView : pvc ? CargarHetmoView : CargarOpView
  }
  return destino === 'cliente' && pvc ? EmitirEnviarView : EnviarOpView
}

export function App() {
  const estado = useApp()
  const { proceso, paso, usuario, exito } = estado
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
        /* Sin team con permisos la app no se abre. En producción ya lo cortó el servidor con un 403;
           esto lo cubre en local, donde los roles salen de los teams de `me`. */
        if (!usuario?.roles.length) {
          notificarErrorSeguridad(usuario?.equipos.length ? 'sinRol' : 'sinEquipo', 403)
          setAcceso('rechazado')
          return
        }
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

  const Vista = vistaDe(estado)

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
          <p className="mfa-texto">
            {errorSeguridad?.clase === 'sinEquipo'
              ? 'Tu usuario no está asignado a ningún team dentro de la aplicación. Pedile a un administrador que te agregue en Monday.'
              : errorSeguridad?.clase === 'sinRol'
                ? 'Tu team de Monday no tiene permisos asignados en la aplicación. Pedile a un administrador que te agregue al team que corresponde.'
                : 'Abrí la aplicación desde Monday. Si ya estás ahí, recargá la página.'}
          </p>
        </MuroAcceso>
      )}
      {acceso === 'mfa' && <MfaGuard onListo={() => setAcceso('permitido')} />}
      {/* Cada operación termina acá: qué se hizo, y a dónde seguir. Lo cargado se descarta en los dos
          casos; "otra operación" se queda en el área. */}
      {exito && (
        <CierreOperacion
          texto={exito.texto}
          detalle={exito.detalle}
          onInicio={() => dispatch({ type: 'reset' })}
          onOtraOperacion={() => dispatch({ type: 'setProceso', proceso: proceso ?? 'obras' })}
        />
      )}
      {/* Un solo aviso a la vez, y el de seguridad manda: el otro invita a reintentar, y un rechazo
          del borde no se arregla reintentando. */}
      {errorSeguridad && avisoVisible ? <ModalErrorSeguridad error={errorSeguridad} /> : <ModalErrorMonday />}
    </div>
  )
}
