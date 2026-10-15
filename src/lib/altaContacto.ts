/**
 * Alta de un cliente o de un constructor/arquitecto desde la Etapa 1 del presupuesto: las reglas puras.
 * La consulta a ARCA está en `services/arca.ts`; la escritura en Monday, en `services/monday/presupuestos.ts`.
 *
 * El formulario trabaja con claves lógicas (`cuit`, `condicion`…) porque el mismo dato vive en columnas
 * distintas según el tablero (el CUIT es texto en Clientes y número en Constructor/Arquitecto);
 * `aColumnas` las traduce a las columnas de `CAMPOS_FICHA`, las mismas que usa la edición de la card.
 */
import { CAMPOS_FICHA, erroresFicha, valoresMonday } from '@/lib/fichaContacto'
import type { DatosDeArca } from '@/services/arca'

export type TipoAlta = 'Cliente' | 'Constructor'
export type ClaveAlta = 'nombre' | 'cuit' | 'categoria' | 'tipo' | 'condicion' | 'celular' | 'email'

/** La frase EXACTA que va debajo de un dato que la consulta no trajo (regla del usuario, 15/10/2026). */
export const DATO_NO_ENCONTRADO = 'No se encontro este dato en la consulta'

/** Los campos de cada formulario, en orden. El del constructor suma la categoría. */
export const CLAVES_ALTA: Record<TipoAlta, readonly ClaveAlta[]> = {
  Cliente: ['nombre', 'cuit', 'tipo', 'condicion', 'celular', 'email'],
  Constructor: ['nombre', 'cuit', 'categoria', 'tipo', 'condicion', 'celular', 'email'],
}

export const ROTULO_ALTA: Record<ClaveAlta, string> = {
  nombre: 'Nombre / Razón social',
  cuit: 'CUIT / CUIL',
  categoria: 'Categoría',
  tipo: 'Tipo',
  condicion: 'Condición fiscal',
  celular: 'Cel-WhatsApp',
  email: 'E-mail',
}

/** La columna de cada clave, por tablero. */
const COLUMNA: Record<TipoAlta, Partial<Record<ClaveAlta, string>>> = {
  Cliente: {
    nombre: 'name',
    cuit: 'text_mkwzq9z4',
    tipo: 'color_mkszaw8z',
    condicion: 'color_mkszas2x',
    celular: 'phone_mksydcv6',
    email: 'email_mksynch6',
  },
  Constructor: {
    nombre: 'name',
    cuit: 'numeric_mksy21gb',
    categoria: 'color_mkszgwmv',
    tipo: 'color_mkszaw8z',
    condicion: 'color_mkszas2x',
    celular: 'phone_mksydcv6',
    email: 'email_mksynch6',
  },
}

export type ValoresAlta = Record<ClaveAlta, string>

export const alVacio = (): ValoresAlta => ({ nombre: '', cuit: '', categoria: '', tipo: '', condicion: '', celular: '', email: '' })

export const soloDigitos = (v: string) => v.replace(/\D/g, '')

/** 20-12345678-9, mientras se escribe (lo que sobra de 11 dígitos se descarta). */
export function formatoCuit(v: string): string {
  const d = soloDigitos(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`
}

/** Un CUIT/CUIL válido: 11 dígitos con el verificador (módulo 11) que calcula ARCA. */
export function cuitValido(v: string): boolean {
  const d = soloDigitos(v)
  if (d.length !== 11) return false
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0)
  const resto = 11 - (suma % 11)
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto
  return verificador === Number(d[10])
}

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** La etiqueta del tablero que corresponde al texto, o '' si el tablero no la tiene. */
const etiquetaDe = (candidata: string, opciones: readonly string[]): string =>
  opciones.find((o) => sinTildes(o) === sinTildes(candidata)) ?? ''

/** Personas físicas: 20, 23, 24, 27. Personas jurídicas: 30, 33, 34. */
export function tipoDeCuit(cuit: string): 'Empresa' | 'Persona Física' | '' {
  const p = soloDigitos(cuit).slice(0, 2)
  if (['30', '33', '34'].includes(p)) return 'Empresa'
  if (['20', '23', '24', '27'].includes(p)) return 'Persona Física'
  return ''
}

const CONDICION: Record<string, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'Responsable Monotributista',
  EXENTO: 'EXENTO',
  CONSUMIDOR_FINAL: 'Consumidor Final',
}

/**
 * Lo que ARCA completa en el formulario: la razón social, la condición fiscal y el tipo (empresa o persona
 * física, que sale del prefijo del CUIT). Una etiqueta que el tablero no tiene NO se devuelve: se escribe
 * con `create_labels_if_missing: false`, y una etiqueta inexistente haría fallar el alta entera. El dato
 * que no vuelve queda vacío (y se marca en rojo).
 */
export function desdeArca(
  datos: DatosDeArca,
  opciones: { tipo: readonly string[]; condicion: readonly string[] },
): Partial<ValoresAlta> {
  const r: Partial<ValoresAlta> = {}
  if (datos.razonSocial) r.nombre = datos.razonSocial
  const tipo = etiquetaDe(tipoDeCuit(datos.cuit), opciones.tipo)
  if (tipo) r.tipo = tipo
  const condicion = etiquetaDe(CONDICION[datos.condicionIva] ?? '', opciones.condicion)
  if (condicion) r.condicion = condicion
  return r
}

/** Los valores del formulario, por columna de Monday (la forma de `CAMPOS_FICHA`). */
export function aColumnas(tipo: TipoAlta, v: ValoresAlta): Record<string, string> {
  const r: Record<string, string> = {}
  for (const [clave, col] of Object.entries(COLUMNA[tipo]) as [ClaveAlta, string][]) {
    r[col] = clave === 'cuit' ? soloDigitos(v[clave]) : v[clave].trim()
  }
  return r
}

/** Lo que está mal, por clave: el nombre, el CUIT y el celular obligatorios, y el formato del celular y del e-mail. */
export function erroresAlta(tipo: TipoAlta, v: ValoresAlta): Partial<Record<ClaveAlta, string>> {
  const e: Partial<Record<ClaveAlta, string>> = {}
  if (!v.cuit.trim()) e.cuit = 'Ingresá el CUIT o CUIL.'
  else if (!cuitValido(v.cuit)) e.cuit = 'El CUIT o CUIL no es válido: revisá los 11 números.'
  const porColumna = erroresFicha(CAMPOS_FICHA[tipo], aColumnas(tipo, v))
  for (const [clave, col] of Object.entries(COLUMNA[tipo]) as [ClaveAlta, string][]) {
    if (clave !== 'cuit' && porColumna[col]) e[clave] = porColumna[col]
  }
  /* Sin Cel-WhatsApp no se le pueden enviar los presupuestos (regla del usuario, 15/10/2026). */
  if (!v.celular.trim()) e.celular = 'Ingresá el Cel-WhatsApp: sin él no se le pueden enviar los presupuestos.'
  return e
}

/** Las columnas para `create_item`: sólo lo cargado, sin el nombre (va aparte como `item_name`). */
export function columnasParaCrear(tipo: TipoAlta, v: ValoresAlta): Record<string, unknown> {
  const { name: _nombre, ...resto } = valoresMonday(CAMPOS_FICHA[tipo], {}, aColumnas(tipo, v))
  return resto
}
