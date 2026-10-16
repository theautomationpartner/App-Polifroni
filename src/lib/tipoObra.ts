/** El material de la obra: decide el flujo, el contador de la numeración y si el N° lleva la "A". */
export type TipoOrden = 'PVC' | 'Aluminio'

/** "PVC" o cualquier otra cosa (Aluminio), tal como lo usa la numeración de Make. */
export const tipoDeObra = (tipo: string): TipoOrden => (/pvc/i.test(tipo) ? 'PVC' : 'Aluminio')

/**
 * Obra de prueba: su nombre incluye "test" (sin importar mayúsculas), p. ej. "IDOP-053 - PVC 2282 TEST".
 * Su OP no usa la numeración de Neon: lleva `NRO_ORDEN_TEST` y no reserva ni registra números.
 */
export const esObraDeTest = (nombre: string): boolean => /test/i.test(nombre)

/** El N° de orden de una OP de prueba. */
export const NRO_ORDEN_TEST = 'TEST'
