/**
 * Google Drive: el PDF de la OP se sube a la carpeta "Sistema / imagenes" de la cuenta de Polifroni y
 * se comparte con "cualquiera con el enlace" como lector. WhatsApp (360messenger) no recibe el
 * archivo en el pedido: lo baja de esa dirección. Es lo que hacían los módulos 32 y 35 del escenario
 * de envío.
 *
 * Se habla con la API REST de Drive con un token OAuth de la cuenta dueña de la carpeta: la carpeta
 * es de una cuenta de Gmail, y ahí una cuenta de servicio no puede guardar archivos (no tiene
 * espacio propio). El token se renueva solo con el refresh token.
 *
 * Variables (sólo del servidor):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   el cliente OAuth (Google Cloud → Credenciales)
 *   GOOGLE_REFRESH_TOKEN                     el refresh token de polifroniaberturas@gmail.com,
 *                                            con el permiso https://www.googleapis.com/auth/drive
 *   GOOGLE_DRIVE_FOLDER_ID                   (opcional) la carpeta; por defecto, la del escenario
 */

/** "Sistema / imagenes", la carpeta que usaba el escenario. */
const CARPETA_ESCENARIO = '1p8AXx_UoETvq90J2Jee9lLphrEp2ejUO'

export class ErrorDrive extends Error {}

/**
 * El refresh token ya no sirve (`invalid_grant`): venció o se revocó el acceso. Se arregla generando
 * uno nuevo con la cuenta de Polifroni y reemplazando GOOGLE_REFRESH_TOKEN; no hace falta tocar código.
 */
export class ErrorTokenDrive extends ErrorDrive {}

export interface ArchivoCompartido {
  id: string
  /** Descarga directa: es la que se le pasa a WhatsApp. */
  webContentLink: string
  /** La vista en Drive: el link que queda guardado en la OP. */
  webViewLink: string
}

const falta = () =>
  ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'].filter((k) => !process.env[k]?.trim())

export const driveConfigurado = (): boolean => falta().length === 0

async function token(): Promise<string> {
  const faltan = falta()
  if (faltan.length) throw new ErrorDrive(`faltan ${faltan.join(', ')}`)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!.trim(),
      grant_type: 'refresh_token',
    }),
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string }
  if (j.error === 'invalid_grant') throw new ErrorTokenDrive('el refresh token de Google venció o fue revocado')
  if (!r.ok || !j.access_token) throw new ErrorDrive(`no se pudo obtener el token de Google (${j.error ?? r.status})`)
  return j.access_token
}

export async function subirYCompartir(datos: Uint8Array<ArrayBuffer>, nombre: string, tipo: string): Promise<ArchivoCompartido> {
  const acceso = await token()
  const carpeta = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || CARPETA_ESCENARIO

  /* Subida multipart: los metadatos (nombre y carpeta) y los bytes en un solo pedido. */
  const limite = `polifroni${Date.now()}`
  const meta = JSON.stringify({ name: nombre, parents: [carpeta] })
  const cuerpo = new Blob([
    `--${limite}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${limite}\r\ncontent-type: ${tipo || 'application/pdf'}\r\n\r\n`,
    datos,
    `\r\n--${limite}--`,
  ])
  const subida = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webContentLink,webViewLink',
    {
      method: 'POST',
      headers: { authorization: `Bearer ${acceso}`, 'content-type': `multipart/related; boundary=${limite}` },
      body: cuerpo,
    },
  )
  const archivo = (await subida.json().catch(() => ({}))) as Partial<ArchivoCompartido> & { error?: { message?: string } }
  if (!subida.ok || !archivo.id) {
    throw new ErrorDrive(`no se pudo subir el archivo a Drive (${archivo.error?.message ?? subida.status})`)
  }

  /* Cualquiera con el enlace lo puede ver, sin que aparezca en búsquedas. */
  const permiso = await fetch(`https://www.googleapis.com/drive/v3/files/${archivo.id}/permissions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${acceso}`, 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }),
  })
  if (!permiso.ok) throw new ErrorDrive(`no se pudo compartir el archivo en Drive (${permiso.status})`)

  return {
    id: archivo.id,
    webContentLink: archivo.webContentLink ?? `https://drive.google.com/uc?id=${archivo.id}&export=download`,
    webViewLink: archivo.webViewLink ?? `https://drive.google.com/file/d/${archivo.id}/view`,
  }
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Facturas de obra: el PDF de cada comprobante emitido, guardado (no compartido) en
 * <año> / Facturas Obras / <AAAA-MM-DD>, en el mismo Drive de Polifroni.
 * ──────────────────────────────────────────────────────────────────────────────── */

const CARPETA = 'application/vnd.google-apps.folder'
/** La carpeta de las facturas de obra, dentro de la del año. */
export const CARPETA_FACTURAS = 'Facturas Obras'

/** Lo que queda en Drive: el archivo y la carpeta, para mostrarlos. */
export interface FacturaEnDrive {
  id: string
  webViewLink: string
  /** "2026 / Facturas Obras / 2026-10-14". */
  ruta: string
  /** Ya estaba (un reintento): no se volvió a subir. */
  yaEstaba: boolean
}

/** Las comillas simples van escapadas en la consulta de Drive. */
const literal = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

