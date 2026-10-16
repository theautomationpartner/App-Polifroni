import type { AvanceTempoglass } from '@/services/tempoglass'

/**
 * Por dónde va lo que pasa después de "Generar orden de compra": se guarda en la OP, el robot carga
 * el pedido en Tempoglass (obra, cabecera, planilla, cierre) y se registra en Monday. Va en el pie,
 * al lado de "Volver", y cambia en vivo con cada aviso del servidor, para que se vea qué hace el robot
 * por detrás y dónde falló si falla.
 */
export type EstadoRobot =
  | { fase: 'guardando' }
  | { fase: 'sesion' }
  | { fase: 'logueado' }
  | { fase: 'buscando'; nombre: string }
  | { fase: 'obraSeleccionada'; nombre: string; id: string }
  | { fase: 'creandoObra'; nombre: string }
  | { fase: 'creandoPedido' }
  | { fase: 'pedidoCreado'; pedido: string }
  | { fase: 'importando'; pedido: string }
  | { fase: 'importado'; renglones: number }
  | { fase: 'cerrando'; pedido: string }
  | { fase: 'registrando' }
  | { fase: 'reintentando'; intento: number; de: number; motivo: string }
  | { fase: 'listo'; pedido: string; renglones: number }
  | { fase: 'error'; texto: string }

/** Lo que muestra el pie para cada aviso que manda el robot. */
export function estadoDeAvance(a: AvanceTempoglass): EstadoRobot {
  switch (a.etapa) {
    case 'sesion':
    case 'logueado':
    case 'creandoPedido':
      return { fase: a.etapa }
    case 'buscando':
    case 'creandoObra':
      return { fase: a.etapa, nombre: a.nombre }
    case 'obraSeleccionada':
      return { fase: 'obraSeleccionada', nombre: a.obra.nombre, id: a.idIntObra }
    case 'pedidoCreado':
    case 'importando':
    case 'cerrando':
      return { fase: a.etapa, pedido: a.pedido }
    case 'importado':
      return { fase: 'importado', renglones: a.renglones }
    case 'reintentando':
      return { fase: 'reintentando', intento: a.intento, de: a.de, motivo: a.motivo }
  }
}

/** El error de cada paso del robot, dicho para quien está usando la app. */
const FALLA_DEL_PASO: Record<string, string> = {
  credenciales: 'Faltan las credenciales de Tempoglass en el servidor',
  login: 'No se pudo iniciar sesión en Tempoglass',
  obras: 'No se pudo abrir Obras en Tempoglass',
  buscar: 'No se encontró la obra en Tempoglass',
  obra: 'No se pudo abrir o crear la obra en Tempoglass',
  pedido: 'No se pudo crear el pedido en Tempoglass',
  importar: 'No se pudo importar la planilla en Tempoglass',
  cerrar: 'No se pudo cerrar el pedido en Tempoglass',
  conexion: 'Tempoglass no respondió',
  robot: 'Falló el robot de Tempoglass',
}

export function errorDelPaso(paso: string, mensaje: string): EstadoRobot {
  return { fase: 'error', texto: `${FALLA_DEL_PASO[paso] ?? 'Error en Tempoglass'}: ${mensaje}` }
}

/** ¿Está corriendo algo? Mientras tanto no se regenera ni se reintenta. */
export const robotEnCurso = (e: EstadoRobot | null): boolean => e !== null && e.fase !== 'listo' && e.fase !== 'error'

/**
 * Lo que ve la persona: UN solo mensaje mientras corre, con el relojito, aunque por detrás el robot
 * pase por una docena de pasos —se suceden en segundos y, uno por uno, no se alcanzan a leer—. Al
 * terminar, la tilde en verde; si algo falla, en rojo y diciendo dónde (`errorDelPaso`). Los pasos
 * finos siguen existiendo (`EstadoRobot`): deciden qué se retoma en un reintento.
 */
function presentar(e: EstadoRobot): { texto: string; icono: string; tono: 'curso' | 'ok' | 'error' } {
  switch (e.fase) {
    case 'listo':
      return { texto: `Pedido ${e.pedido} generado en Tempoglass y Monday`, icono: 'fas fa-check', tono: 'ok' }
    case 'error':
      return { texto: e.texto, icono: 'fas fa-triangle-exclamation', tono: 'error' }
    default:
      return { texto: 'Generando pedido en Tempoglass...', icono: 'fas fa-hourglass-half vid-reloj', tono: 'curso' }
  }
}

/** `onReintentar`: si falló, se ofrece retomar desde acá (sin repetir lo que ya quedó hecho). */
export function EstadoRobotPill({ estado, onReintentar }: { estado: EstadoRobot; onReintentar?: () => void }) {
  const { texto, icono, tono } = presentar(estado)
  return (
    <div className={`vid-robot vid-robot--${tono}`} role="status" aria-live="polite" title={texto}>
      <i className={icono} />
      <span>{texto}</span>
      {tono === 'error' && onReintentar && (
        <button type="button" className="vid-robot-reintentar" onClick={onReintentar}>
          <i className="fas fa-rotate-right" /> Reintentar
        </button>
      )}
    </div>
  )
}
