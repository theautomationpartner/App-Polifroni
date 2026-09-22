/**
 * Mapa del tablero. ÚNICA fuente de ids de columna de la app: ningún componente escribe un
 * `text_xxxxx` suelto, así un cambio en el tablero se arregla en un solo lugar.
 *
 * Los ids salen de una consulta real al board (query `columns { id title type settings_str }`),
 * no de la interfaz: el título se puede renombrar, el id no.
 */

/** El ÚNICO tablero que la app lee o escribe: 🪟 Obras. */
export const BOARD_OBRAS = 9617181553

/** Columnas de 🪟 Obras que usa el proceso de Orden de Producción. */
export const COL = {
  /* ── Vínculos de la obra ─────────────────────────────────────────────────── */
  /** ✋Cta Cte Cliente (board_relation). */
  ctaCteCliente: 'board_relation_mkthtd70',
  /** ✋Constructor/Arquitecto (board_relation). */
  arquitecto: 'board_relation_mksz3v0h',
  /** ✋Asignado a: (people). */
  asignado: 'multiple_person_mktj4r09',

  /* ── Datos de la obra ────────────────────────────────────────────────────── */
  /** ✋Cel a Coordinar (phone). Lo exige el escenario que genera la OP final. */
  celCoordinar: 'phone_mktkekah',
  /** ✋Ubicación Obra (location). */
  ubicacion: 'location_mksz7r97',
  /** ✋Tipo (status): Aluminio | PVC. Decide a quién se menciona ante un rechazo. */
  tipo: 'color_mkw92ypr',
  /**
   * Combina (status). Tiene UNA sola etiqueta —"Combinada"— y el resto de las obras la dejan
   * vacía: no es un estado con variantes, es una marca. Por eso en pantalla aparece sólo cuando
   * está puesta; un "Combina: sin definir" en cada obra sería una columna de ruido.
   */
  combina: 'color_mm7ergpj',
  /** ✋Etapa de Produccion (status). */
  etapaProduccion: 'color_mm1kddt0',
  /** ✋Etapa de Venta (status). */
  etapaVenta: 'deal_stage',
  /** ✋Premarco (status). */
  premarco: 'color_mm1cxcq8',
  /** ✋Coordinar Entrega (status). */
  coordinarEntrega: 'color_mkszp1kw',
  /** ✋Fecha Pactada Colocacion (date). */
  fechaColocacion: 'date_mkszfh59',
  /** ✋Total Obra Pactado (numbers). */
  totalPactado: 'deal_value',
  /** 🤖 Saldo (formula). */
  saldo: 'formula_mktjw331',
  /** 🤖 % Cancelado (formula). */
  pctCancelado: 'formula_mkty8qcx',
  /** 🤖ID Obra (item_id). */
  idObra: 'pulse_id_mktm8dq9',
  /** 🤖 Creación (creation_log). */
  creacion: 'pulse_log_mktyrbxj',
  /** 🤖 Validacion Registracion de Obra en cta cte (status). */
  validacionCtaCte: 'color_mm1z5tfm',

  /* ── Contactos (mirror del cliente / arquitecto) ──────────────────────────── */
  /** 🤖Cel-WHATSAPP Cliente (mirror). Destinatario del envío de la OP. */
  celCliente: 'lookup_mktz807f',
  /** 🤖E-mail Cliente (mirror). */
  emailCliente: 'lookup_mktzkfn3',
  /** 🤖Cel-WHATSAPP Contructor/Arquitecto (mirror). */
  celArquitecto: 'lookup_mkv0rg18',

  /* ── Paso 1 · Ingesta ETMO ────────────────────────────────────────────────── */
  /** ✋Orden de Prod HETMO (file): el PDF original del sistema de diseño. */
  ordenEtmo: 'file_mktkkjnj',
  /** Observaciones OP (text): observaciones por ítem que se vuelcan en la OP final. */
  observaciones: 'text_mm73nvda',
  /** ✋Plano de Aberturas Pdf (file). */
  planoAberturas: 'file_mktj9hsc',
  /** ✋Plano Planta pdf (file). */
  planoPlanta: 'file_mkth7p72',
  /** ✋Presupuesto Final Aceptado (file). */
  presupuestoAceptado: 'file_mktkp9dp',

  /* ── Paso 2 · Generación de la OP final ───────────────────────────────────── */
  /** 🤖Estado Orden de Prod Final (status): Generar | Generando | Generado | Error - Ver Update. */
  estadoOpFinal: 'color_mm72nxsj',
  /** 🤖OP Final (file): el PDF que devuelve el escenario de Make. */
  opFinal: 'file_mm72n55y',

  /* ── Paso 3 · Envío al cliente ────────────────────────────────────────────── */
  /** ✋ Orden de Produccion a: (status) Constructor | Cliente | Ambos. */
  opDestinatario: 'color_mm12ez80',
  /** ✋Enviar Orden de Produccion x: (status) Email | Whatsapp | Ambos. */
  opVia: 'color_mktzfcdt',
  /** 🤖 Estado de Envío OP (status): Enviar | Enviando | Enviado | Error de Envío. */
  estadoEnvioOp: 'color_mm0h8j4m',
  /** Mjs Enviado Cliente (status): Enviado | Error Envio. */
  mjsEnviadoCliente: 'color_mm5jsjea',

  /* ── Paso 4 · Confirmación y taller ───────────────────────────────────────── */
  /** 🤖Confirmacion Op Cliente (status): Pend de Confirmar | CONFIRMADO OP | NO CONFIRMADO. */
  confirmacionOp: 'color_mm73rxg7',
  /** 🤖Confirmacion Op Taller (status). Mismas etiquetas que la del cliente. */
  confirmacionTaller: 'color_mm7eqk41',
  /** 🤖Estado Envio OP TALLER (status): A Enviar | Enviando | Enviado | Error en Envio. */
  estadoEnvioTaller: 'color_mkzrjgcj',
} as const

