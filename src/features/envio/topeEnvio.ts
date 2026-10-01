/**
 * Cuánto se espera un envío (al cliente o al taller). Pasado el minuto y medio sin la respuesta
 * exitosa del escenario, el envío se da por fallido: el botón queda en "Error de Envío" y se pide
 * contactar a soporte. Es una constante (no un objeto armado en cada render) para que el hook de la
 * corrida no se rearme.
 */
export const TOPE_ENVIO = {
  ms: 90_000,
  problema: 'El envío tardó demasiado. Contactese con soporte de TAP para revisar lo sucedido.',
} as const
