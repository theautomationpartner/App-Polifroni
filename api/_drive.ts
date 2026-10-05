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
