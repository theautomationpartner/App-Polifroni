import { memoGlobal } from './cache'
import { mondayApi } from './sdk'

/**
 * 👤 Legajo Empleados-CV: de acá sale la lista de "Medido por".
 *
 * Se lee SÓLO el nombre y el estado. El tablero es un legajo (DNI, sueldos, CV) y para armar un
 * desplegable no hace falta nada más: pedir menos columnas es no traer datos sensibles al navegador.
 */
const BOARD_PERSONAL = 9660419259
const COL_ESTADO = 'status'
/**
 * Sólo la gente que trabaja hoy en la empresa. El mismo tablero guarda las bajas y los CV que
 * llegan por formulario ("Cv Recibido"), y ninguno de los dos puede haber medido una obra.
 */
const ESTADO_ACTIVO = 'Contratado'

interface Respuesta {
  boards: {
    items_page: {
      items: { name: string; column_values: { text: string | null }[] }[]
    }
  }[]
}

/** Nombres de quienes pueden medir una obra, ordenados alfabéticamente. Se pide una sola vez. */
export const getMedidores = memoGlobal(async (): Promise<string[]> => {
  const data = await mondayApi<Respuesta>(
    `query ($board: [ID!]) {
      boards(ids: $board) {
        items_page(limit: 500) {
          items { name column_values(ids: ["${COL_ESTADO}"]) { text } }
        }
      }
    }`,
    { board: [BOARD_PERSONAL] },
  )
  const items = data.boards[0]?.items_page.items ?? []
  const nombres = items
    .filter((i) => i.column_values[0]?.text === ESTADO_ACTIVO)
    .map((i) => i.name.trim())
    /* El ítem de prueba del tablero no es una persona. */
    .filter((n) => n && !/^test$/i.test(n))
  return [...new Set(nombres)].sort((a, b) => a.localeCompare(b, 'es'))
})
