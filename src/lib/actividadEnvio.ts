/**
 * El título y el contenido (HTML) de la actividad de Monday (Emails & Activities) que registra un
 * envío por WhatsApp. Es el módulo "Run Code" del escenario de Make pasado a TypeScript TAL CUAL:
 * mismas entradas, mismas reglas y la misma salida. Se prueba en `tests/produccion.test.ts`.
 *
 * Entradas (`EntradaActividad`):
 *   - title / titulo     : el título de la actividad. Si no llega, se arma uno automático con el
 *                          período y los contactos.
 *   - documentos_enlaces : los links de Google Drive separados por coma (también ";", salto de
 *                          línea o un Array). Máx. 4 links.
 *   - wsp                : los números de WhatsApp separados por coma. También un Array.
 *   - contactos          : nombres separados por coma, Array de strings o Array de items de monday.
 *   - documentos         : OPCIONAL. Archivos, para el nombre visible de cada link y el período.
 *   - email              : OPCIONAL. Email remitente.
 *   - fechaDesde / fechaHasta : OPCIONALES. Mandan sobre el período.
 */

const MAX_ENLACES = 4
const ENCABEZADO = 'Envio de Resumen de cuenta corriente'
const SIN_CONTACTOS = 'Contacto no especificado'
const MAX_TITULO = 255
const SEPARADOR = ', '

/** Columnas del board de Contactos (sólo si llegan items de monday completos). */
const COL_CONTACTO = {
  NOMBRE: 'text_mm5848zg',
  APELLIDO: 'text_mm58q0bx',
}

export interface EntradaActividad {
  title?: string | null
  titulo?: string | null
  documentos_enlaces?: unknown
  documentosEnlaces?: unknown
  enlaces?: unknown
  wsp?: unknown
  contactos?: unknown
  documentos?: unknown
  email?: string | null
  fechaDesde?: string | null
  fechaHasta?: string | null
}

export interface ActividadEnvio {
  titulo: string
  content: string
  nombresContactos: string
  telefonos: string
  cantidadTelefonos: number
  cantidadDocumentos: number
  enlaces: string[]
  fechaDesde: string
  fechaHasta: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const aArray = (valor: unknown): any[] => (Array.isArray(valor) ? valor : valor ? [valor] : [])

/** Escapa texto para HTML y evita comillas dobles que rompan la mutation de GraphQL. */
const escaparHtml = (texto: unknown) =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\\/g, '&#92;')

