/**
 * La consulta al padrón de ARCA, del lado del SERVIDOR.
 *
 * Es el servicio de TAP (`arca.theautomationpartner.com`): con un CUIT/CUIL devuelve razón social,
 * condición de IVA y domicilio. Lo usa el alta de clientes y constructores/arquitectos del
 * presupuesto, para que el usuario sólo cargue lo que ARCA no sabe.
 *
 * NUNCA desde el navegador: la clave del servicio va en una cabecera y todo lo que corre en el
 * navegador (incluidas las `VITE_…`) lo puede leer cualquiera. Vive sólo en `process.env.ARCA_API_KEY`
 * (Vercel en producción, `.env.local` en desarrollo) y esta función es la única que la toca. La clave
 * no se devuelve, no se registra y no aparece en ningún mensaje de error.
 */

const SERVICIO = 'https://arca.theautomationpartner.com/api/padron/'
/** ARCA a veces tarda; más que esto y el usuario prefiere cargarlo a mano. */
const ESPERA_MS = 8000

/** Lo que la app necesita del padrón. */
export interface DatosDeArca {
  cuit: string
  razonSocial: string
  /** El código: RESPONSABLE_INSCRIPTO, MONOTRIBUTO, EXENTO, CONSUMIDOR_FINAL, NO_ALCANZADO. */
  condicionIva: string
  /** El texto para una persona: "IVA RESPONSABLE INSCRIPTO". */
  condicionIvaTexto: string
  domicilio: string
  localidad: string
  provincia: string
  /** ARCA no respondió y el servicio devolvió lo último que sabía. */
  datoViejo: boolean
}

export type RespuestaArca =
  | { ok: true; datos: DatosDeArca }
  /** `error` es el código del servicio (`no_encontrado`, `arca_no_responde`…); `mensaje`, en castellano. */
  | { ok: false; error: string; mensaje: string }

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Consulta un CUIT. Nunca tira: cualquier problema vuelve como `{ ok: false, mensaje }`, listo para
 * mostrar, porque una consulta que falla no puede frenar un alta (se completa a mano).
 */
export async function consultarPadron(
  cuit: string,
  clave: string | undefined,
  pedir: typeof fetch = fetch,
): Promise<RespuestaArca> {
  const digitos = cuit.replace(/\D/g, '')
  if (digitos.length !== 11) {
    return { ok: false, error: 'documento_invalido', mensaje: 'El CUIT tiene que tener 11 números.' }
  }
  if (!clave) {
    return { ok: false, error: 'sin_clave', mensaje: 'La consulta a ARCA no está configurada. Completá los datos a mano.' }
  }

  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), ESPERA_MS)
  try {
    const res = await pedir(SERVICIO + digitos, { headers: { 'x-api-key': clave }, signal: corte.signal })
    const cuerpo = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const error = texto(cuerpo.error) || (res.status === 429 ? 'demasiadas_consultas' : `http_${res.status}`)
      /* El 401 es NUESTRO problema (la clave), no del usuario: no se le explica la clave. */
      const mensaje =
        res.status === 401
          ? 'La consulta a ARCA no está disponible ahora. Completá los datos a mano.'
          : res.status === 429
            ? 'Se hicieron muchas consultas a ARCA en el último minuto. Probá de nuevo en un rato o completá los datos a mano.'
            : texto(cuerpo.mensaje) || 'ARCA no devolvió los datos. Completá los datos a mano.'
      return { ok: false, error, mensaje }
    }
    return {
      ok: true,
      datos: {
        cuit: texto(cuerpo.cuit) || digitos,
        razonSocial: texto(cuerpo.razon_social),
        condicionIva: texto(cuerpo.condicion_iva),
        condicionIvaTexto: texto(cuerpo.condicion_iva_texto),
        domicilio: texto(cuerpo.domicilio),
        localidad: texto(cuerpo.localidad),
        provincia: texto(cuerpo.provincia),
        datoViejo: cuerpo.dato_viejo === true,
      },
    }
  } catch (e) {
    const tarde = (e as Error).name === 'AbortError'
    return {
      ok: false,
      error: tarde ? 'arca_tarda' : 'sin_conexion',
      mensaje: tarde
        ? 'ARCA está tardando en contestar. Completá los datos a mano o probá de nuevo.'
        : 'No se pudo consultar ARCA. Completá los datos a mano.',
    }
  } finally {
    clearTimeout(reloj)
  }
}
