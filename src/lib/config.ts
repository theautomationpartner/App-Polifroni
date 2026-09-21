/** Parámetros de la app que hoy se deciden en el código y mañana serán configuración. */

/**
 * Tamaños de página de la lista de obras.
 *
 * Son chicos a propósito. Lo que se pagina es lo que el catálogo ya tiene en memoria, así que el
 * número no decide cuánto se espera sino cuánto entra en pantalla sin tener que barrerla.
 */
export const TAMANOS_PAGINA = [25, 50] as const
