/**
 * Genera un GOOGLE_REFRESH_TOKEN nuevo para Google Drive (el que usa `api/_drive.ts` para subir los
 * PDF que se mandan por WhatsApp).
 *
 *   node scripts/google-refresh-token.mjs
 *
 * 1. Lee GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET de .env.local.
 * 2. Abre el navegador en el permiso de Google: hay que entrar con polifroniaberturas@gmail.com (la
 *    dueña de la carpeta de Drive) y aceptar. Si avisa "Google no verificó esta app": Configuración
 *    avanzada → Ir a … (no seguro) → Continuar.
 * 3. Recibe la respuesta en http://localhost:53682, pide el refresh token, lo escribe en .env.local y
 *    lo muestra para copiarlo a Vercel.
 *
 * Si el cliente OAuth es de tipo "Aplicación web", antes hay que agregarle el URI de redirección
 * http://localhost:53682 (Credenciales → el cliente → URIs de redireccionamiento autorizados). Uno de
 * tipo "Escritorio" no lo necesita.
 */
import { exec } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'

const ARCHIVO = '.env.local'
const PUERTO = 53682
const REDIRECCION = `http://localhost:${PUERTO}`
const PERMISO = 'https://www.googleapis.com/auth/drive'

const texto = fs.readFileSync(ARCHIVO, 'utf8')
const leer = (k) => texto.match(new RegExp(`^${k}=["']?([^"'\\r\\n]*)`, 'm'))?.[1]?.trim() ?? ''
const clientId = leer('GOOGLE_CLIENT_ID')
const clientSecret = leer('GOOGLE_CLIENT_SECRET')
if (!clientId || !clientSecret) {
  console.error(`Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en ${ARCHIVO}.`)
  process.exit(1)
}

const url =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECCION,
    response_type: 'code',
    scope: PERMISO,
    /* offline + consent: así Google devuelve SIEMPRE un refresh token nuevo. */
    access_type: 'offline',
    prompt: 'consent',
    login_hint: 'polifroniaberturas@gmail.com',
  })

const servidor = http.createServer(async (req, res) => {
  const q = new URL(req.url ?? '/', REDIRECCION).searchParams
  if (!q.get('code') && !q.get('error')) return res.end()
  const terminar = (msj, ok) => {
    res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
    res.end(`<p style="font:16px sans-serif;margin:40px">${msj}</p>`)
    servidor.close()
  }
  if (q.get('error')) {
    console.error('Google respondió:', q.get('error'))
    return terminar('No se dio el permiso. Volvé a la terminal.', false)
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: q.get('code'),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECCION,
      grant_type: 'authorization_code',
    }),
  })
  const j = await r.json()
  if (!j.refresh_token) {
    console.error('No llegó el refresh token:', j.error, j.error_description ?? '')
    return terminar('No se pudo obtener el token. Volvé a la terminal.', false)
  }
  /* Se reemplaza en .env.local (o se agrega si no estaba). */
  const linea = `GOOGLE_REFRESH_TOKEN=${j.refresh_token}`
  const nuevo = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(texto)
    ? texto.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, linea)
    : `${texto.replace(/\s*$/, '')}\n${linea}\n`
  fs.writeFileSync(ARCHIVO, nuevo)
  console.log(`\nListo: GOOGLE_REFRESH_TOKEN actualizado en ${ARCHIVO} (permiso: ${j.scope}).`)
  console.log('\nCopialo también en Vercel (Settings → Environment Variables → GOOGLE_REFRESH_TOKEN) y redeployá:\n')
  console.log(j.refresh_token + '\n')
  console.log('Reiniciá npm run dev para que lo tome.')
  terminar('¡Listo! Ya podés cerrar esta pestaña y volver a la terminal.', true)
})

servidor.listen(PUERTO, () => {
  console.log('Abrí este enlace si el navegador no se abre solo, y entrá con polifroniaberturas@gmail.com:\n')
  console.log(url + '\n')
  const abrir = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`
  exec(abrir)
})
