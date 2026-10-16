/**
 * Recuperar la operación después de recargar la app por un módulo que no se pudo bajar.
 *
 * Pasa cuando la pestaña quedó con una versión vieja y se publicó una nueva: al generar la OP final,
 * el navegador pide un archivo del generador de PDFs que el servidor ya no tiene. En vez de perder lo
 * cargado, la pantalla guarda una foto del trabajo, recarga la app (sólo el iframe, que baja la
 * versión vigente) y al volver se restaura y se sigue desde el armado del PDF, sin volver a leer con
 * la IA.
 *
 * Dos lugares, porque cumplen dos papeles:
 *   - `sessionStorage` · la bandera `refresh`. Es síncrona: el acceso decide el primer pintado con
 *     ella (pantalla en blanco en vez de "Verificando acceso").
 *   - IndexedDB · la foto. Es la única que guarda archivos (`File`): el PDF de HETMO, la OP final.
 *
 * Todo puede fallar (almacenamiento bloqueado en el iframe, modo incógnito, cuota): nada de esto
 * lanza. Quien llama decide qué hacer con un `false` o un `null`, y nunca se promete una
 * recuperación que no se puede cumplir.
 */
import type { AppState } from '@/state/appState'
import type { LecturaListado } from '@/services/ia/hetmo'

/** El motivo de `useAccionEnCurso` mientras se genera la OP final: el único caso que se recupera. */
export const MOTIVO_GENERAR_OP = 'Esperá a que termine la generación de la OP.'

/** Sube con cada cambio en la forma del estado: una foto de otra versión no se restaura. */
const VERSION = 1
/** Una foto más vieja que esto ya no es "la operación que se cortó recién". */
const VIGENCIA_MS = 10 * 60_000
/** Dos recargas en este lapso es un bucle: el módulo sigue sin bajar y recargar no lo arregla. */
const ENTRE_RECARGAS_MS = 60_000

const CLAVE_REFRESH = 'polifroni:refresh'
const BASE = 'polifroni'
const STORE = 'recuperacion'
const CLAVE_FOTO = 'operacion'

/** Lo que es de la sesión se vuelve a validar en cada arranque: no viaja en la foto. */
type FueraDeLaFoto = 'usuario' | 'usuarios' | 'responsableId' | 'accionEnCurso' | 'exito' | 'errorMonday' | 'reanudar'
export type TrabajoGuardado = Omit<AppState, FueraDeLaFoto>

/** El trabajo del estado, sin lo que es de la sesión. */
export function trabajoDe(estado: AppState): TrabajoGuardado {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { usuario, usuarios, responsableId, accionEnCurso, exito, errorMonday, reanudar, ...trabajo } = estado
  return trabajo
}

export interface Foto {
  version: number
  usuarioId: string
  /** epoch ms. */
  cuando: number
  trabajo: TrabajoGuardado
  /** La lectura de la IA con que se iba a armar la OP final. */
  lectura: LecturaListado
}

/* ── La bandera ─────────────────────────────────────────────────────────── */

function leerRefresh(): number | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_REFRESH)
    const cuando = crudo ? Number(JSON.parse(crudo)?.cuando) : NaN
    return Number.isFinite(cuando) ? cuando : null
  } catch {
    return null
  }
}

export function marcarRefresh(): boolean {
  try {
    sessionStorage.setItem(CLAVE_REFRESH, JSON.stringify({ cuando: Date.now() }))
    return true
  } catch {
    return false
  }
}

/** ¿La app arranca de una recarga para recuperar la operación? */
export const hayRefresh = (): boolean => leerRefresh() !== null

/**
 * Baja la bandera. La hora de la recarga queda aparte: es lo que frena una segunda recarga
 * automática si el módulo vuelve a fallar enseguida.
 */
export function consumirRefresh() {
  const cuando = leerRefresh()
  try {
    sessionStorage.removeItem(CLAVE_REFRESH)
    if (cuando !== null) sessionStorage.setItem(`${CLAVE_REFRESH}:ultima`, String(cuando))
  } catch {
    /* sin almacenamiento no hay bandera que bajar */
  }
}

/** ¿Ya se recargó hace menos de un minuto? Entonces no se recarga otra vez: se avisa. */
export function recargoHacePoco(): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(`${CLAVE_REFRESH}:ultima`) ?? leerRefresh())
    return Number.isFinite(ultima) && ultima > 0 && Date.now() - ultima < ENTRE_RECARGAS_MS
  } catch {
    return false
  }
}

/* ── La foto ────────────────────────────────────────────────────────────── */

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const pedido = indexedDB.open(BASE, 1)
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(STORE)
    pedido.onsuccess = () => ok(pedido.result)
    pedido.onerror = () => mal(pedido.error)
    pedido.onblocked = () => mal(new Error('IndexedDB bloqueada'))
  })
}

async function conStore<T>(modo: IDBTransactionMode, hacer: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrirBase()
  try {
    return await new Promise<T>((ok, mal) => {
      const tx = db.transaction(STORE, modo)
      const pedido = hacer(tx.objectStore(STORE))
      tx.oncomplete = () => ok(pedido.result)
      tx.onerror = () => mal(tx.error)
      tx.onabort = () => mal(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function guardarFoto(usuarioId: string, trabajo: TrabajoGuardado, lectura: LecturaListado): Promise<boolean> {
  const foto: Foto = { version: VERSION, usuarioId, cuando: Date.now(), trabajo, lectura }
  try {
    await conStore('readwrite', (s) => s.put(foto, CLAVE_FOTO))
    return true
  } catch (e) {
    console.warn('[recuperacion] no se pudo guardar la operación', e)
    return false
  }
}

/** Lee la foto y la borra (es de un solo uso). Sólo la devuelve si es de este usuario, reciente y de esta versión. */
export async function tomarFoto(usuarioId: string): Promise<Foto | null> {
  try {
    const foto = await conStore<Foto | undefined>('readonly', (s) => s.get(CLAVE_FOTO))
    await conStore('readwrite', (s) => s.delete(CLAVE_FOTO))
    if (!foto || foto.version !== VERSION || foto.usuarioId !== usuarioId) return null
    if (Date.now() - foto.cuando > VIGENCIA_MS) return null
    return foto
  } catch (e) {
    console.warn('[recuperacion] no se pudo leer la operación guardada', e)
    return null
  }
}

/* ── La recarga ─────────────────────────────────────────────────────────── */

let recargaProgramada = false

/** ¿La salida es la recarga de la recuperación? Entonces no se pregunta "¿salir del sitio?". */
export const esRecargaProgramada = () => recargaProgramada

/**
 * Recarga SÓLO la app (el iframe): baja el índice y los módulos de la versión vigente. Monday no se
 * toca, y desde el iframe tampoco se podría (es otro dominio).
 */
export function recargarParaRecuperar() {
  recargaProgramada = true
  window.location.reload()
}
