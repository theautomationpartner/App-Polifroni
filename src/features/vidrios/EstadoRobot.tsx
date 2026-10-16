/**
 * Por dónde va lo que pasa después de "Generar orden de compra": se guarda en la OP y el robot de
 * Tempoglass entra, abre Obras y busca la obra. Va en el pie, al lado de "Volver", y cambia en vivo
 * con cada aviso del servidor, para que se vea qué hace el robot por detrás y dónde falló si falla.
 */
export type EstadoRobot =
  | { fase: 'guardando' }
  | { fase: 'sesion' }
  | { fase: 'logueado' }
  | { fase: 'buscando'; nombre: string }
  | { fase: 'seleccionada'; nombre: string; id: string }
  | { fase: 'noEncontrada'; nombre: string }
  | { fase: 'error'; texto: string }

/** El error de cada paso del robot, dicho para quien está usando la app. */
const FALLA_DEL_PASO: Record<string, string> = {
  credenciales: 'Faltan las credenciales de Tempoglass en el servidor',
  login: 'No se pudo iniciar sesión en Tempoglass',
  obras: 'No se pudo abrir Obras en Tempoglass',
  buscar: 'Falló la búsqueda en Tempoglass',
  conexion: 'Tempoglass no respondió',
}

export function errorDelPaso(paso: string, mensaje: string): EstadoRobot {
  return { fase: 'error', texto: `${FALLA_DEL_PASO[paso] ?? 'Error en Tempoglass'}: ${mensaje}` }
}

function presentar(e: EstadoRobot): { texto: string; icono: string; tono: 'curso' | 'ok' | 'error' } {
  switch (e.fase) {
    case 'guardando':
      return { texto: 'Guardando la orden de compra en la OP...', icono: 'fas fa-circle-notch spin', tono: 'curso' }
    case 'sesion':
      return { texto: 'Tempoglass · Iniciando sesión...', icono: 'fas fa-circle-notch spin', tono: 'curso' }
    case 'logueado':
      return { texto: 'Tempoglass · Logueado', icono: 'fas fa-circle-notch spin', tono: 'curso' }
    case 'buscando':
      return { texto: `Tempoglass · Buscando obra «${e.nombre}»...`, icono: 'fas fa-circle-notch spin', tono: 'curso' }
    case 'seleccionada':
      return { texto: `Tempoglass · Obra seleccionada: ${e.nombre} (Id ${e.id})`, icono: 'fas fa-check', tono: 'ok' }
    case 'noEncontrada':
      return { texto: `Tempoglass · No se encontró la obra «${e.nombre}»`, icono: 'fas fa-xmark', tono: 'error' }
    case 'error':
      return { texto: e.texto, icono: 'fas fa-triangle-exclamation', tono: 'error' }
  }
}

export function EstadoRobotPill({ estado }: { estado: EstadoRobot }) {
  const { texto, icono, tono } = presentar(estado)
  return (
    <div className={`vid-robot vid-robot--${tono}`} role="status" aria-live="polite" title={texto}>
      <i className={icono} />
      <span>{texto}</span>
    </div>
  )
}
