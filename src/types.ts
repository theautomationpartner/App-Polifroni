/** Tipos del dominio. Todo sale del tablero 🪟 Obras (9617181553). */

/** Un archivo adjunto en una columna `file`. */
export interface ArchivoObra {
  /** Id del asset en Monday: con él se pide la URL firmada para poder verlo. */
  assetId: string
  nombre: string
  /** `true` si Monday lo marcó como imagen (no se embebe en el visor de PDF). */
  esImagen: boolean
}

/** Etiqueta de una columna status, con el color que le puso el tablero. */
export interface EstadoObra {
  texto: string
  /** Color de la etiqueta en Monday (hex). Sin etiqueta elegida queda vacío. */
  color: string
}

/** Una obra, tal como la app la necesita: los datos del board ya leídos y normalizados. */
export interface Obra {
  id: string
  nombre: string
  /** 🤖ID Obra (item_id): el identificador que se ve en el tablero (IDOBRA-725). */
  idObra: string
  grupo: string
  creacion: string

  /* Vínculos */
  ctaCteCliente: string
  ctaCteClienteIds: string[]
  arquitecto: string
  arquitectoIds: string[]
  asignado: string
  /** Ids de las personas de Monday asignadas a la obra (para copiarlas a la OP). */
  asignadoIds: string[]

  /* Datos */
  celCoordinar: string
  ubicacion: string
  tipo: EstadoObra
  etapaProduccion: EstadoObra
  etapaVenta: EstadoObra
  premarco: EstadoObra
  coordinarEntrega: EstadoObra
  fechaColocacion: string
  totalPactado: string
  saldo: string
  pctCancelado: string
  validacionCtaCte: EstadoObra

  /* Contactos espejados del cliente y del arquitecto */
  celCliente: string
  emailCliente: string
  celArquitecto: string

  /* Documentos */
  /** La Orden HETMO de la OP más nueva de la obra. */
  ordenEtmo: ArchivoObra[]
  /** Las OP finales de TODAS las órdenes de la obra. */
  opFinal: ArchivoObra[]
  /** Ids de las órdenes de producción de la obra, en el tablero de órdenes. */
  ordenesIds: string[]
  planoAberturas: ArchivoObra[]
  planoPlanta: ArchivoObra[]
  presupuestoAceptado: ArchivoObra[]

  /* Estados del circuito */
  opDestinatario: EstadoObra
  opVia: EstadoObra
  estadoEnvioOp: EstadoObra
  mjsEnviadoCliente: EstadoObra
  confirmacionOp: EstadoObra
  confirmacionTaller: EstadoObra
  /** Marca: sólo tiene valor cuando la obra es combinada. */
  combina: EstadoObra
  estadoEnvioTaller: EstadoObra
}

/** Fila de la lista de obras: lo mínimo para elegir una sin traer el ítem entero. */
export interface ObraFila {
  id: string
  nombre: string
  /** 🤖ID Obra: el número con el que se la nombra puertas adentro. */
  idObra: string
  cliente: string
  ubicacion: string
  /** Los estados van con SU color del tablero, igual que en la ficha. */
  tipo: EstadoObra
  etapaProduccion: EstadoObra
  etapaVenta: EstadoObra
  confirmacionOp: EstadoObra
  confirmacionTaller: EstadoObra
}

/** Una entrada del historial de actividades del ítem (updates de Monday). */
export interface Actividad {
  id: string
  /** HTML tal como lo devuelve Monday; se sanea antes de mostrarlo. */
  body: string
  fecha: string
  autor: string
}

/** Pasos del proceso de Orden de Producción. El orden es el del stepper. */
export type Paso = 'obra' | 'etmo' | 'envio' | 'confirmacion'

/** Operaciones que ofrece la pantalla principal. */
export type Proceso = 'obras'

/**
 * Quién está usando la app, ya verificado por el backend (firma de Monday + lista blanca).
 *
 * Sale del session token firmado por Monday, NO de la query `me`: por el proxy, `me` contesta quién
 * es el dueño del token del SERVIDOR, que es el mismo para todos. Ver `api/usuario.ts`.
 */
export interface UsuarioActual {
  /** Id de usuario de Monday. Es el que se carga como "quién emitió" en la OP. */
  id: string
  name: string
  isAdmin: boolean
  equipos: string[]
  equipoIds: string[]
}

/** Una persona de la cuenta, como la muestra el selector de usuario: nombre, iniciales y color. */
export interface Usuario {
  id: string
  name: string
  ini: string
  color: string
}
