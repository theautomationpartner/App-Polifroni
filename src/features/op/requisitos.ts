import { COL } from '@/services/monday/columns'
import type { Obra } from '@/types'

/** Un requisito para poder leer el documento. */
export interface Requisito {
  /** Si se cumple. Mientras alguno esté en `false`, el botón no se habilita. */
  ok: boolean
  titulo: string
  /** Qué falta, o qué se leyó. Lo justo para poder arreglarlo. */
  detalle: string
  /** Sirve de clave; no se muestra. */
  columna: string
}

/**
 * Lo que el escenario de LECTURA necesita para no cortarse.
 *
 * Su router filtra por dirección, celular a coordinar y archivo adjunto —los tres tienen que
 * existir— y cuando el filtro corta, el escenario no llega a su módulo de respuesta: Make contesta
 * "Accepted" y la app se queda sin lista, sin saber por qué. Peor todavía: el escenario cambia el
 * estado de la obra ANTES del filtro, así que una corrida que no sirvió para nada igual dejó rastro.
 *
 * Por eso se verifica acá primero. Es la misma idea que con la generación: no gastar una corrida
 * por algo que se veía de entrada.
 */
export function requisitosLectura(obra: Obra, tieneEtmo = obra.ordenEtmo.length > 0): Requisito[] {
  return [
    {
      ok: tieneEtmo,
      titulo: 'Orden ETMO adjunta',
      detalle: 'Es el documento que se lee.',
      columna: 'etmo',
    },
    {
      ok: obra.ubicacion.trim().length > 0,
      titulo: 'Ubicación de la obra',
      detalle: 'El escenario la exige para correr.',
      columna: COL.ubicacion,
    },
    {
      ok: obra.celCoordinar.trim().length > 0,
      titulo: 'Cel a coordinar',
      detalle: 'El escenario lo exige para correr.',
      columna: COL.celCoordinar,
    },
  ]
}

/** Qué falta para poder leer el documento; vacío si no falta nada. */
export function faltaParaLeer(obra: Obra, tieneEtmo?: boolean): string {
  const falta = requisitosLectura(obra, tieneEtmo)
    .filter((r) => !r.ok)
    .map((r) => r.titulo.toLowerCase())
  if (falta.length === 0) return ''
  return `Falta cargar en la obra: ${falta.join(', ')}.`
}