/**
 * Etiquetas que la app compara contra el tablero. Se escriben una vez acá porque de ellas dependen
 * habilitaciones (el envío al taller sólo con la OP confirmada) y no un texto de pantalla.
 */
export const ETIQUETA = {
  opGenerado: 'Generado',
  opGenerando: 'Generando',
  opError: 'Error - Ver Update',
  envioEnviado: 'Enviado',
  envioEnviando: 'Enviando',
  envioError: 'Error de Envío',
  /* Tal cual figura en el tablero, con su error de tipeo incluido: se compara contra lo que
     Monday devuelve, no contra lo que debería decir. */
  confirmado: 'CONFIRMADO OP',
  /* Escrito TAL CUAL está en el tablero, verificado contra `settings_str`. Estuvo un tiempo como
     "NO CONFIRMAOD" y esa letra de más rompía en silencio la única regla que depende de ella: una
     OP rechazada por el cliente no se detectaba como rechazada y el paso al taller quedaba abierto. */
  noConfirmado: 'NO CONFIRMADO',
  pendConfirmar: 'Pend de Confirmar',
  tallerEnviando: 'Enviando',
  tallerEnviado: 'Enviado',
  /* Tal cual figura en el tablero: la etiqueta del taller no lleva tilde, a diferencia de la del
     envío al cliente ("Error de Envío"). Se compara contra lo que Monday devuelve. */
  tallerError: 'Error en Envio',
  tipoPvc: 'PVC',
  tipoAluminio: 'Aluminio',
} as const

/**
 * A quién se menciona cuando el cliente RECHAZA la orden, según el material de la obra.
 * La mención la hace el escenario de Make; acá vive sólo para poder anticiparlo en pantalla.
 */
export const RESPONSABLE_RECHAZO: Record<string, string> = {
  [ETIQUETA.tipoPvc]: 'Sole',
  [ETIQUETA.tipoAluminio]: 'Nati',
}
