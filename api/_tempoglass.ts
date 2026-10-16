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
const TIEMPO_MAXIMO_MS = 20_000
const NAVEGADOR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

/** Los pasos del robot, para decir dónde falló. */
export type PasoTempoglass = 'credenciales' | 'login' | 'obras' | 'buscar'

export class ErrorTempoglass extends Error {
  constructor(
    readonly paso: PasoTempoglass,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = 'ErrorTempoglass'
  }
}

/** Una fila de la tabla de obras de Tempoglass. `id` es su "Id.Int.Obra" (p. ej. "4715"). */
export interface ObraTempoglass {
  id: string
  nombre: string
  descripcion: string
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
    const res = await fetch(BASE + ruta, {
      ...init,
      headers,
      /* Las redirecciones se miran a mano: un 302 a /login es la forma en que Laravel dice
         "credenciales malas" o "sesión vencida", y siguiéndolo solo se perdería. */
      redirect: 'manual',
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    })
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
  const $ = cheerio.load(html)
  const componentes: ComponenteLivewire[] = []
  $('[wire\\:initial-data]').each((_, el) => {
    try {
      componentes.push(JSON.parse($(el).attr('wire:initial-data') ?? '') as ComponenteLivewire)
    } catch {
      /* Un atributo ilegible no es el componente que buscamos. */
    }
  })
  const conTabla = componentes.find((c) => {
    const tabla = c.serverMemo?.data?.table
    return tabla !== null && typeof tabla === 'object'
  })
  return conTabla ?? (componentes.length === 1 ? componentes[0]! : null)
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
    filas.push({ id, nombre, descripcion: iDescripcion >= 0 ? (celdas[iDescripcion] ?? '') : '' })
  })
  return filas
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

/** Entra a Tempoglass: toma el `_token` del formulario y manda email y contraseña. */
export async function iniciarSesion(): Promise<Sesion> {
  const { email, password } = credenciales()
  const sesion = new Sesion()

  const formulario = await sesion.pedir('/login')
  if (!formulario.ok) throw new ErrorTempoglass('login', `La página de login respondió HTTP ${formulario.status}.`)
  const token = tokenDeFormulario(await formulario.text())
  if (!token) throw new ErrorTempoglass('login', 'La página de login no trae el formulario esperado.')

  const res = await sesion.pedir('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', referer: `${BASE}/login` },
    body: new URLSearchParams({ _token: token, email, password }).toString(),
  })
  /* Bien: 302 a la pantalla de inicio. Mal: 302 de vuelta a /login (credenciales) o 419 (token). */
  if (res.status !== 302 || vuelveAlLogin(res)) {
    throw new ErrorTempoglass(
      'login',
      res.status === 419 ? 'Tempoglass rechazó el token del formulario (419).' : 'Tempoglass rechazó el usuario o la contraseña.',
    )
  }
  return sesion
}

/** La pantalla de obras, lista para buscar. */
interface PantallaObras {
  csrf: string
  componente: ComponenteLivewire
}

/** Abre `/obra` y verifica que se haya dibujado el buscador antes de usarlo. */
export async function abrirObras(sesion: Sesion): Promise<PantallaObras> {
  const res = await sesion.pedir('/obra')
  if (res.status === 302) throw new ErrorTempoglass('obras', 'Tempoglass no reconoció la sesión al abrir Obras.')
  if (!res.ok) throw new ErrorTempoglass('obras', `Obras respondió HTTP ${res.status}.`)
  const html = await res.text()

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
  const { fingerprint, serverMemo } = pantalla.componente
  const res = await sesion.pedir(`/livewire/message/${fingerprint.name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/html, application/xhtml+xml',
      'x-csrf-token': pantalla.csrf,
      'x-livewire': 'true',
      referer: `${BASE}/obra`,
    },
    body: JSON.stringify({
      fingerprint,
      serverMemo,
      updates: [
        {
          type: 'syncInput',
          payload: { id: Math.random().toString(36).slice(2, 7), name: 'table.search', value: texto },
        },
      ],
    }),
  })
  if (!res.ok) throw new ErrorTempoglass('buscar', `El buscador respondió HTTP ${res.status}.`)
  const cuerpo = (await res.json().catch(() => null)) as { effects?: { html?: string | null } } | null
  const html = cuerpo?.effects?.html
  if (typeof html !== 'string') throw new ErrorTempoglass('buscar', 'El buscador no devolvió la tabla.')
  return filasDeObras(html)
}

/** Todo el recorrido: entrar, abrir Obras, buscar. Sólo lee: no crea ni cambia nada en Tempoglass. */
export async function buscarObraTempoglass(nombre: string): Promise<BusquedaObra> {
  const sesion = await iniciarSesion()
  const pantalla = await abrirObras(sesion)
  const resultados = await buscarEnObras(sesion, pantalla, nombre)
  return { buscado: nombre, resultados, encontrada: obraExacta(resultados, nombre) }
}
