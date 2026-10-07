/**
 * Los prompts de la IA, en texto plano en la carpeta `prompts/` (en la raíz del proyecto): así se leen
 * y se corrigen sin tocar el código. Ver `prompts/LEEME.md`.
 *
 * Se leen del disco en cada pedido (son unos pocos KB): en local, un cambio en el archivo se aplica en
 * la próxima lectura, sin reiniciar. En Vercel los archivos viajan con la función (`includeFiles` en
 * `vercel.json`), así que un cambio se aplica con el próximo deploy.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Los prompts que existen. Un nombre nuevo se agrega acá y en `prompts/`. */
export type NombrePrompt =
  | 'hetmo-aberturas-vidrios.sistema'
  | 'hetmo-aberturas-vidrios.pedido'
  | 'hetmo-edicion.sistema'
  | 'hetmo-edicion.pedido'
  | 'listado-hetmo.sistema'
  | 'listado-hetmo.pedido'

/**
 * El texto del prompt. Los saltos de línea de Windows pasan a `\n` y se quita el salto final que agregan
 * los editores: la IA recibe el mismo texto que antes estaba en el código. Un archivo que falta o está
 * vacío es un error (no se manda a la IA una consigna vacía).
 */
export function leerPrompt(nombre: NombrePrompt): string {
  const ruta = join(process.cwd(), 'prompts', `${nombre}.txt`)
  const texto = readFileSync(ruta, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trimEnd()
  if (!texto) throw new Error(`el prompt ${nombre} está vacío`)
  return texto
}
