/**
 * Cuánto se espera un envío (al cliente o al taller). Pasado el minuto y medio sin la respuesta
 * exitosa del escenario, el envío se da por fallido: el botón queda en "Error de Envío" y se le
 * indica al usuario que finalice la operación para no perder lo cargado. Es una constante (no un
 * objeto armado en cada render) para que el hook de la corrida no se rearme.
 */
export const TOPE_ENVIO = {
  ms: 90_000,
  problema:
    'Ocurrió un error interno al intentar enviar el mensaje en la aplicación. Dale click al botón de Finalizar Operación para registrar la orden y no perder los datos ya cargados. Más tarde intenta enviar la orden ya cargada nuevamente. Si el error persiste, no dude en contactarse con el soporte de TAP.',
} as const
