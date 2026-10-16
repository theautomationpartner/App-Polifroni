/**
 * El robot de Tempoglass: el sistema web del proveedor de vidrio.
 *
 * Tempoglass no tiene API pública. Es un Laravel con Livewire 2 (investigado el 16/10/2026): el login
 * es un formulario clásico con su `_token` anti-falsificación, y las pantallas internas son
 * componentes Livewire que mandan cada cambio a `/livewire/message/<componente>` y reciben el HTML ya
 * armado. El robot hace eso mismo por HTTP, sin navegador: es más rápido, entra en una función de
 * Vercel y no depende de un Chrome.
 *
 * Cada paso verifica lo que recibe y, si no es lo esperado, corta con `ErrorTempoglass` diciendo EN
 * QUÉ paso: si Tempoglass cambia su pantalla, el error lo dice, en lugar de seguir con datos vacíos.
 *
 * Las credenciales son las de Polifroni en Tempoglass (`TEMPOGLASS_EMAIL` y `TEMPOGLASS_PASSWORD`,
 * variables cifradas de Vercel). Nunca se loguean ni se devuelven.
 */
import * as cheerio from 'cheerio'

const BASE = 'https://tempoglass.ar'
/** Cada pedido a Tempoglass tiene su tope: uno colgado no puede comerse la función entera. */
const TIEMPO_MAXIMO_MS = 12_000
const NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

/** Los pasos del robot, para decir dónde falló. */
export type PasoTempoglass =
  | 'credenciales'
  | 'login'
  | 'obras'
  | 'buscar'
  | 'obra'
  | 'pedido'
  | 'importar'
  | 'cerrar'
  | 'conexion'

/**
 * Una falla de Tempoglass, con el paso en que pasó y si vale la pena reintentar.
 *
 * `reintentable` es la decisión importante:
 *  · SÍ: lo que se arregla con una sesión nueva o con esperar un momento — sesión vencida o
 *    perdida (302 a /login, 401, 419 "page expired"), Tempoglass caído un instante (5xx), la red
 *    cortada o un pedido que no contestó a tiempo.
 *  · NO: lo que reintentar no arregla y hasta empeora — credenciales malas (insistir puede hacer
 *    que Tempoglass bloquee el usuario), el bloqueo por demasiados intentos (429), las credenciales
 *    que faltan, o una pantalla que cambió de forma (eso pide revisar el robot).
 */
export class ErrorTempoglass extends Error {
  constructor(
    readonly paso: PasoTempoglass,
    mensaje: string,
    readonly reintentable = false,
  ) {
    super(mensaje)
    this.name = 'ErrorTempoglass'
  }
}

/** ¿Este status HTTP se arregla reintentando con una sesión nueva? */
export const statusReintentable = (status: number): boolean =>
  status === 302 || status === 401 || status === 408 || status === 419 || status >= 500

/** Una fila de la tabla de obras de Tempoglass. `id` es su "Id.Int.Obra" (p. ej. "4715"). */
export interface ObraTempoglass {
  id: string
  nombre: string
  descripcion: string
  /** Adónde lleva el clic en la fila ("https://tempoglass.ar/obra/4715"), si la fila lo trae. */
  url?: string
}

export interface BusquedaObra {
  buscado: string
  /** Lo que devolvió el buscador de Tempoglass (busca por "contiene", no por igual). */
  resultados: ObraTempoglass[]
  /** La obra cuyo nombre es EXACTAMENTE el buscado (sin distinguir mayúsculas ni espacios). */
  encontrada: ObraTempoglass | null
}

/* ── La sesión: cookies de un navegador, a mano ──────────────────────────────────────────────── */

/**
 * Las cookies de la sesión. `fetch` no las guarda solo, y Laravel necesita dos: la de sesión y la
 * `XSRF-TOKEN`. Además el login las ROTA: hay que quedarse siempre con la última de cada una.
 */
export class Sesion {
  private readonly cookies = new Map<string, string>()

  guardar(res: Response): void {
    for (const linea of res.headers.getSetCookie()) {
      const [par] = linea.split(';')
      const i = par!.indexOf('=')
      if (i > 0) this.cookies.set(par!.slice(0, i).trim(), par!.slice(i + 1).trim())
    }
  }