/** Limpia texto plano que va dentro de la mutation (título). */
const limpiarTexto = (texto: unknown) =>
  String(texto ?? '')
    .replace(/\s+/g, ' ')
    .replace(/["\\]/g, "'")
    .trim()

const idDeDrive = (url: string) => {
  const m = String(url).match(/(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{10,})/)
  return m ? m[1] : String(url).toLowerCase()
}

const aplanarDocumento = (doc: any): any[] => {
  if (!doc) return []
  if (typeof doc === 'string') return [{ name: doc.trim() }]
  const columnas = doc.mappable_column_values
  if (columnas && typeof columnas === 'object') {
    const salida: any[] = []
    Object.values(columnas).forEach((col: any) => {
      if (col && Array.isArray(col.files)) salida.push(...col.files)
    })
    if (salida.length) return salida
  }
  if (Array.isArray(doc.files) && doc.files.length) return doc.files
  return [doc]
}

const REGEX_PERIODO = /(\d{2})[-_](\d{2})[-_](\d{4})[-_](\d{2})[-_](\d{2})[-_](\d{4})/

const extraerPeriodo = (texto: unknown): { desde: string; hasta: string } | null => {
  let valor = String(texto || '')
  try {
    valor = decodeURIComponent(valor)
  } catch {
    /* URL mal codificada: se usa tal cual */
  }
  const m = valor.match(REGEX_PERIODO)
  if (!m) return null
  return { desde: `${m[1]}/${m[2]}/${m[3]}`, hasta: `${m[4]}/${m[5]}/${m[6]}` }
}

const limpiarNombre = (valor: unknown) =>
  String(valor ?? '')
    .replace(/\s*\(?\bID[A-Z]+-\d+\)?/gi, '') // quita IDs tipo "(IDCLIENT-2666)" / "IDARQ-104"
    .replace(/[\s_-]+\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

const textoColumna = (contacto: any, columnId: string) => {
  const cvs = contacto && contacto.column_values
  if (!Array.isArray(cvs)) return ''
  const col = cvs.find((c: any) => c && c.id === columnId)
  if (!col) return ''
  for (const c of [col.display_value, col.text, col.label]) {
    if (c !== null && c !== undefined && String(c).trim() !== '') return String(c).trim()
  }
  return ''
}

const extraerNombreContacto = (contacto: any): string => {
  if (!contacto) return ''
  if (typeof contacto !== 'object') return limpiarNombre(contacto)
  const nombre = textoColumna(contacto, COL_CONTACTO.NOMBRE)
  const apellido = textoColumna(contacto, COL_CONTACTO.APELLIDO)
  const completo = [nombre, apellido].filter(Boolean).join(' ').trim()
  if (completo) return completo.replace(/\s+/g, ' ')
  return limpiarNombre(contacto.name || contacto.text || contacto.title || contacto.email || '')
}

export function armarActividadEnvio(input: EntradaActividad): ActividadEnvio {
  const documentos = aArray(input.documentos)
  const contactosRaw = aArray(input.contactos)
  const emailDestino = String(input.email || '').trim()

  // --- 1. Enlaces de Google Drive --------------------------------
  const enlacesEntrada = input.documentos_enlaces ?? input.documentosEnlaces ?? input.enlaces ?? ''
  const vistosEnlaces = new Set<string>()
  const enlaces = aArray(enlacesEntrada)
    .flatMap((valor) => String(valor ?? '').split(/[\s,;]+/))
    .map((valor) => valor.trim().replace(/[.,;]+$/, ''))
    .filter((valor) => /^https?:\/\//i.test(valor))
    .filter((valor) => {
      const clave = idDeDrive(valor)
      if (vistosEnlaces.has(clave)) return false
      vistosEnlaces.add(clave)
      return true
    })
    .slice(0, MAX_ENLACES)

  // --- 2. Teléfonos de WhatsApp ----------------------------------
  const telefonosLista = [
    ...new Set(
      aArray(input.wsp)
        .flatMap((valor) => String(valor ?? '').split(/[,;\n]+/))
        .map((valor) => valor.replace(/\D/g, ''))
        .filter(Boolean),
    ),
  ]
  const telefonos = telefonosLista.join(SEPARADOR)

  // --- 3. Nombres de archivo (opcionales) ------------------------
  const nombresArchivo = documentos
    .flatMap(aplanarDocumento)
    .map((archivo: any) => String(archivo?.name || archivo?.fileName || archivo?.file_name || '').trim())
    .filter(Boolean)

  // --- 4. Período (sólo se usa para el título automático) --------
  const desdeEntrada = String(input.fechaDesde || '').trim()
  const hastaEntrada = String(input.fechaHasta || '').trim()
  let periodo = desdeEntrada && hastaEntrada ? { desde: desdeEntrada, hasta: hastaEntrada } : null
  if (!periodo) {
    for (const candidato of [...nombresArchivo, ...enlaces]) {
      periodo = extraerPeriodo(candidato)
      if (periodo) break
    }
  }
  const fechaDesde = periodo ? periodo.desde : ''
  const fechaHasta = periodo ? periodo.hasta : ''

  // --- 5. Nombres de los contactos -------------------------------
  const vistosContactos = new Set<string>()
  const nombres = contactosRaw
    .flatMap((contacto) => (typeof contacto === 'string' ? contacto.split(',') : [contacto]))
    .map(extraerNombreContacto)
    .filter((nombre) => {
      if (!nombre || vistosContactos.has(nombre.toLowerCase())) return false
      vistosContactos.add(nombre.toLowerCase())
      return true
    })
  const nombresContactos = nombres.length ? nombres.join(SEPARADOR) : SIN_CONTACTOS

  // --- 6. Título -------------------------------------------------
  const tituloEntrada = limpiarTexto(input.title ?? input.titulo)
  const tramoPeriodo = periodo ? ` desde ${fechaDesde} hasta ${fechaHasta}` : ''
  let tituloFinal = tituloEntrada || limpiarTexto(`${ENCABEZADO}${tramoPeriodo} para ${nombresContactos}`)
  if (tituloFinal.length > MAX_TITULO) tituloFinal = tituloFinal.slice(0, MAX_TITULO - 3) + '...'

  // --- 7. Contenido HTML -----------------------------------------
  const lineas: string[] = []
  if (emailDestino) lineas.push(`✉️ Enviado desde: <b>${escaparHtml(emailDestino)}</b>`)
  if (!enlaces.length) {
    lineas.push('⚠️ No se encontraron documentos adjuntos')
  } else {
    const links = enlaces.map((url, i) => {
      const href = escaparHtml(url)
      const nombre = nombresArchivo[i] ? `${escaparHtml(nombresArchivo[i])}: ` : ''
      return `${nombre}<a href='${href}' target='_blank'>${href}</a>`
    })
    lineas.push(`📄 ${enlaces.length > 1 ? 'Archivos adjuntos' : 'Archivo adjunto'}: ${links.join(SEPARADOR)}`)
  }
  if (nombres.length && nombres.length === telefonosLista.length) {
    lineas.push('👤 Contactos asignados y WhatsApp:')
    nombres.forEach((nombre, i) => {
      lineas.push(`&nbsp;&nbsp;• ${escaparHtml(nombre)}: +${telefonosLista[i]}`)
    })
  } else {
    lineas.push(`👤 Contactos asignados: ${escaparHtml(nombresContactos)}`)
    lineas.push(
      telefonosLista.length
        ? `📱 Enviado por WhatsApp a: ${telefonosLista.map((t) => `+${t}`).join(SEPARADOR)}`
        : '⚠️ No se encontraron números de WhatsApp',
    )
  }
  const contenidoFinal = lineas.join('<br>')

  // --- 8. Retorno ------------------------------------------------
  return {
    titulo: tituloFinal,
    content: contenidoFinal,
    nombresContactos,
    telefonos,
    cantidadTelefonos: telefonosLista.length,
    cantidadDocumentos: enlaces.length,
    enlaces,
    fechaDesde,
    fechaHasta,
  }
}
