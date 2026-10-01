/** El material de la obra: decide el flujo, el contador de la numeración y si el N° lleva la "A". */
export type TipoOrden = 'PVC' | 'Aluminio'

/** "PVC" o cualquier otra cosa (Aluminio), tal como lo usa la numeración de Make. */
export const tipoDeObra = (tipo: string): TipoOrden => (/pvc/i.test(tipo) ? 'PVC' : 'Aluminio')
