/**
 * `POST /api/mfa/setup` — arranca el enrolamiento del segundo factor.
 *
 * Devuelve el QR para escanear con Google Authenticator (o la que use la persona) y el secreto en
 * texto por si la cámara no coopera. El secreto queda guardado CIFRADO y en estado pendiente: no
 * habilita nada hasta que `/api/mfa/confirm` reciba un código válido.
 *
 * Volver a llamarlo REEMPLAZA el enrolamiento anterior. Es lo que se quiere cuando alguien cambió
 * de teléfono, y no es un agujero: para llegar acá hay que tener firma válida y estar en la lista
 * blanca, o sea ser ya ese usuario.
 *
 * Cuerpo opcional: `{ "secreto": "..." }` para usar una clave que el usuario YA tiene —la del
 * segundo factor de su cuenta de Monday en 1Password— en lugar de una nueva. Una clave inválida
 * vuelve como 400.
 */
import type { ServerResponse } from 'node:http'
import { iniciarEnrolamiento } from '../_mfa.js'
import { endpointMfa, type Pedido } from '../_http.js'

interface Cuerpo {
  secreto?: string
}

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  await endpointMfa<Cuerpo>(req, res, async ({ sesion, cuerpo }) => {
    /* La etiqueta es lo que la app de autenticación muestra en la lista. Lleva la cuenta y el
       usuario para que quien administre dos cuentas no vea dos entradas idénticas. */
    const etiqueta = `Orden de Producción · usuario ${sesion.userId}`
    const propio = typeof cuerpo.secreto === 'string' && cuerpo.secreto.trim() ? cuerpo.secreto : undefined
    return iniciarEnrolamiento(sesion, etiqueta, propio)
  })
}
