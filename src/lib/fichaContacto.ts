/**
 * Editar un cliente o un constructor/arquitecto desde la card del presupuesto (regla del usuario,
 * 14/10/2026): qué datos se editan de cada uno, cómo se validan y cómo se escriben en Monday. Son
 * reglas puras: la lectura y la escritura están en `services/monday/presupuestos.ts`.
 */
import { celularValido, digitos, normalizarCelular } from '@/lib/destinatario'

export type TipoCampo = 'texto' | 'celular' | 'email' | 'numero' | 'estado'

export interface CampoFicha {
  /** La columna de Monday (`name` es el nombre del ítem). */
  id: string
  rotulo: string
  tipo: TipoCampo
  requerido?: boolean
  placeholder?: string
}

/** Los datos que se editan, en el orden del formulario. Son las columnas "✋" (de carga manual) de cada tablero. */
export const CAMPOS_FICHA: Record<'Cliente' | 'Constructor', CampoFicha[]> = {
  Cliente: [
    { id: 'name', rotulo: 'Nombre', tipo: 'texto', requerido: true },
    { id: 'phone_mksydcv6', rotulo: 'Cel-WhatsApp', tipo: 'celular', placeholder: 'Ej.: 249 436-9123' },
    { id: 'email_mksynch6', rotulo: 'E-mail', tipo: 'email', placeholder: 'nombre@correo.com' },
    { id: 'text_mkwzq9z4', rotulo: 'CUIT / CUIL / DNI', tipo: 'texto', placeholder: 'Sólo números' },
    { id: 'color_mkszaw8z', rotulo: 'Tipo', tipo: 'estado' },
    { id: 'color_mkszas2x', rotulo: 'Condición fiscal', tipo: 'estado' },
  ],
  Constructor: [
    { id: 'name', rotulo: 'Nombre', tipo: 'texto', requerido: true },
    { id: 'color_mkszgwmv', rotulo: 'Categoría', tipo: 'estado' },
    { id: 'color_mkszaw8z', rotulo: 'Tipo', tipo: 'estado' },
    { id: 'phone_mksydcv6', rotulo: 'Cel-WhatsApp', tipo: 'celular', placeholder: 'Ej.: 249 436-9123' },
    { id: 'email_mksynch6', rotulo: 'E-mail', tipo: 'email', placeholder: 'nombre@correo.com' },
    { id: 'numeric_mksy21gb', rotulo: 'CUIT', tipo: 'numero', placeholder: 'Sólo números' },
    { id: 'color_mkszas2x', rotulo: 'Condición fiscal', tipo: 'estado' },
  ],
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lo que está mal en el formulario, por campo. Vacío = se puede guardar. */
export function erroresFicha(campos: readonly CampoFicha[], valores: Record<string, string>): Record<string, string> {
  const e: Record<string, string> = {}
  for (const c of campos) {
    const v = (valores[c.id] ?? '').trim()
    if (!v) {
      if (c.requerido) e[c.id] = `Ingresá el ${c.rotulo.toLowerCase()}.`
      continue
    }
    if (c.tipo === 'celular' && !celularValido(normalizarCelular(v))) {
      e[c.id] = 'El celular tiene que tener la característica y el número (10 dígitos), con o sin el 54 9.'
    }
    if (c.tipo === 'email' && !EMAIL.test(v)) e[c.id] = 'El e-mail no tiene un formato válido.'
    if (c.tipo === 'numero' && !/^\d+$/.test(digitos(v))) e[c.id] = 'Ingresá sólo números.'
    if (c.id === 'text_mkwzq9z4' && !/^[\d\s.-]+$/.test(v)) e[c.id] = 'Ingresá sólo números (puede llevar guiones).'
  }
  return e
}

/**
 * Los valores para `change_multiple_column_values`, SÓLO de lo que cambió: lo que no se tocó no se
 * reescribe. Un campo que se vació, se borra en Monday (salvo el nombre, que es obligatorio).
 */
export function valoresMonday(
  campos: readonly CampoFicha[],
  antes: Record<string, string>,
  despues: Record<string, string>,
): Record<string, unknown> {
  const v: Record<string, unknown> = {}
  for (const c of campos) {
    const nuevo = (despues[c.id] ?? '').trim()
    const viejo = (antes[c.id] ?? '').trim()
    const igual = c.tipo === 'celular' ? normalizarCelular(nuevo) === normalizarCelular(viejo) : nuevo === viejo
    if (igual) continue
    if (c.tipo === 'texto') v[c.id] = nuevo
    else if (c.tipo === 'celular') v[c.id] = nuevo ? { phone: normalizarCelular(nuevo), countryShortName: 'AR' } : ''
    else if (c.tipo === 'email') v[c.id] = nuevo ? { email: nuevo, text: nuevo } : ''
    else if (c.tipo === 'numero') v[c.id] = digitos(nuevo)
    else v[c.id] = nuevo ? { label: nuevo } : ''
  }
  return v
}
