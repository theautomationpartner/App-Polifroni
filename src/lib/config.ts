/** Parámetros de la app que hoy se deciden en el código y mañana serán configuración. */

/**
 * Obra con la que arranca la lista.
 *
 * El tablero tiene más de 500 obras: traerlas todas al abrir sería lento y, sobre todo, inútil
 * —en esta etapa se trabaja sobre una—. La lista muestra ésta, y el buscador de arriba es el que
 * va a buscar el resto al tablero, paginando.
 */
export const OBRAS_DESTACADAS = ['12852733298']

/** Tamaños de página de la lista, como en la vista de Monday. */
export const TAMANOS_PAGINA = [15, 25] as const