  cabecera(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  async pedir(ruta: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set('user-agent', NAVEGADOR)
    if (this.cookies.size) headers.set('cookie', this.cabecera())
    let res: Response
    try {
      res = await fetch(BASE + ruta, {
        ...init,
        headers,
        /* Las redirecciones se miran a mano: un 302 a /login es la forma en que Laravel dice
           "credenciales malas" o "sesión vencida", y siguiéndolo solo se perdería. */
        redirect: 'manual',
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      })
    } catch (e) {
      /* Red cortada, DNS, o el tope de tiempo: todo eso se arregla reintentando. */
      const tiempo = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      throw new ErrorTempoglass(
        'conexion',
        tiempo ? `Tempoglass no contestó en ${TIEMPO_MAXIMO_MS / 1000} s.` : 'No se pudo conectar con Tempoglass.',
        true,
      )
    }
    this.guardar(res)
    return res
  }
}

/* ── Lectura del HTML (funciones puras: se testean sin red) ─────────────────────────────────── */

/** El `_token` del formulario de login. */
export function tokenDeFormulario(html: string): string | null {
  return cheerio.load(html)('form input[name="_token"]').attr('value') || null
}

/** El token CSRF de la página (lo exige Livewire en cada mensaje). */
export function csrfDePagina(html: string): string | null {
  return cheerio.load(html)('meta[name="csrf-token"]').attr('content') || null
}

/** ¿Llegó a dibujarse el buscador de obras? Es la prueba de que se entró a la pantalla correcta. */
export function tieneBuscador(html: string): boolean {
  /* `wire:model`, con o sin modificadores (`wire:model.debounce.500ms`, …). */
  return /<input[^>]*wire:model[.\w]*="table\.search"/.test(html)
}

/** El estado de un componente Livewire 2, tal como viene en `wire:initial-data`. */
export interface ComponenteLivewire {
  fingerprint: { id: string; name: string; [k: string]: unknown }
  serverMemo: { data: Record<string, unknown>; [k: string]: unknown }
  [k: string]: unknown
}

/**
 * El componente de la tabla de obras: el que tiene `table` en sus datos (el buscador escribe en
 * `table.search`). Si la página trae un solo componente, es ése.
 */
export function componenteDeTabla(html: string): ComponenteLivewire | null {
  const componentes = componentesDePagina(html).map((c) => c.componente)
  const conTabla = componentes.find((c) => {
    const tabla = c.serverMemo?.data?.table
    return tabla !== null && typeof tabla === 'object'
  })
  return conTabla ?? (componentes.length === 1 ? componentes[0]! : null)
}

/** Los componentes Livewire de la página, cada uno con el HTML que dibuja. */
function componentesDePagina(html: string): { componente: ComponenteLivewire; html: string }[] {
  const $ = cheerio.load(html)
  const lista: { componente: ComponenteLivewire; html: string }[] = []
  $('[wire\\:initial-data]').each((_, el) => {
    try {
      lista.push({ componente: JSON.parse($(el).attr('wire:initial-data') ?? '') as ComponenteLivewire, html: $.html(el) })
    } catch {
      /* Un atributo ilegible no es el componente que buscamos. */
    }
  })
  return lista
}

/**
 * El componente que dibuja el botón con esa acción (`wire:click="saveCabecera"`). Si hay varios
 * anidados, el más interno: es el que atiende el clic.
 */
export function componenteConAccion(
  fuente: string | { componente: ComponenteLivewire; html: string }[],
  accion: string,
): ComponenteLivewire | null {
  const lista = typeof fuente === 'string' ? componentesDePagina(fuente) : fuente
  const conBoton = lista.filter((c) => c.html.includes(`wire:click="${accion}"`))
  return conBoton.length ? conBoton[conBoton.length - 1]!.componente : null
}

/** "loadData" o "loadData('x', 2)" → el método y sus parámetros, como los manda el navegador. */
export function accionYParametros(texto: string): { metodo: string; params: string[] } | null {
  const [, metodo, crudo] = /^\s*([\w$]+)\s*(?:\((.*)\))?\s*$/.exec(texto) ?? []
  if (!metodo) return null
  const params = crudo?.trim() ? crudo.split(',').map((p) => p.trim().replace(/^['"]|['"]$/g, '')) : []
  return { metodo, params }
}

/** El `wire:init` del elemento raíz de un componente: lo que el navegador pide apenas lo dibuja. */
export function wireInitDe(htmlComponente: string): string | null {
  const $ = cheerio.load(htmlComponente, null, false)
  return $.root().children().first().attr('wire:init')?.trim() || null
}

/** Una acción de Livewire 2: escribir en un campo o tocar un botón. */
type ActualizacionLivewire =
  | { type: 'syncInput'; payload: { id: string; name: string; value: unknown } }
  | { type: 'callMethod'; payload: { id: string; method: string; params: unknown[] } }

const idAccion = () => Math.random().toString(36).slice(2, 7)
/** Escribir en un campo con `wire:model="name"`. */
export const escribir = (name: string, value: unknown): ActualizacionLivewire => ({
  type: 'syncInput',
  payload: { id: idAccion(), name, value },
})
/** Tocar un botón con `wire:click="method(...params)"`. */
export const tocar = (method: string, params: unknown[] = []): ActualizacionLivewire => ({
  type: 'callMethod',
  payload: { id: idAccion(), method, params },
})

/** Lo que contesta Livewire a un mensaje. */
export interface RespuestaLivewire {
  /** El componente redibujado (null si no cambió). */
  html: string | null
  /** Adónde manda el componente después (`redirect()` de Laravel), si manda. */
  redirect: string | null
  /** Errores de validación por campo (`pedido.fecha_entrega: ["…"]`). */
  errores: string[]
}

const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * Las filas de la tabla de obras. Las columnas se ubican por su encabezado (NOMBRE, DESCRIPCIÓN,
 * ID.) y no por posición: el usuario de Tempoglass puede elegir qué columnas ver.
 */
export function filasDeObras(html: string): ObraTempoglass[] {
  const $ = cheerio.load(html)
  const encabezados = $('table thead th')
    .map((_, th) => normalizar($(th).text()).replace(/[.:]/g, ''))
    .get()
  const columna = (...nombres: string[]) => encabezados.findIndex((e) => nombres.includes(e))
  const iNombre = columna('NOMBRE')
  const iDescripcion = columna('DESCRIPCIÓN', 'DESCRIPCION')
  const iId = columna('ID', 'IDINTOBRA', 'ID INT OBRA')

  const filas: ObraTempoglass[] = []
  $('table tbody tr').each((_, tr) => {
    const celdas = $(tr)
      .children('td')
      .map((_, td) => $(td).text().replace(/\s+/g, ' ').trim())
      .get()
    if (celdas.length < 2) return // la fila de "sin resultados"
    const nombre = celdas[iNombre >= 0 ? iNombre : 0] ?? ''
    const id = celdas[iId >= 0 ? iId : celdas.length - 1] ?? ''
    if (!nombre || !/^\d+$/.test(id)) return
    /* El clic de la fila: `onclick="window.open('https://tempoglass.ar/obra/4715', '_self')"`. */
    const onclick = $(tr).find('td[onclick]').first().attr('onclick') ?? ''
    const url = /window\.open\(\s*'([^']+)'/.exec(onclick)?.[1]
    filas.push({ id, nombre, descripcion: iDescripcion >= 0 ? (celdas[iDescripcion] ?? '') : '', ...(url ? { url } : {}) })
  })
  return filas
}

/**
 * El "Id.Int.Obra" de la pantalla de la obra: `<input id="id" readonly placeholder="4715">`.
 *
 * OJO: Tempoglass repite el `id="id"` —el campo "Nombre" también lo tiene, con el nombre de la obra—
 * (visto en la pantalla real el 16/10/2026). Por eso no sirve "el primer #id": se toma el campo cuya
 * etiqueta dice "Id.Int.Obra" y, si no se encuentra la etiqueta, el `#id` que tenga un número.
 */
export function idIntDeObra(html: string): string | null {
  const $ = cheerio.load(html)
  const numero = (el: Parameters<typeof $>[0]) => {
    const v = ($(el).attr('value') || $(el).attr('placeholder') || '').trim()
    return /^\d+$/.test(v) ? v : null
  }
  const etiqueta = $('label')
    .filter((_, l) => /id\.?\s*int\.?\s*obra/i.test($(l).text()))
    .first()
  const conEtiqueta = etiqueta.length ? numero(etiqueta.parent().find('input').first()) : null
  if (conEtiqueta) return conEtiqueta
  for (const el of $('input[id="id"]').toArray()) {
    const v = numero(el)
    if (v) return v
  }
  return null
}

/** El número de pedido de la dirección a la que lleva "Confirmar": `/dvhpedidorenglon/4938`. */
export function pedidoDeDireccion(url: string | null | undefined): string | null {
  return /\/dvhpedidorenglon\/(\d+)/.exec(url ?? '')?.[1] ?? null
}

/** Un renglón del detalle del pedido ya cargado en Tempoglass. */
export interface RenglonTempoglass {
  id: string
  cantidad: number
}

/**
 * Los renglones del detalle de un pedido (`/dvhpedidorenglon/<pedido>`): la tabla con CANTIDAD y
 * REFERENCIA, una fila por vidrio con su ID de renglón. Las columnas se ubican por su encabezado.
 */
export function renglonesDePedido(html: string): RenglonTempoglass[] {
  const $ = cheerio.load(html)
  const renglones: RenglonTempoglass[] = []
  $('table').each((_, tabla) => {
    const encabezados = $(tabla)
      .find('thead th, tr:first-child th')
      .map((_, th) => normalizar($(th).text()))
      .get()
    const iCantidad = encabezados.findIndex((e) => e.startsWith('CANTIDAD'))
    if (iCantidad < 0 || !encabezados.some((e) => e.startsWith('REFERENCIA') || e.startsWith('COMP'))) return
    $(tabla)
      .find('tbody tr')
      .each((_, tr) => {
        const celdas = $(tr)
          .children('td')
          .map((_, td) => $(td).text().replace(/\s+/g, ' ').trim())
          .get()
        const id = celdas[0] ?? ''
        const cantidad = Number((celdas[iCantidad] ?? '').replace(/\./g, '').replace(',', '.'))
        if (/^\d+$/.test(id) && cantidad > 0) renglones.push({ id, cantidad })
      })
  })
  return renglones
}

/** Los avisos que muestra la página (errores de validación, mensajes de la importación). */
export function avisosDePagina(html: string): string[] {
  const $ = cheerio.load(html)
  return $('[class*="alert"], [role="alert"], [class*="text-red"]')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter((t) => t && t.length < 300)
}

/** La obra cuyo nombre es exactamente el buscado. El buscador de Tempoglass trae también las parecidas. */
export function obraExacta(filas: ObraTempoglass[], nombre: string): ObraTempoglass | null {
  return filas.find((f) => normalizar(f.nombre) === normalizar(nombre)) ?? null
}

/* ── Los pasos ──────────────────────────────────────────────────────────────────────────────── */

function credenciales(): { email: string; password: string } {
  const email = process.env.TEMPOGLASS_EMAIL?.trim()
  const password = process.env.TEMPOGLASS_PASSWORD
  if (!email || !password) {
    throw new ErrorTempoglass('credenciales', 'Faltan TEMPOGLASS_EMAIL / TEMPOGLASS_PASSWORD en el servidor.')
  }
  return { email, password }
}

/** ¿La redirección vuelve al login? Así responde Laravel a credenciales malas o a una sesión vencida. */
const vuelveAlLogin = (res: Response) => /\/login\b/.test(res.headers.get('location') ?? '')

/**
 * El mensaje de error que muestra el login después de un intento fallido (el de Laravel Breeze, en
 * rojo debajo del formulario): "Estas credenciales no coinciden…" o "Demasiados intentos…".
 */
export function errorDeLogin(html: string): string | null {
  const $ = cheerio.load(html)
  const texto = $('form [class*="text-red"], [class*="text-red"] li')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .find(Boolean)
  return texto || null
}

/** ¿El mensaje del login es el bloqueo por demasiados intentos? (Laravel lo dice en castellano o inglés.) */
export const esBloqueoPorIntentos = (mensaje: string): boolean => /demasiados|too many|intente de nuevo en|try again in/i.test(mensaje)

/**
 * Entra a Tempoglass: toma el `_token` del formulario y manda email y contraseña.
 *
 * Cada corrida del robot entra de CERO, con una sesión nueva: no se guardan cookies de una vez para
 * la otra, así que una sesión vencida, borrada o cerrada desde otro lado no puede afectar a la
 * corrida siguiente.
 */
export async function iniciarSesion(): Promise<Sesion> {
  const { email, password } = credenciales()
  const sesion = new Sesion()

  const formulario = await sesion.pedir('/login')
  if (!formulario.ok) {
    throw new ErrorTempoglass(
      'login',
      `La página de login respondió HTTP ${formulario.status}.`,
      statusReintentable(formulario.status),
    )
  }
  const token = tokenDeFormulario(await formulario.text())
  if (!token) throw new ErrorTempoglass('login', 'La página de login no trae el formulario esperado.')

  const res = await sesion.pedir('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', referer: `${BASE}/login` },
    body: new URLSearchParams({ _token: token, email, password }).toString(),
  })

  /* Bien: 302 a la pantalla de inicio. */
  if (res.status === 302 && !vuelveAlLogin(res)) return sesion

  /* 302 de vuelta a /login: Laravel rechazó el intento y dejó el motivo en la página. Puede ser la
     contraseña o el bloqueo por intentos; en ninguno de los dos casos se reintenta: insistir con
     una contraseña mala es justamente lo que termina en bloqueo. */
  if (res.status === 302) {
    const motivo = errorDeLogin(await (await sesion.pedir('/login')).text())
    if (motivo && esBloqueoPorIntentos(motivo)) {
      throw new ErrorTempoglass('login', `Tempoglass bloqueó el ingreso por demasiados intentos: ${motivo}`)
    }
    throw new ErrorTempoglass(
      'login',
      `Tempoglass rechazó el usuario o la contraseña${motivo ? ` («${motivo}»)` : ''}. Revisá TEMPOGLASS_EMAIL / TEMPOGLASS_PASSWORD en Vercel.`,
    )
  }
  if (res.status === 429) throw new ErrorTempoglass('login', 'Tempoglass bloqueó el ingreso por demasiados intentos (429).')
  /* 419: el token del formulario venció entre que se leyó y se mandó. Con una sesión nueva, anda. */
  if (res.status === 419) throw new ErrorTempoglass('login', 'Tempoglass rechazó el token del formulario (419).', true)
  throw new ErrorTempoglass('login', `El login respondió HTTP ${res.status}.`, statusReintentable(res.status))
}

/** La pantalla de obras, lista para buscar. */
interface PantallaObras {
  csrf: string
  componente: ComponenteLivewire
}

/** Abre `/obra` y verifica que se haya dibujado el buscador antes de usarlo. */
export async function abrirObras(sesion: Sesion): Promise<PantallaObras> {
  const res = await sesion.pedir('/obra')
  /* 302: la sesión se perdió entre el login y acá (vencida, cerrada desde otro lado). Se reintenta
     con un login nuevo. */
  if (res.status === 302) throw new ErrorTempoglass('obras', 'Tempoglass no reconoció la sesión al abrir Obras.', true)
  if (!res.ok) throw new ErrorTempoglass('obras', `Obras respondió HTTP ${res.status}.`, statusReintentable(res.status))
  const html = await res.text()

  /* Lo que sigue NO se reintenta: si la pantalla no tiene lo que el robot usa, cambió de forma, y
     eso pide revisar el robot, no insistir. */
  if (!tieneBuscador(html)) throw new ErrorTempoglass('obras', 'La pantalla de Obras no muestra el buscador.')
  const csrf = csrfDePagina(html)
  const componente = componenteDeTabla(html)
  if (!csrf || !componente) throw new ErrorTempoglass('obras', 'No se encontró el componente de la tabla de Obras.')
  return { csrf, componente }
}

/**
 * Escribe en el buscador de Obras, como quien tipea: Livewire 2 recibe el cambio de `table.search`
 * y devuelve la tabla filtrada ya dibujada.
 */
export async function buscarEnObras(sesion: Sesion, pantalla: PantallaObras, texto: string): Promise<ObraTempoglass[]> {
  const r = await mensajeLivewire(sesion, pantalla.csrf, pantalla.componente, [escribir('table.search', texto)], {
    paso: 'buscar',
    referer: '/obra',
  })
  if (typeof r.html !== 'string') throw new ErrorTempoglass('buscar', 'El buscador no devolvió la tabla.')
  return filasDeObras(r.html)
}

/**
 * Manda acciones a un componente Livewire 2, como lo hace el navegador: `POST
 * /livewire/message/<componente>` con su estado (`fingerprint` + `serverMemo`) y las acciones. La
 * respuesta trae el componente redibujado, una redirección o errores de validación.
 *
 * Deja el `serverMemo` del componente actualizado con lo que devuelve el servidor (como el
 * navegador), así se le pueden mandar más acciones después.
 *
 * `ambiguo`: la acción CREA algo en Tempoglass. Si no llega respuesta —la red, el tope de tiempo, un
 * 5xx—, no se sabe si se creó, y reintentar podría crearlo dos veces: eso NO se reintenta solo.
 * Un 419 sí: Laravel rechaza el token ANTES de ejecutar nada.
 */
export async function mensajeLivewire(
  sesion: Sesion,
  csrf: string,
  componente: ComponenteLivewire,
  updates: ActualizacionLivewire[],
  { paso, referer, ambiguo = false }: { paso: PasoTempoglass; referer: string; ambiguo?: boolean },
): Promise<RespuestaLivewire> {
  const { fingerprint, serverMemo } = componente
  let res: Response
  try {
    res = await sesion.pedir(`/livewire/message/${fingerprint.name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/html, application/xhtml+xml',
        'x-csrf-token': csrf,
        'x-livewire': 'true',
        referer: BASE + referer,
      },
      body: JSON.stringify({ fingerprint, serverMemo, updates }),
    })
  } catch (e) {
    if (ambiguo && e instanceof ErrorTempoglass) {
      throw new ErrorTempoglass(paso, `${e.message} No se sabe si Tempoglass lo registró: revisalo allá antes de reintentar.`)
    }
    throw e
  }
  if (!res.ok) {
    const reintentable = res.status === 419 || (!ambiguo && statusReintentable(res.status))
    throw new ErrorTempoglass(paso, `Tempoglass respondió HTTP ${res.status}.`, reintentable)
  }
  const cuerpo = (await res.json().catch(() => null)) as {
    effects?: { html?: string | null; redirect?: string | null }
    serverMemo?: { data?: Record<string, unknown>; errors?: Record<string, string[]>; [k: string]: unknown }
  } | null
  if (!cuerpo) throw new ErrorTempoglass(paso, 'Tempoglass no devolvió una respuesta de Livewire.')

  /* Como el navegador: los datos se mezclan clave por clave; el resto (checksum, htmlHash) se pisa. */
  const memo = cuerpo.serverMemo ?? {}
  for (const [clave, valor] of Object.entries(memo)) {
    if (clave === 'data') Object.assign(componente.serverMemo.data, valor ?? {})
    else componente.serverMemo[clave] = valor
  }
  const errores = Object.entries(memo.errors ?? {}).flatMap(([campo, msgs]) => msgs.map((m) => `${campo}: ${m}`))
  return { html: cuerpo.effects?.html ?? null, redirect: cuerpo.effects?.redirect ?? null, errores }
}

/** Abre una pantalla de Tempoglass ya logueado. Un 302 es la sesión perdida: se reintenta entero. */
/** Una pantalla de Tempoglass ya dibujada del todo: lo que vería una persona en el navegador. */
export interface Pantalla {
  ruta: string
  csrf: string
  /** La página más lo que cargaron después sus componentes (`wire:init`). */
  html: string
  /** Cada componente Livewire con su HTML al día (el de después de cargar). */
  componentes: { componente: ComponenteLivewire; html: string }[]
}

/**
 * Abre una pantalla de Tempoglass ya logueado, y la deja como la ve el navegador.
 *
 * Un componente Livewire con `wire:init` llega VACÍO en la página: el navegador lo dibuja y recién
 * ahí le pide sus datos con otra llamada. Leer la página sin esa segunda llamada es leerla antes de
 * que termine de cargar (lo que pasaba con el Id.Int.Obra). Acá se hace la misma llamada.
 *
 * Un 302 es la sesión perdida: se reintenta entero.
 */
export async function abrirPantalla(sesion: Sesion, ruta: string, paso: PasoTempoglass): Promise<Pantalla> {
  const res = await sesion.pedir(ruta)
  if (res.status === 302) throw new ErrorTempoglass(paso, `Tempoglass no reconoció la sesión al abrir ${ruta}.`, true)
  if (!res.ok) throw new ErrorTempoglass(paso, `${ruta} respondió HTTP ${res.status}.`, statusReintentable(res.status))
  const html = await res.text()
  const csrf = csrfDePagina(html)
  if (!csrf) throw new ErrorTempoglass(paso, `${ruta} no trae el token de la página.`)

  const componentes = componentesDePagina(html)
  const cargado: string[] = []
  for (const c of componentes) {
    const init = wireInitDe(c.html)
    const accion = init ? accionYParametros(init) : null
    if (!accion) continue
    const r = await mensajeLivewire(sesion, csrf, c.componente, [tocar(accion.metodo, accion.params)], { paso, referer: ruta })
    if (r.html) {
      c.html = r.html
      cargado.push(r.html)
    }
  }
  return { ruta, csrf, html: [html, ...cargado].join('\n'), componentes }
}

/**
 * Qué trae una pantalla, en una línea: para que un error de "no encontré X" diga también qué SÍ
 * había, y se pueda ajustar el robot sin adivinar.
 */
export function describirPantalla(p: Pick<Pantalla, 'html' | 'componentes'>): string {
  const $ = cheerio.load(p.html)
  const nombres = p.componentes.map((c) => c.componente.fingerprint?.name).filter(Boolean)
  const acciones = [...new Set($('[wire\\:click]').map((_, el) => $(el).attr('wire:click')).get())].slice(0, 8)
  const campos = [...new Set($('input[id], textarea[id], select[id]').map((_, el) => $(el).attr('id')).get())].slice(0, 8)
  return [
    `componentes: ${nombres.join(', ') || 'ninguno'}`,
    `acciones: ${acciones.join(', ') || 'ninguna'}`,
    `campos: ${campos.join(', ') || 'ninguno'}`,
  ].join(' · ')
}

/** La ruta de una dirección de Tempoglass ("https://tempoglass.ar/obra/4715" → "/obra/4715"). */
const rutaDe = (url: string) => (url.startsWith('/') ? url : new URL(url, BASE).pathname)

/* ── La obra y su pedido ────────────────────────────────────────────────────────────────────── */

/** Abre la obra (el clic en su fila) y lee su "Id.Int.Obra". */
export async function abrirObra(sesion: Sesion, obra: ObraTempoglass): Promise<{ idInt: string; pantalla: Pantalla }> {
  const ruta = obra.url ? rutaDe(obra.url) : `/obra/${obra.id}`
  const pantalla = await abrirPantalla(sesion, ruta, 'obra')
  /* El Id.Int.Obra es el número de la obra en Tempoglass: el del campo de la pantalla, y el mismo de
     su dirección (`/obra/4715`) y de la columna Id. de la tabla. Si el campo no lo trae (lo arma la
     página en el navegador), vale el de la dirección. Si los dos están y no coinciden, algo cambió:
     se frena antes de cargar el pedido en otra obra. */
  const enPantalla = idIntDeObra(pantalla.html)
  const enDireccion = /\/obra\/(\d+)/.exec(ruta)?.[1] ?? (/^\d+$/.test(obra.id) ? obra.id : null)
  if (enPantalla && enDireccion && enPantalla !== enDireccion) {
    throw new ErrorTempoglass('obra', `La obra muestra el Id.Int.Obra ${enPantalla} pero su dirección es la ${enDireccion}.`)
  }
  const idInt = enPantalla ?? enDireccion
  if (!idInt) {
    throw new ErrorTempoglass('obra', `No se encontró el Id.Int.Obra. La pantalla trae → ${describirPantalla(pantalla)}`)
  }
  return { idInt, pantalla }
}

/**
 * Crea el pedido: "Agregar Pedido" en la obra, comentario y fecha de entrega, y "Confirmar". Devuelve
 * el número de pedido (el de `/dvhpedidorenglon/<pedido>`).
 *
 * "Confirmar" es la ÚNICA acción que crea algo sin poder verificar antes si ya existe: por eso va
 * como `ambiguo` (ver `mensajeLivewire`) y nunca se reintenta a ciegas.
 */
export async function crearPedido(
  sesion: Sesion,
  obra: { idInt: string; pantalla: Pantalla },
  datos: { comentario: string; fecha: string },
): Promise<string> {
  /* "Agregar Pedido": lleva al formulario del pedido nuevo (`/dvhpedido/<obra>`). No crea nada. */
  let rutaPedido = `/dvhpedido/${obra.idInt}`
  const enObra = componenteConAccion(obra.pantalla.componentes, 'addPedido')
  if (enObra) {
    const r = await mensajeLivewire(sesion, obra.pantalla.csrf, enObra, [tocar('addPedido')], {
      paso: 'pedido',
      referer: obra.pantalla.ruta,
    })
    if (r.redirect) rutaPedido = rutaDe(r.redirect)
  }

  const formulario = await abrirPantalla(sesion, rutaPedido, 'pedido')
  const componente = componenteConAccion(formulario.componentes, 'saveCabecera')
  if (!componente) {
    throw new ErrorTempoglass('pedido', `El formulario del pedido no tiene el botón Confirmar. Trae → ${describirPantalla(formulario)}`)
  }

  const r = await mensajeLivewire(
    sesion,
    formulario.csrf,
    componente,
    [escribir('pedido.detalle', datos.comentario), escribir('pedido.fecha_entrega', datos.fecha), tocar('saveCabecera')],
    { paso: 'pedido', referer: rutaPedido, ambiguo: true },
  )
  if (r.errores.length) throw new ErrorTempoglass('pedido', `Tempoglass no aceptó el pedido: ${r.errores.join(' · ')}`)
  const pedido = pedidoDeDireccion(r.redirect)
  if (!pedido) {
    throw new ErrorTempoglass(
      'pedido',
      'Tempoglass no devolvió el número de pedido al confirmar. Revisá la obra en Tempoglass antes de reintentar.',
    )
  }
  return pedido
}

/**
 * Importa la planilla en el pedido ("Importar" → archivo → "Subir archivo") y verifica que hayan
 * entrado TODOS los renglones con TODAS las piezas.
 *
 * Es seguro repetirlo: antes de subir, mira si el pedido ya tiene renglones. Si los tiene —un intento
 * anterior que sí llegó—, no sube nada y sólo verifica.
 */
export async function importarPlanilla(
  sesion: Sesion,
  pedido: string,
  archivo: { nombre: string; datos: Uint8Array },
  esperado: { renglones: number; piezas: number },
): Promise<number> {
  const ruta = `/dvhpedidorenglon/${pedido}`
  const pantalla = await abrirPantalla(sesion, ruta, 'importar')
  let renglones = renglonesDePedido(pantalla.html)

  if (renglones.length === 0) {
    const form = new FormData()
    form.set('_token', pantalla.csrf)
    form.set('pedido_id', pedido)
    form.set(
      'archivo',
      new Blob([new Uint8Array(archivo.datos)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      archivo.nombre,
    )
    /* Si esto no contesta, la planilla puede haber entrado o no: el reintento lo resuelve, porque
       vuelve a mirar los renglones antes de subir otra vez. */
    const res = await sesion.pedir('/importpedido', { method: 'POST', body: form, headers: { referer: BASE + ruta } })
    if (res.status !== 302 && !res.ok) {
      throw new ErrorTempoglass('importar', `Subir el archivo respondió HTTP ${res.status}.`, statusReintentable(res.status))
    }
    const despues = await abrirPantalla(sesion, ruta, 'importar')
    renglones = renglonesDePedido(despues.html)
    if (renglones.length === 0) {
      const avisos = avisosDePagina(despues.html).filter((a) => !/aún no hay productos|presione agregar/i.test(a))
      throw new ErrorTempoglass(
        'importar',
        `Tempoglass no cargó ningún renglón de la planilla${avisos.length ? `: ${avisos.join(' · ')}` : '.'}`,
      )
    }
  }

  const piezas = renglones.reduce((n, r) => n + r.cantidad, 0)
  if (renglones.length !== esperado.renglones || piezas !== esperado.piezas) {
    throw new ErrorTempoglass(
      'importar',
      `El pedido ${pedido} quedó con ${renglones.length} renglones y ${piezas} piezas; se esperaban ` +
        `${esperado.renglones} y ${esperado.piezas}. Revisalo en Tempoglass.`,
    )
  }
  return renglones.length
}

/**
 * "Cerrar Pedido" y su "Confirmar" (`closeOrder`).
 *
 * Cómo es la pantalla real (vista el 16/10/2026 en pedidos de Tempoglass):
 *  · las ventanas de confirmación —Cerrar, Enviar, Reabrir— están SIEMPRE en la página, ocultas
 *    (`x-show`); lo que de verdad ofrece la pantalla es la barra de botones visible;
 *  · un pedido ABIERTO ofrece "Agregar Producto" e "Importar" (y "Cerrar Pedido" si tiene
 *    renglones); uno cerrado o enviado sólo "Imprimir", "Ver Obra" y "Volver".
 *  · Cerrar NO es enviar: Tempoglass dice "se completa el pedido y se prepara para enviarlo"; el
 *    envío es otro botón ("Enviar Pedido"), que el robot no toca.
 *
 * El navegador abre la ventana (`confirmCloseOrder` en true) y "Confirmar" llama a `closeOrder`: el
 * robot manda las dos cosas juntas, como el navegador al confirmar. Seguro de repetir: un pedido que
 * ya no está abierto no se toca. Y se verifica después: si sigue abierto, es un error.
 */
export async function cerrarPedido(sesion: Sesion, pedido: string): Promise<void> {
  const ruta = `/dvhpedidorenglon/${pedido}`
  const pantalla = await abrirPantalla(sesion, ruta, 'cerrar')
  if (!pedidoAbierto(pantalla.html)) return
  if (!ofreceCerrar(pantalla.html)) {
    throw new ErrorTempoglass('cerrar', `El pedido está abierto pero no ofrece "Cerrar Pedido". Trae → ${describirPantalla(pantalla)}`)
  }
  const componente = componenteConAccion(pantalla.componentes, 'closeOrder')
  if (!componente) {
    throw new ErrorTempoglass('cerrar', `No se encontró el "Confirmar" de Cerrar Pedido. Trae → ${describirPantalla(pantalla)}`)
  }

  const r = await mensajeLivewire(sesion, pantalla.csrf, componente, [escribir('confirmCloseOrder', true), tocar('closeOrder')], {
    paso: 'cerrar',
    referer: ruta,
  })
  if (r.errores.length) throw new ErrorTempoglass('cerrar', `Tempoglass no cerró el pedido: ${r.errores.join(' · ')}`)

  const despues = await abrirPantalla(sesion, ruta, 'cerrar')
  if (pedidoAbierto(despues.html)) throw new ErrorTempoglass('cerrar', 'El pedido sigue abierto después de cerrarlo.')
}

/**
 * Los botones VISIBLES de la pantalla: sus `wire:click`, sin los de las ventanas ocultas (`x-show`),
 * que están siempre en la página aunque no se vean.
 */
export function barraDeAcciones(html: string): string[] {
  const $ = cheerio.load(html)
  return $('[wire\\:click]')
    .filter((_, el) => $(el).closest('[x-show]').length === 0)
    .map((_, el) => ($(el).attr('wire:click') ?? '').trim())
    .get()
    .filter(Boolean)
}

/** ¿El pedido está abierto? Sólo uno abierto deja agregar productos o importar. */
export function pedidoAbierto(html: string): boolean {
  return barraDeAcciones(html).some((a) => a === 'openCreateForm' || a.includes('showUploadForm'))
}

/** ¿La barra ofrece "Cerrar Pedido"? (El de la ventana oculta no cuenta.) */
export function ofreceCerrar(html: string): boolean {
  return barraDeAcciones(html).some((a) => a.includes('confirmCloseOrder'))
}


/** Por dónde va el robot. Se avisa al empezar cada paso, para que la pantalla lo muestre en vivo. */
export type AvanceTempoglass =
  | { etapa: 'sesion' }
  | { etapa: 'logueado' }
  | { etapa: 'buscando'; nombre: string }
  | { etapa: 'obraSeleccionada'; obra: ObraTempoglass; idIntObra: string }
  | { etapa: 'creandoPedido' }
  /** El pedido ya existe en Tempoglass: si algo falla después, se retoma desde acá, sin crear otro. */
  | { etapa: 'pedidoCreado'; pedido: string }
  | { etapa: 'importando'; pedido: string }
  | { etapa: 'importado'; renglones: number }
  | { etapa: 'cerrando'; pedido: string }
  | { etapa: 'reintentando'; intento: number; de: number; motivo: string }

/* ── Reintentos ─────────────────────────────────────────────────────────────────────────────── */

export interface OpcionesReintento {
  /** Corridas en total, contando la primera. */
  intentos: number
  /** Cuánto esperar antes de la corrida `intento` (2, 3, …): cada vez un poco más. */
  esperaMs: (intento: number) => number
  /** Tope para EMPEZAR otro intento: la función de Vercel corta a los 180 s (`vercel.json`), y un
      intento completo del pedido son una docena de pedidos a Tempoglass. */
  plazoMs: number
  esperar?: (ms: number) => Promise<void>
  ahora?: () => number
}

export const REINTENTOS: OpcionesReintento = {
  intentos: 3,
  esperaMs: (intento) => 1500 * (intento - 1),
  plazoMs: 90_000,
}

/**
 * Corre `correr` y, si falla con algo reintentable, lo vuelve a correr ENTERO —login incluido—,
 * hasta `intentos` veces y dentro del plazo. Lo que no es reintentable (o un error que no es de
 * Tempoglass, o sea un bug) corta en el acto. Si se agotan los intentos, el error lo dice.
 *
 * Correr de nuevo es seguro porque cada paso que crea algo se fija antes si ya está hecho, y el
 * único que no puede fijarse —"Confirmar" el pedido— no se reintenta a ciegas (ver `crearPedido`).
 */
export async function conReintentos<T>(
  correr: () => Promise<T>,
  alReintentar: (intento: number, de: number, motivo: string) => void,
  op: OpcionesReintento = REINTENTOS,
): Promise<T> {
  const esperar = op.esperar ?? ((ms: number) => new Promise<void>((listo) => setTimeout(listo, ms)))
  const ahora = op.ahora ?? Date.now
  const inicio = ahora()

  for (let intento = 1; ; intento++) {
    try {
      return await correr()
    } catch (e) {
      if (!(e instanceof ErrorTempoglass) || !e.reintentable) throw e
      const espera = op.esperaMs(intento + 1)
      const sinTiempo = ahora() - inicio + espera > op.plazoMs
      if (intento >= op.intentos || sinTiempo) {
        throw new ErrorTempoglass(e.paso, `${e.message} (se intentó ${intento} ${intento === 1 ? 'vez' : 'veces'})`)
      }
      alReintentar(intento + 1, op.intentos, e.message)
      await esperar(espera)
    }
  }
}

/** Todo el recorrido: entrar, abrir Obras, buscar. Sólo lee: no crea ni cambia nada en Tempoglass. */
export async function buscarObraTempoglass(
  nombre: string,
  avisar: (avance: AvanceTempoglass) => void = () => {},
  op: OpcionesReintento = REINTENTOS,
): Promise<BusquedaObra> {
  return conReintentos(
    async () => {
      avisar({ etapa: 'sesion' })
      const sesion = await iniciarSesion()
      avisar({ etapa: 'logueado' })
      const pantalla = await abrirObras(sesion)
      avisar({ etapa: 'buscando', nombre })
      const resultados = await buscarEnObras(sesion, pantalla, nombre)
      return { buscado: nombre, resultados, encontrada: obraExacta(resultados, nombre) }
    },
    (intento, de, motivo) => avisar({ etapa: 'reintentando', intento, de, motivo }),
    op,
  )
}

/* ── El pedido entero ───────────────────────────────────────────────────────────────────────── */

export interface DatosCargaPedido {
  /** El nombre EXACTO de la obra en Tempoglass. */
  nombre: string
  comentario: string
  /** Fecha de entrega sugerida, `YYYY-MM-DD`. */
  fecha: string
  /** La planilla con el formato de la "planilla modelo" de Tempoglass. */
  archivo: { nombre: string; datos: Uint8Array }
  /** Lo que tiene que quedar cargado: se verifica contra el detalle del pedido. */
  esperado: { renglones: number; piezas: number }
  /** Retomar un pedido que ya se creó en una corrida anterior (no se crea otro). */
  retomar?: { pedido: string; obra: ObraTempoglass; idIntObra: string }
}

export interface PedidoCargado {
  obra: ObraTempoglass
  idIntObra: string
  pedido: string
  renglones: number
}

/**
 * El recorrido completo: entrar, buscar la obra por su nombre exacto, abrirla (su Id.Int.Obra),
 * crear el pedido (comentario + fecha), importar la planilla, verificar que entró todo y cerrar el
 * pedido.
 *
 * Cada reintento entra de cero con un login nuevo, pero retoma desde lo que ya quedó hecho: una vez
 * que el pedido existe, no se vuelve a crear; la importación y el cierre se fijan antes si ya se
 * hicieron. Así un reintento nunca duplica nada en Tempoglass.
 */
export async function cargarPedidoTempoglass(
  datos: DatosCargaPedido,
  avisar: (avance: AvanceTempoglass) => void = () => {},
  op: OpcionesReintento = REINTENTOS,
): Promise<PedidoCargado> {
  let obra = datos.retomar?.obra ?? null
  let idIntObra = datos.retomar?.idIntObra ?? ''
  let pedido = datos.retomar?.pedido ?? ''

  return conReintentos(
    async () => {
      avisar({ etapa: 'sesion' })
      const sesion = await iniciarSesion()
      avisar({ etapa: 'logueado' })

      if (!pedido) {
        const pantalla = await abrirObras(sesion)
        avisar({ etapa: 'buscando', nombre: datos.nombre })
        const resultados = await buscarEnObras(sesion, pantalla, datos.nombre)
        const encontrada = obraExacta(resultados, datos.nombre)
        if (!encontrada) throw new ErrorTempoglass('buscar', `No existe la obra «${datos.nombre}» en Tempoglass.`)
        const enObra = await abrirObra(sesion, encontrada)
        obra = encontrada
        idIntObra = enObra.idInt
        avisar({ etapa: 'obraSeleccionada', obra, idIntObra })

        avisar({ etapa: 'creandoPedido' })
        pedido = await crearPedido(sesion, enObra, datos)
        avisar({ etapa: 'pedidoCreado', pedido })
      }

      avisar({ etapa: 'importando', pedido })
      const renglones = await importarPlanilla(sesion, pedido, datos.archivo, datos.esperado)
      avisar({ etapa: 'importado', renglones })

      avisar({ etapa: 'cerrando', pedido })
      await cerrarPedido(sesion, pedido)
      return { obra: obra!, idIntObra, pedido, renglones }
    },
    (intento, de, motivo) => avisar({ etapa: 'reintentando', intento, de, motivo }),
    op,
  )
}
