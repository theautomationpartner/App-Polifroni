import { aCentavos, documentoFiscal, faseComprobante, pesos } from '@/lib/facturacion'
import {
  crearComprobante,
  crearRenglon,
  esperarRenglon,
  fijarDocumentoComprobante,
  fijarMontoRenglon,
  leerComprobante,
  pedirEmision,
  renglonesDe,
  type ComprobanteLeido,
} from '@/services/monday'
import type { BorradorFactura, ComprobanteEnCurso } from './borrador'

/** Cuánto se espera a ARCA por cada comprobante (hoy tarda unos 15 s). */
const PLAZO_EMISION_MS = 120_000
const CADA_MS = 3_000

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const igual = (a: number | null, b: number) => a !== null && Math.abs(aCentavos(a) - aCentavos(b)) < 0.005

/** Los comprobantes que corresponden a lo elegido: uno por obra, con su monto. */
export function comprobantesDe(f: BorradorFactura, montos: { obraId: string; monto: number }[]): ComprobanteEnCurso[] {
  return montos.map(
    (m) =>
      f.comprobantes.find((c) => c.obraId === m.obraId) ?? {
        obraId: m.obraId,
        monto: m.monto,
        facturaId: null,
        montoFijado: false,
        fase: 'sinEmitir',
        error: null,
        leido: null,
      },
  )
}

/**
 * Emite los comprobantes, de a uno y en orden (ARCA numera de a uno). Cada paso que queda hecho en
 * Monday se anota con `avanzar`: un reintento sigue desde donde quedó, sin crear otro comprobante ni
 * pedir dos veces la misma emisión.
 *
 * Por comprobante:
 *  1. El ítem en 🧾 Facturación obra, con la obra vinculada (`crearComprobante`).
 *  2. El renglón: el tablero lo arma y le pone todo lo pendiente de la obra; se espera y se cambia por
 *     el monto elegido. Si el tablero no lo armó, lo arma la app. Se escribe el CUIT/DNI a facturar.
 *  3. La emisión en ARCA (`🤖 Estado Comprobante` → "Crear Comprobante"), y se espera su resultado.
 *
 * Un comprobante con error de ARCA corta la corrida: se muestra el motivo y se puede reintentar.
 */
export async function emitirComprobantes({
  comprobantes,
  documento,
  avanzar,
  onPaso,
}: {
  comprobantes: ComprobanteEnCurso[]
  documento: string
  avanzar: (lista: ComprobanteEnCurso[]) => void
  /** Qué se está haciendo, para la ventana de espera. */
  onPaso: (texto: string, i: number) => void
}): Promise<ComprobanteEnCurso[]> {
  let lista = [...comprobantes]
  const guardar = (i: number, cambios: Partial<ComprobanteEnCurso>) => {
    lista = lista.map((c, j) => (j === i ? { ...c, ...cambios } : c))
    avanzar(lista)
  }
  const doc = documentoFiscal(documento)

  for (let i = 0; i < lista.length; i++) {
    const c = lista[i]
    if (c.fase === 'emitido' && c.leido?.pdf) continue

    /* 1. El comprobante. */
    let facturaId = c.facturaId
    if (!facturaId) {
      onPaso('Creando el comprobante', i)
      facturaId = await crearComprobante(c.obraId)
      guardar(i, { facturaId, error: null })
    }

    /* Un reintento mira primero cómo quedó: lo que ya se emitió o se está emitiendo no se vuelve a pedir. */
    if (c.facturaId) {
      const actual = await leerComprobante(facturaId)
      const fase = faseComprobante(actual?.indice)
      if (fase === 'emitido' && actual?.pdf) {
        guardar(i, { fase, leido: actual, error: null, montoFijado: true })
        continue
      }
      if (fase === 'emitiendo') {
        onPaso('Esperando la respuesta de ARCA', i)
        if (!(await esperarResultado(i, facturaId))) return lista
        continue
      }
    }

    /* 2. El renglón con el monto elegido, y el documento. */
    if (!lista[i].montoFijado) {
      onPaso('Preparando el detalle del comprobante', i)
      const renglon = await esperarRenglon(facturaId)
      if (!renglon) await crearRenglon(facturaId, c.monto)
      else if (!igual(renglon.precio, c.monto)) await fijarMontoRenglon(renglon.id, c.monto)
      if (doc) await fijarDocumentoComprobante(facturaId, doc)
      /* Antes de emitir se confirma que el renglón quedó con el monto: el escenario del tablero puede
         haberlo pisado después. */
      await esperar(1_500)
      const r = (await renglonesDe(facturaId))[0]
      if (r && !igual(r.precio, c.monto)) await fijarMontoRenglon(r.id, c.monto)
      guardar(i, { montoFijado: true })
    }

    /* Antes de pedir la emisión, el comprobante tiene que tener UN renglón con el monto elegido: con
       otro de más (una automatización que lo armó tarde) saldría facturado de más. No se emite. */
    const rs = await renglonesDe(facturaId)
    if (rs.length !== 1 || !igual(rs[0].precio, c.monto)) {
      guardar(i, {
        fase: 'error',
        montoFijado: false,
        error:
          rs.length > 1
            ? `El comprobante quedó con ${rs.length} renglones en el sistema y no se emitió. Dejá uno solo, por ${pesos(c.monto)}, y reintentá.`
            : 'El renglón del comprobante no quedó con el monto elegido y no se emitió. Reintentá en unos segundos.',
      })
      return lista
    }

    /* 3. La emisión. */
    onPaso('Emitiendo el comprobante en ARCA', i)
    await pedirEmision(facturaId)
    guardar(i, { fase: 'emitiendo', error: null })
    if (!(await esperarResultado(i, facturaId))) return lista
  }
  return lista

  /** Espera el resultado de ARCA. `false`: no salió (error o sin respuesta a tiempo), y se corta. */
  async function esperarResultado(i: number, facturaId: string): Promise<boolean> {
    const hasta = Date.now() + PLAZO_EMISION_MS
    let leido: ComprobanteLeido | null = null
    while (Date.now() < hasta) {
      await esperar(CADA_MS)
      leido = await leerComprobante(facturaId)
      const fase = faseComprobante(leido?.indice)
      /* "Comprobante Creado" llega junto con el PDF; se espera a tenerlo para poder enviarlo. */
      if (fase === 'emitido' && leido?.pdf) {
        guardar(i, { fase, leido, error: null })
        return true
      }
      if (fase === 'error') {
        guardar(i, {
          fase,
          leido,
          error: leido?.ultimaNota || 'ARCA rechazó el comprobante. El motivo quedó en los comentarios del comprobante en el sistema.',
        })
        return false
      }
    }
    guardar(i, {
      fase: 'emitiendo',
      leido,
      error: 'ARCA todavía no respondió. El comprobante sigue emitiéndose: volvé a consultar en unos segundos.',
    })
    return false
  }
}
