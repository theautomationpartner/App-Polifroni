/**
 * Numeración de las Órdenes de Producción, en la base Postgres (Neon) de la app: tabla
 * `numeracion_op`, un registro por tipo con el ÚLTIMO número usado (ver `db/numeracion.sql`).
 *
 * Es la lógica pura, sin el guardián: la usa `api/numeracion.ts` (detrás de la firma, la lista
 * blanca y el segundo factor) y, en desarrollo, el servidor de Vite.
 *
 *  - `leer`      el último de cada tipo (lo que la pantalla muestra como próximo es `ultimo + 1`).
 *  - `reservar`  toma el SIGUIENTE en una sola sentencia (`ultimo = ultimo + 1 … returning`): dos
 *                personas creando una OP a la vez nunca reciben el mismo número. Si una OP se
 *                abandona, su número queda como hueco: preferible a uno repetido en el taller.
 *  - `registrar` deja un número escrito a mano como usado, sin retroceder nunca el contador
 *                (`greatest`).
 */
import { consultar } from './_db.js'

export type TipoOrden = 'PVC' | 'Aluminio'

/** Cómo lo ve la app: Aluminio con su "A" adelante. */
export interface Numeracion {
  nroOrdenPVC: string
  nroOrdenAluminio: string
}

const formato = (tipo: TipoOrden, n: number): string => (tipo === 'Aluminio' ? `A${n}` : String(n))

/** "A3001" → 3001, "3001" → 3001. */
export const valor = (s: string | undefined): number => Number(String(s ?? '').replace(/\D/g, '')) || 0

/**
 * La tabla y su arranque, una vez por instancia (es idempotente: no pisa números existentes).
 * Arranque: PVC 2290 (definido por el usuario); Aluminio 3010 (el A-más alto del tablero de órdenes
 * el 02/10/2026).
 */
let lista: Promise<void> | null = null
function asegurar(): Promise<void> {
  lista ??= (async () => {
    await consultar(`
      create table if not exists numeracion_op (
        tipo           text        primary key check (tipo in ('PVC', 'Aluminio')),
        ultimo         integer     not null check (ultimo >= 0),
        actualizado_en timestamptz not null default now()
      )`)
    await consultar(
      `insert into numeracion_op (tipo, ultimo) values ('PVC', 2290), ('Aluminio', 3010)
       on conflict (tipo) do nothing`,
    )
  })().catch((e) => {
    lista = null
    throw e
  })
  return lista
}

export async function leer(): Promise<Numeracion> {
  await asegurar()
  const filas = await consultar<{ tipo: TipoOrden; ultimo: number }>(`select tipo, ultimo from numeracion_op`)
  const de = (t: TipoOrden) => filas.find((f) => f.tipo === t)?.ultimo ?? 0
  return { nroOrdenPVC: formato('PVC', de('PVC')), nroOrdenAluminio: formato('Aluminio', de('Aluminio')) }
}

/** Reserva el siguiente número del tipo y lo devuelve ya con su formato ("2291", "A3011"). */
export async function reservar(tipo: TipoOrden): Promise<string> {
  await asegurar()
  const [fila] = await consultar<{ ultimo: number }>(
    `update numeracion_op set ultimo = ultimo + 1, actualizado_en = now() where tipo = $1 returning ultimo`,
    [tipo],
  )
  if (!fila) throw new Error(`No está la numeración de ${tipo}`)
  return formato(tipo, fila.ultimo)
}

/** Deja `numero` como usado si es mayor que el último. Devuelve la numeración resultante. */
export async function registrar(tipo: TipoOrden, numero: string): Promise<Numeracion> {
  await asegurar()
  await consultar(
    `update numeracion_op set ultimo = greatest(ultimo, $2), actualizado_en = now() where tipo = $1`,
    [tipo, valor(numero)],
  )
  return leer()
}
