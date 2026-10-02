/** Cuántos días después del primer envío se recuerda la confirmación (`🤖Fecha Recordatorio +5d`). */
export const DIAS_RECORDATORIO = 5

/**
 * La fecha del recordatorio: `dias` días corridos después de `desde`, en la fecha LOCAL del envío
 * (`toISOString()` daría la de Greenwich: un envío pasadas las 21 h correría un día). Devuelve
 * `YYYY-MM-DD`, que es lo que espera una columna de fecha de Monday.
 */
export function fechaRecordatorio(desde: Date, dias = DIAS_RECORDATORIO): string {
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + dias)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}