async function buscar(acceso: string, q: string): Promise<{ id: string; name: string }[]> {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '20', orderBy: 'createdTime' })}`,
    { headers: { authorization: `Bearer ${acceso}` } },
  )
  const j = (await r.json().catch(() => ({}))) as { files?: { id: string; name: string }[]; error?: { message?: string } }
  if (!r.ok) throw new ErrorDrive(`no se pudo buscar en Drive (${j.error?.message ?? r.status})`)
  return j.files ?? []
}

/** Las carpetas con ese nombre (dentro de `padre`, si se dice). Sólo las propias y sin borrar. */
const carpetas = (acceso: string, nombre: string, padre?: string) =>
  buscar(
    acceso,
    `mimeType='${CARPETA}' and name=${literal(nombre)} and trashed=false and 'me' in owners${padre ? ` and ${literal(padre)} in parents` : ''}`,
  )

async function crearCarpeta(acceso: string, nombre: string, padre: string): Promise<string> {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { authorization: `Bearer ${acceso}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: CARPETA, parents: [padre] }),
  })
  const j = (await r.json().catch(() => ({}))) as { id?: string; error?: { message?: string } }
  if (!r.ok || !j.id) throw new ErrorDrive(`no se pudo crear la carpeta "${nombre}" en Drive (${j.error?.message ?? r.status})`)
  return j.id
}

/** La carpeta `nombre` dentro de `padre`: la que ya existe (la más vieja, si hubiera dos) o una nueva. */
async function carpetaEn(acceso: string, nombre: string, padre: string): Promise<string> {
  const hay = await carpetas(acceso, nombre, padre)
  return hay[0]?.id ?? (await crearCarpeta(acceso, nombre, padre))
}

/**
 * La carpeta del año ("2026"). Con `GOOGLE_DRIVE_FACTURAS_ID` (la carpeta "Facturas Obras" fija) no se
 * busca nada. Si hay varias carpetas con el nombre del año, se usa la que ya tiene "Facturas Obras";
 * si no se puede decidir, no se adivina: se avisa.
 */
async function carpetaFacturas(acceso: string, anio: string): Promise<{ id: string; ruta: string }> {
  const fija = process.env.GOOGLE_DRIVE_FACTURAS_ID?.trim()
  if (fija) return { id: fija, ruta: CARPETA_FACTURAS }
  const anios = await carpetas(acceso, anio)
  if (!anios.length) throw new ErrorDrive(`no está la carpeta "${anio}" en el Drive de Polifroni`)
  let elegida = anios.length === 1 ? anios[0] : null
  if (!elegida) {
    for (const a of anios) {
      if ((await carpetas(acceso, CARPETA_FACTURAS, a.id)).length) {
        elegida = a
        break
      }
    }
  }
  if (!elegida) {
    throw new ErrorDrive(
      `hay ${anios.length} carpetas "${anio}" en el Drive y ninguna tiene "${CARPETA_FACTURAS}": definí GOOGLE_DRIVE_FACTURAS_ID con la carpeta correcta`,
    )
  }
  return { id: await carpetaEn(acceso, CARPETA_FACTURAS, elegida.id), ruta: `${anio} / ${CARPETA_FACTURAS}` }
}

/**
 * Guarda el PDF de una factura de obra en <año> / Facturas Obras / <fecha> (la fecha, "2026-10-14"). La
 * carpeta del día se crea sólo si no existe. Si en ella ya hay un archivo con ese nombre (un reintento),
 * no se sube otro. El archivo queda privado: no se comparte con nadie.
 */
export async function guardarFacturaObra(datos: Uint8Array<ArrayBuffer>, nombre: string, fecha: string): Promise<FacturaEnDrive> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ErrorDrive(`fecha inválida: ${fecha}`)
  const acceso = await token()
  const base = await carpetaFacturas(acceso, fecha.slice(0, 4))
  const dia = await carpetaEn(acceso, fecha, base.id)
  const ruta = `${base.ruta} / ${fecha}`

  const existente = (await buscar(acceso, `name=${literal(nombre)} and ${literal(dia)} in parents and trashed=false`))[0]
  if (existente) return { id: existente.id, webViewLink: `https://drive.google.com/file/d/${existente.id}/view`, ruta, yaEstaba: true }

  const limite = `polifroni${Date.now()}`
  const meta = JSON.stringify({ name: nombre, parents: [dia] })
  const cuerpo = new Blob([
    `--${limite}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${limite}\r\ncontent-type: application/pdf\r\n\r\n`,
    datos,
    `\r\n--${limite}--`,
  ])
  const subida = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { authorization: `Bearer ${acceso}`, 'content-type': `multipart/related; boundary=${limite}` },
    body: cuerpo,
  })
  const archivo = (await subida.json().catch(() => ({}))) as { id?: string; webViewLink?: string; error?: { message?: string } }
  if (!subida.ok || !archivo.id) throw new ErrorDrive(`no se pudo subir la factura a Drive (${archivo.error?.message ?? subida.status})`)
  return { id: archivo.id, webViewLink: archivo.webViewLink ?? `https://drive.google.com/file/d/${archivo.id}/view`, ruta, yaEstaba: false }
}
