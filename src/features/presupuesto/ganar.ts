import { nombreMovimiento, tipoObraDe } from '@/lib/presupuesto'
import {
  SIN_ARQUITECTO_ID,
  cerrarGanado,
  confirmarPresupuestoEnviado,
  crearMovimientoVenta,
  crearObraDePresupuesto,
  getUrlArchivo,
  idDeObra,
  marcarObraRegistrada,
  subirArchivosGanado,
  subirArchivosObra,
  subirPdfMovimiento,
  type DatosClienteObra,
  type PresupuestoEnviado,
  type PresupuestoGestion,
} from '@/services/monday'
import type { ArchivoObra } from '@/types'

/** Lo que se decidió en la ventana de "Ganar". */
export interface DatosGanar {
  /** El presupuesto enviado (subelemento) que se ganó. */
  elegido: PresupuestoEnviado
  cuentaId: string
  total: number
  plano: File | null
}

/**
 * Lo que ya quedó escrito en Monday. Si algo falla a mitad de camino, el reintento sigue desde acá:
 * no crea otra obra ni otro movimiento, ni vuelve a subir los archivos.
 */
export interface ProgresoGanar {
  pdf?: File
  obraId?: string
  idObra?: string
  archivosObra?: boolean
  movimientoId?: string
  pdfMovimiento?: boolean
  registrada?: boolean
  archivosPresupuesto?: boolean
  cerrado?: boolean
  confirmado?: boolean
}

/** El PDF del presupuesto, bajado de Monday para volver a subirlo (Monday no copia entre columnas). */
export async function bajarPdf(a: ArchivoObra): Promise<File> {
  const r = await fetch(await getUrlArchivo(a.assetId))
  if (!r.ok) throw new Error(`No se pudo bajar el PDF del presupuesto (HTTP ${r.status})`)
  const blob = await r.blob()
  return new File([blob], a.nombre || 'Presupuesto.pdf', { type: blob.type || 'application/pdf' })
}

/**
 * Gana el presupuesto y crea su obra. Es lo que hacía el escenario de Make del botón "✋Crear Obra",
 * que la app NO aprieta. En orden:
 *  1. La obra: cuenta corriente, constructor (o "SIN ARQUITECTO"), asignado, "Ganado/Aceptado/
 *     Anticipo", "A Medir", tipo, total, aceptación, celular y ubicación del cliente, y el presupuesto.
 *     Le adjunta el presupuesto final aceptado y, si se cargó, el plano.
 *  2. El registro en la cuenta corriente: el movimiento "Venta-Sin Fact" con el total y el PDF; la
 *     obra queda vinculada a él y "Registrado en Cta Cte".
 *  3. El presupuesto: el PDF final y el plano, y recién al final tipo, color, total, "Creado", la
 *     obra y "Ganado". Mientras no llega acá, sigue listándose y se puede reintentar.
 *  4. El subelemento ganado queda "Confirmado".
 *
 * `avance` guarda en quien llama lo que ya se hizo (ver `ProgresoGanar`).
 */
export async function ganarPresupuesto({
  presupuesto: p,
  datos,
  cliente,
  responsableId,
  hoy,
  progreso,
  avance,
}: {
  presupuesto: PresupuestoGestion
  datos: DatosGanar
  cliente: DatosClienteObra
  responsableId: string | null
  hoy: string
  progreso: ProgresoGanar
  avance: (cambios: Partial<ProgresoGanar>) => void
}): Promise<{ obraId: string; idObra: string }> {
  const pr = { ...progreso }
  const marcar = (c: Partial<ProgresoGanar>) => {
    Object.assign(pr, c)
    avance(c)
  }
  if (!datos.elegido.pdf) throw new Error('El presupuesto elegido no tiene PDF.')

  const pdf = pr.pdf ?? (await bajarPdf(datos.elegido.pdf))
  if (!pr.pdf) marcar({ pdf })

  /* 1. La obra. */
  let obraId = pr.obraId
  if (!obraId) {
    obraId = await crearObraDePresupuesto({
      nombre: p.nombre,
      cuentaId: datos.cuentaId,
      arquitectoId: p.arquitecto?.id ?? SIN_ARQUITECTO_ID,
      responsableId,
      celular: cliente.celular,
      ubicacion: cliente.ubicacion,
      tipo: tipoObraDe(datos.elegido.tipo),
      total: datos.total,
      hoy,
      presupuestoId: p.id,
    })
    marcar({ obraId })
  }
  if (!pr.archivosObra) {
    await subirArchivosObra(obraId, { presupuesto: pdf, plano: datos.plano })
    marcar({ archivosObra: true })
  }

  /* 2. El registro en la cuenta corriente. */
  const idObra = pr.idObra ?? (await idDeObra(obraId).catch(() => ''))
  if (!pr.idObra && idObra) marcar({ idObra })
  let movimientoId = pr.movimientoId
  if (!movimientoId) {
    movimientoId = await crearMovimientoVenta({
      cuentaId: datos.cuentaId,
      nombre: nombreMovimiento(idObra, p.nombre),
      total: datos.total,
      obraId,
    })
    marcar({ movimientoId })
  }
  if (!pr.pdfMovimiento) {
    await subirPdfMovimiento(movimientoId, pdf)
    marcar({ pdfMovimiento: true })
  }
  if (!pr.registrada) {
    await marcarObraRegistrada(obraId, movimientoId)
    marcar({ registrada: true })
  }

  /* 3. El presupuesto. */
  if (!pr.archivosPresupuesto) {
    await subirArchivosGanado(p.id, { presupuesto: pdf, plano: datos.plano })
    marcar({ archivosPresupuesto: true })
  }
  if (!pr.cerrado) {
    await cerrarGanado({ bolsaId: p.id, tipo: datos.elegido.tipo, color: datos.elegido.color, total: datos.total, obraId })
    marcar({ cerrado: true })
  }

  /* 4. El subelemento ganado. Si falla, el presupuesto ya está ganado: no frena el cierre. */
  if (!pr.confirmado) {
    await confirmarPresupuestoEnviado(datos.elegido.id)
      .then(() => marcar({ confirmado: true }))
      .catch((e) => console.warn('[presupuesto] no se pudo marcar el presupuesto ganado como Confirmado', e))
  }

  return { obraId, idObra }
}
