/**
 * La lectura del listado HETMO con la que se armó la OP final de cada OP de PVC, en la base Postgres
 * (Neon), tabla `lectura_op`.
 *
 * Para qué: editar una OP ("Editar Órdenes de Producción") vuelve a armar su OP final cambiando
 * sólo las aberturas editadas. Sin la lectura guardada habría que volver a leer el PDF original con
 * la IA (uno o dos minutos), y una OP ya editada —cuyos modelos vienen de DOS documentos— no se
 * podría volver a leer bien: el original y el dibujo nuevo traen el mismo modelo dos veces.
 *
 * La tabla se crea sola la primera vez (`create table if not exists`): no hay migración que correr.
 */
import { consultar } from './_db.js'

let lista: Promise<void> | null = null

function asegurarTabla(): Promise<void> {
  lista ??= consultar(
    `create table if not exists lectura_op (
       orden_id text primary key,
       lectura jsonb not null,
       actualizada timestamptz not null default now()
     )`,
  ).then(() => undefined)
  lista.catch(() => {
    lista = null
  })
  return lista
}

/** Un id de ítem de Monday: sólo dígitos. Cualquier otra cosa no llega a la base. */
export const idValido = (id: string): boolean => /^\d{1,20}$/.test(id)

export async function leerLecturaOp(ordenId: string): Promise<unknown | null> {
  await asegurarTabla()
  const filas = await consultar<{ lectura: unknown }>('select lectura from lectura_op where orden_id = $1', [ordenId])
  return filas[0]?.lectura ?? null
}

export async function guardarLecturaOp(ordenId: string, lectura: unknown): Promise<void> {
  await asegurarTabla()
  await consultar(
    `insert into lectura_op (orden_id, lectura, actualizada) values ($1, $2, now())
     on conflict (orden_id) do update set lectura = excluded.lectura, actualizada = now()`,
    [ordenId, JSON.stringify(lectura)],
  )
}
