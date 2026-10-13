import { Fragment, useEffect, useId, useState, type ReactNode } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Stepper } from '@/components/ui/Stepper'
import { hoyLocal } from '@/features/op/DatosMedicion'
import { BuscadorObras, ayudaDe, useBuscadorObras } from '@/features/shared/BuscadorObras'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import {
  TIPOS_POR_DEFECTO,
  aberturasValidas,
  alternarPendiente,
  cambiarConObra,
  cambiosTurno,
  claveDeTurno,
  aprobacionPorSaldo,
  colorCancelacion,
  defTipo,
  elegirObra,
  elegirTipo,
  entregaDePendiente,
  faltantesRegistro,
  faltantesSeleccion,
  fechaHoraCorta,
  horarioOcupado,
  listaObras,
  mensajeAsignacion,
  seleccionVacia,
  tipoDeSeleccion,
  type CampoTurno,
  type DatosEdicionTurno,
  type SeleccionTurno,
  type TipoConfig,
  type TipoTurno,
} from '@/lib/agenda'
import { indexar, type EntradaIndice } from '@/lib/busquedaObras'
import { formatoCelular } from '@/lib/destinatario'
import { importe } from '@/lib/format'
import {
  escribirTipoConfig,
  buscarClientes,
  cargarIndiceClientes,
  crearTurno,
  datosParaEditar,
  guardarEdicionTurno,
  ordenesDeObra,
  getCliente,
  getElementosCliente,
  getTiposReparacion,
  leerTurno,
  listarTurnos,
  registrarAsignacion,
  type ClienteTurno,
  type ElementosCliente,
  type TipoReparacion,
  type Turno,
} from '@/services/monday'
import { useApp } from '@/state/hooks'
import { AprobacionChip, EstadoTurnoChip, EtapaChip, MaterialChip, TipoTurnoChip } from './chips'
import { EnvioMensaje } from './EnvioMensaje'
import { ModalErrorConsulta, conTope } from './ModalErrorConsulta'
import { ModalOrdenes, nombreOp, type OpElegida } from './ModalOrdenes'

const ETAPAS = ['Seleccionar Cliente', 'Obras y Pendientes', 'Registrar Turno'] as const

/** Filas por página de las tablas (el estándar de la app). */
const POR_PAGINA = 6

const AYUDA_SIN_CLIENTE = 'Buscá y cargá la cuenta corriente del cliente para continuar'
const SIN_RESULTADOS_BUSCADOR = 'Sin resultados en Monday. Probá con parte del nombre o pegá el id.'
const SIN_RESULTADOS = 'Sin resultados para la búsqueda ingresada. Probá ingresando otro nombre de cliente.'

const dinero = (n: number | null) => (n === null ? '—' : importe(String(Math.round(n * 100) / 100).replace('.', ',')))

/** El paginador de las tablas, siempre visible. */
function Paginador({
  pagina,
  total,
  setPagina,
  que,
}: {
  pagina: number
  total: number
  setPagina: (n: number) => void
  que: [string, string]
}) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const en = Math.min(pagina, paginas - 1)
  return (
    <div className="obras-pager">
      <button type="button" className="obras-pager-btn" disabled={en === 0} onClick={() => setPagina(en - 1)}>
        <i className="fas fa-chevron-left" /> Anterior
      </button>
      <span className="obras-pager-info">
        Página {en + 1} de {paginas} · {total} {total === 1 ? que[0] : que[1]}
      </span>
      <button type="button" className="obras-pager-btn" disabled={en >= paginas - 1} onClick={() => setPagina(en + 1)}>
        Siguiente <i className="fas fa-chevron-right" />
      </button>
    </div>
  )
}

const pagina = <T,>(lista: readonly T[], n: number) => {
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA))
  const en = Math.min(n, paginas - 1)
  return lista.slice(en * POR_PAGINA, (en + 1) * POR_PAGINA)
}

/**
 * Turno nuevo, desde un día u horario libre del calendario: una ventana con su stepper y tres
 * etapas.
 *
 *  1. SELECCIONAR CLIENTE: el buscador de cuentas corrientes y la ficha básica del cliente (obras y
 *     pendientes de entrega que tiene).
 *  2. OBRAS Y PENDIENTES: una sola tabla, con las obras arriba y los pendientes de entrega abajo.
 *     "Con Obra" (tildado de entrada): como máximo UNA obra —con su tipo de turno: Colocación,
 *     Medición, Reparación o Terminación— y "Ver OP" para vincular sus órdenes (opcional).
 *     Destildado, el turno va sin obra. Los pendientes son opcionales: con obra viajan en el turno
 *     de la obra (no se crea otro de Reparto); sólo con pendientes el turno es Reparto; sin obra ni
 *     pendientes se elige el tipo.
 *  3. REGISTRAR TURNO: la ficha de registro, la fecha y la hora (las del horario elegido, si se
 *     eligió uno), y "Confirmar turno".
 *
 * Al confirmar se verifica que el horario siga libre, se crea el turno "Pendiente" —el tipo va
 * después, por la automatización del tablero— y se pregunta si se manda el mensaje de asignación,
 * que lo deja "Asignada".
 */
export function NuevoTurno({
  fecha: fechaInicial,
  hora: horaInicial,
  onCerrar,
  onCreado,
  tipos = TIPOS_POR_DEFECTO,
  editar = null,
}: {
  /**
   * Editar: el turno ya registrado. El asistente arranca con sus datos (cliente, tipo, obra,
   * pendientes, OP), la fecha y el rango horario no se tocan (eso es reprogramar), y "Guardar Turno"
   * escribe en Monday sólo lo que cambió.
   */
  editar?: Turno | null
  /** Los tipos de turno que se ofrecen: los del tablero de configuración (los de siempre, si no se leyó). */
  tipos?: TipoConfig[]
  /** `YYYY-MM-DD` del día elegido en el calendario. */
  fecha: string
  /** `HH:MM` del horario elegido; vacío si se eligió un día entero (vista de mes). */
  hora: string
  onCerrar: (aviso?: string) => void
  /** El turno ya quedó en la Agenda: el calendario lo dibuja. */
  onCreado: (t: Turno) => void
}) {
  const { usuario } = useApp()
  const uid = useId()
  const hoy = hoyLocal()
  const [paso, setPaso] = useState(0)
  const [pasoMax, setPasoMax] = useState(0)

  /* ── Etapa 1: la cuenta del cliente ── */
  const [indice, setIndice] = useState<EntradaIndice[]>([])
  const [cuenta, setCuenta] = useState<ClienteTurno | null>(null)
  const [elementos, setElementos] = useState<ElementosCliente | null>(null)
  const [cargando, setCargando] = useState(false)
  /** Etapa 2: las obras y los pendientes se piden a Monday al elegir el tipo de turno. */
  const [listado, setListado] = useState<'cargando' | 'listo' | null>(null)
  const [errorMonday, setErrorMonday] = useState<string | null>(null)

  /* ── Etapa 2: lo elegido ── */
  const [sel, setSel] = useState<SeleccionTurno>(seleccionVacia)
  /** Las OP elegidas, con su nombre (para la ficha y la constancia). */
  const [ops, setOps] = useState<OpElegida[]>([])
  const [verOpsDe, setVerOpsDe] = useState<string | null>(null)
  const [pagObras, setPagObras] = useState(0)
  const [pagPend, setPagPend] = useState(0)

  /* ── Etapa 3: el registro ── */
  const [fecha, setFecha] = useState(fechaInicial)
  const [hora, setHora] = useState(horaInicial)
  const [cantAberturas, setCantAberturas] = useState<string>('')
  const [tiposRep, setTiposRep] = useState<TipoReparacion[] | null>(null)
  const [tipoRep, setTipoRep] = useState('')
  const [fase, setFase] = useState<'registrando' | 'preguntando' | null>(null)
  const [creado, setCreado] = useState<Turno | null>(null)

  const [faltan, setFaltan] = useState<{ titulo: string; items: string[] } | null>(null)
  /** Editar: los datos del turno tal como están en Monday, para saber qué cambió. */
  const [original, setOriginal] = useState<DatosEdicionTurno | null>(null)
  /** Editar: se están leyendo los datos del turno (cuenta, pendientes, OP, tipo de reparación). */
  const [preparando, setPreparando] = useState(!!editar)
  const [marcar, setMarcar] = useState(false)
  const [bloqueo, setBloqueo] = useState<string | null>(null)

  useAccionEnCurso('Esperá a que termine de registrarse el turno.', fase === 'registrando')

  useEffect(() => cargarIndiceClientes((lista) => setIndice(indexar(lista))), [])

  useEffect(() => {
    if (!editar) return
    let vivo = true
    ;(async () => {
      try {
        const d = await conTope(datosParaEditar(editar))
        const c = d.cuentaId ? await conTope(getCliente(d.cuentaId)).catch(() => null) : null
        const e = c ? await conTope(getElementosCliente(c)).catch(() => null) : null
        const opsLeidas = d.opIds.length
          ? await ordenesDeObra(d.opIds)
              .then((l) => l.map((o) => ({ id: o.id, nombre: nombreOp(o) })))
              .catch(() => d.opIds.map((id) => ({ id, nombre: id })))
          : []
        if (!vivo) return
        const clave = claveDeTurno(editar)
        const tipoClave = tipos.some((x) => x.clave === clave) ? clave : null
        if (c) setCuenta(c)
        if (e) setElementos(e)
        setSel({
          tipo: tipoClave,
          conObra: !!editar.obraId || tipoClave === 'entrega',
          obraId: editar.obraId || null,
          pendientesIds: d.pendientesIds,
          opIds: d.opIds,
        })
        setOps(opsLeidas)
        setCantAberturas(editar.cantAberturas.trim())
        setTipoRep(d.tipoReparacion)
        setOriginal({
          clienteId: editar.clienteId,
          tipo: tipoClave,
          obraId: editar.obraId || null,
          pendientesIds: d.pendientesIds,
          opIds: d.opIds,
          aberturas: aberturasValidas(editar.cantAberturas) ? Number(editar.cantAberturas) : null,
          tipoReparacion: d.tipoReparacion,
        })
        /* Con cuenta, se puede ir directo a cualquier etapa. */
        if (c) setPasoMax(2)
      } catch {
        if (vivo) setErrorMonday('leer los datos del turno')
      } finally {
        if (vivo) setPreparando(false)
      }
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const obra =
    listaObras(sel) && sel.conObra && sel.obraId ? (elementos?.obras.find((o) => o.id === sel.obraId) ?? null) : null
  const pendientes = (elementos?.pendientes ?? []).filter((p) => sel.pendientesIds.includes(p.id))
  /** El tipo elegido, como está en la configuración. */
  const tipoCfg: TipoConfig | null = tipos.find((x) => x.clave === tipoDeSeleccion(sel)) ?? null
  /** El tipo conocido (Colocación, Reparto…), con su comportamiento; `null` en un tipo nuevo. */
  const tipo: TipoTurno | null = tipoCfg?.conocido ?? null
  /** La etiqueta de `✋ Tipo de Turno` que lleva el turno: la del tipo conocido o el nombre del nuevo. */
  const etiquetaTipo = tipo ? defTipo(tipo).etiqueta : (tipoCfg?.titulo ?? '')
  const aprobacion = tipo === 'colocacion' && obra ? aprobacionPorSaldo(obra.saldo) : null
  /* Las aberturas las carga el usuario: por ahora no se cuentan las de la obra. */
  const nAberturas = cantAberturas.trim() !== '' ? Number(cantAberturas) : null
  const nombreCliente = cuenta ? cuenta.clienteNombre || cuenta.nombre : ''

  /* Reparación: sus tipos. */
  useEffect(() => {
    if (tipo !== 'reparacion' || tiposRep) return
    let vivo = true
    getTiposReparacion()
      .then((t) => vivo && setTiposRep(t))
      .catch(() => vivo && setTiposRep([]))
    return () => {
      vivo = false
    }
  }, [tipo, tiposRep])

  /* Elegido el tipo de turno, se leen las obras y los pendientes del cliente en ese momento. Lo que
     estaba tildado y ya no está en Monday se destilda. */
  useEffect(() => {
    if (!sel.tipo || !cuenta) {
      setListado(null)
      return
    }
    let vivo = true
    setListado('cargando')
    conTope(getElementosCliente(cuenta))
      .then((e) => {
        if (!vivo) return
        setElementos(e)
        setSel((x) => ({
          ...x,
          obraId: x.obraId && e.obras.some((o) => o.id === x.obraId) ? x.obraId : null,
          pendientesIds: x.pendientesIds.filter((id) => e.pendientes.some((p) => p.id === id)),
        }))
        setListado('listo')
      })
      .catch(() => {
        if (!vivo) return
        setListado(null)
        setErrorMonday('leer las obras y los pendientes del cliente')
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.tipo, cuenta?.id])

  /* ── Etapa 1 ── */
  const abrirCuenta = async (id: string) => {
    setCargando(true)
    try {
      const c = await conTope(getCliente(id))
      if (!c) return
      const e = await conTope(getElementosCliente(c))
      /* Otra cuenta es otro turno: lo elegido para la anterior se descarta. */
      if (cuenta?.id !== c.id) {
        setSel(seleccionVacia())
        setOps([])
        setPasoMax(0)
      }
      setCuenta(c)
      setElementos(e)
    } catch {
      setErrorMonday('leer los datos del cliente')
    } finally {
      setCargando(false)
    }
  }
  const b = useBuscadorObras({
    indice,
    buscarRemoto: async (t) => {
      try {
        return await conTope(buscarClientes(t, 50))
      } catch (e) {
        setErrorMonday('buscar el cliente')
        throw e
      }
    },
    abrir: abrirCuenta,
    onSinResultados: () => {},
    pedidoVacio: 'Escribí el nombre del cliente o su id para buscar.',
  })
  const hayCuenta = !!cuenta || cargando
  const ayudaBuscador = ayudaDe(b, indice.length > 0, hayCuenta, AYUDA_SIN_CLIENTE).replace(
    'No está en la lista rápida. Tocá Buscar para buscarla en Monday.',
    'No está en la lista rápida. Tocá Buscar para buscarla en Monday.',
  )
  const ayuda =
    ayudaBuscador === SIN_RESULTADOS_BUSCADOR
      ? b.error
        ? hayCuenta
          ? ''
          : AYUDA_SIN_CLIENTE
        : SIN_RESULTADOS
      : ayudaBuscador

  const ir = (n: number) => {
    setPaso(n)
    setPasoMax((m) => Math.max(m, n))
  }

  const continuar = () => {
    if (paso === 0) {
      if (!cuenta || !elementos || cargando)
        return setFaltan({
          titulo: 'Falta cargar un cliente',
          items: ['Buscá y cargá la cuenta corriente del cliente.'],
        })
      return ir(1)
    }
    if (paso === 1) {
      const f = faltantesSeleccion(sel, {
        hayPendientes: (elementos?.pendientes ?? []).some((p) => p.pendiente > 0),
        aberturas: cantAberturas,
      })
      if (f.length) {
        setMarcar(true)
        return setFaltan({ titulo: 'Todavía no se puede continuar', items: f })
      }
      setMarcar(false)
      return ir(2)
    }
    void (editar ? guardar() : confirmar())
  }

  /* ── Editar: guardar sólo lo que cambió ── */
  const guardar = async () => {
    if (!editar || !original || !cuenta || !tipoCfg || fase) return
    if (tipo === 'reparacion' && !tipoRep.trim()) {
      setMarcar(true)
      return setFaltan({ titulo: 'Todavía no se puede guardar el turno', items: ['Elegí el tipo de reparación.'] })
    }
    const opsTurno = obra ? ops : []
    const nuevo: DatosEdicionTurno = {
      clienteId: cuenta.clienteId,
      tipo: tipoCfg.clave,
      obraId: obra?.id ?? null,
      pendientesIds: pendientes.map((p) => p.id),
      opIds: opsTurno.map((o) => o.id),
      aberturas: tipo === 'colocacion' && obra ? nAberturas : null,
      tipoReparacion: tipo === 'reparacion' ? tipoRep : '',
    }
    const cambios = cambiosTurno(original, nuevo)
    if (!cambios.length) return onCerrar('El turno no tenía cambios para guardar.')
    /* La constancia: qué cambió, de qué a qué. */
    const lista = (l: string[], vacio: string) => (l.length ? l.join(', ') : vacio)
    const detalle: Record<CampoTurno, string> = {
      cliente: `Cliente: ${editar.cliente || '—'} → ${nombreCliente || '—'}`,
      tipo: `Tipo de turno: ${editar.etiquetaTipo || 'Sin tipo'} → ${tipoCfg.titulo}`,
      obra: `Obra: ${editar.obra || 'Sin obra'} → ${obra?.nombre ?? 'Sin obra'}`,
      pendientes: `Pendientes de entrega: ${lista(pendientes.map((p) => p.producto), 'Ninguno')}`,
      ops: `Órdenes de producción: ${lista(opsTurno.map((o) => o.nombre), 'Ninguna')}`,
      aberturas: `Cantidad de aberturas: ${original.aberturas ?? '—'} → ${nAberturas ?? '—'}`,
      tipoReparacion: `Tipo de reparación: ${original.tipoReparacion || '—'} → ${tipoRep || '—'}`,
    }
    setFase('registrando')
    try {
      await guardarEdicionTurno(
        editar.id,
        {
          cliente: cuenta,
          tipo: tipoCfg,
          obra,
          pendientes,
          ops: opsTurno,
          aberturas: nuevo.aberturas,
          tipoReparacion: tiposRep?.find((t) => t.nombre === tipoRep) ?? null,
        },
        cambios,
        { autor: usuario?.name ?? '', detalle: cambios.map((c) => detalle[c]) },
      )
      setFase(null)
      onCerrar(
        `Turno actualizado: ${nombreCliente} · ${cambios.length === 1 ? '1 cambio' : `${cambios.length} cambios`}.`,
      )
    } catch {
      setFase(null)
      setErrorMonday('guardar los cambios del turno')
    }
  }

  /* ── Etapa 3: confirmar ── */
  const confirmar = async () => {
    if (!cuenta || !tipoCfg || fase) return
    const f = faltantesRegistro({ tipo, fecha, hora, tipoReparacion: tipoRep }, hoy)
    if (f.length) {
      setMarcar(true)
      return setFaltan({ titulo: 'Todavía no se puede confirmar el turno', items: f })
    }
    setFase('registrando')
    try {
      /* El horario tiene que estar libre: se lee la Agenda en el momento. */
      const activos = await listarTurnos()
      if (horarioOcupado(activos, fecha, hora)) {
        setFase(null)
        return setBloqueo(`El ${fechaHoraCorta(fecha, hora)} ya tiene un turno. Elegí otra fecha u hora.`)
      }
      const id = await crearTurno({
        cliente: cuenta,
        tipo,
        tipoTitulo: tipoCfg.titulo,
        fecha,
        hora,
        obra,
        pendientes,
        ops,
        aberturas: tipo === 'colocacion' ? nAberturas : null,
        aprobacion,
        tipoReparacion: tiposRep?.find((t) => t.nombre === tipoRep) ?? null,
        responsableId: usuario?.id ?? null,
      })
      /* El tipo, con el ítem ya creado: es el cambio que dispara la automatización de Monday. */
      await escribirTipoConfig(id, tipoCfg)
      const t = await leerTurno(id).catch(() => null)
      const turno: Turno =
        t ??
        ({
          id,
          nombre: nombreCliente,
          etiquetaTipo,
          tipo,
          etiquetaEstado: 'Pendiente de Enviar',
          estado: 'pendiente',
          fecha,
          hora,
          clienteId: cuenta.clienteId,
          cliente: nombreCliente,
          obraId: obra?.id ?? '',
          obra: obra?.nombre ?? '',
          pendienteId: pendientes[0]?.id ?? '',
          pendiente: pendientes.map((p) => p.producto).join(', '),
          cantAberturas: nAberturas != null ? String(nAberturas) : '',
          responsable: usuario?.name ?? '',
          aprobacion: '',
          material: obra?.material ?? '',
          ubicacion: obra?.ubicacion ?? '',
          ctaCte: '',
          motivoCancelacion: '',
          resultado: '',
          notifAsignacion: '',
          creado: new Date().toISOString(),
        } as Turno)
      setCreado(turno)
      onCreado(turno)
      setFase('preguntando')
    } catch {
      setFase(null)
      setErrorMonday('registrar el turno en la Agenda')
    }
  }

  const texto = tipoCfg
    ? mensajeAsignacion({
        cliente: nombreCliente,
        tipo,
        etiquetaTipo,
        fecha,
        hora,
        ubicacion: obra?.ubicacion || cuenta?.ubicacion || '',
        material: obra?.material ?? '',
        aberturas: nAberturas,
        obra: obra?.nombre ?? '',
        saldo: obra?.saldo ?? null,
        aprobacion,
      })
    : ''

  const terminar = (enviado: boolean, aviso?: string) => {
    const cuando = fechaHoraCorta(fecha, hora)
    onCerrar(
      aviso ??
        (enviado
          ? `Turno registrado y enviado: ${nombreCliente} · ${cuando}.`
          : `Turno registrado como Pendiente de Enviar: ${nombreCliente} · ${cuando}.`),
    )
  }

  /* Colocación: las aberturas a colocar, en la fila desplegada de la obra. Arranca vacío y, hasta que
     tenga un número, con borde rojo: es obligatorio. */
  const campoAberturas = (
    <div className="med-campo ag-campo-ab">
      <label className="med-l" htmlFor={`${uid}-ab`}>
        Cant Aberturas a colocar *
      </label>
      <div className={`med-conic ${aberturasValidas(cantAberturas) ? '' : 'ag-ab--falta'}`}>
        <i className="fas fa-border-all" aria-hidden="true" />
        <input
          id={`${uid}-ab`}
          className="med-input"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder="Ej: 4"
          value={cantAberturas}
          onChange={(e) => setCantAberturas(e.target.value)}
        />
      </div>
    </div>
  )

  /* ── Lo que se ve ── */
  /* Las tablas se llenan recién con el listado pedido al elegir el tipo de turno. */
  const tablaObras = listado === 'listo' ? (elementos?.obras ?? []) : []
  const tablaPend = listado === 'listo' ? (elementos?.pendientes ?? []) : []
  /** El renglón de una tabla sin filas: falta el tipo, se está buscando, o no hay nada. */
  const filaAviso = (cols: number, que: 'las obras' | 'los pendientes de entrega', vacio: string) => (
    <tr>
      <td colSpan={cols} className="ant-aviso">
        {listado === 'cargando' ? (
          <>
            <i className="fas fa-spinner fa-spin" /> Buscando {que} del cliente en Monday...
          </>
        ) : listado === null ? (
          <>
            <i className="fas fa-circle-info" /> Elegí el tipo de turno para listar {que} del cliente.
          </>
        ) : (
          <>
            <i className="fas fa-circle-info" /> {vacio}
          </>
        )}
      </td>
    </tr>
  )
  const obraDeOps = verOpsDe ? (elementos?.obras.find((o) => o.id === verOpsDe) ?? null) : null

  let cuerpo: ReactNode
  if (paso === 0) {
    const pendientesActivos = tablaPend.filter((p) => p.pendiente > 0).length
    cuerpo = (
      <>
        <BuscadorObras
          b={b}
          placeholder="Buscar cuenta corriente del cliente por nombre"
          ayuda={ayuda}
          ayudaEnRojo={ayuda === AYUDA_SIN_CLIENTE}
          ocupado={cargando}
          tituloBuscar="Buscar directamente en Monday, por si la cuenta todavía no está en la lista rápida"
        />
        <div
          className={`card no-radius cliente-ficha ag-ficha-basica ${!cuenta || cargando ? 'cliente-ficha--vacio' : ''}`}
        >
          {!cuenta || cargando ? (
            <>
              <span className="skeleton skeleton--linea skeleton--corto" />
              <span className="skeleton skeleton--linea skeleton--titulo" />
              <div className="kpi-grid kpi-grid--2">
                <span className="skeleton skeleton--valor" />
                <span className="skeleton skeleton--valor" />
              </div>
            </>
          ) : (
            <>
              <span className="client-id">ID Cta Cte: {cuenta.id}</span>
              <h2 className="client-name">{cuenta.nombre}</h2>
              <div className="badges">
                <span className={`badge ${cuenta.clienteId ? 'badge-green' : 'badge--cond'}`}>
                  Cliente asignado: <strong>{cuenta.clienteNombre || 'Sin cliente asignado'}</strong>
                </span>
                <span className="badge badge-gray">
                  Cel-WhatsApp: {cuenta.celular ? formatoCelular(cuenta.celular) : 'Sin cargar'}
                </span>
              </div>
              <div className="kpi-grid kpi-grid--2">
                <div className="kpi-card">
                  <span className="kpi-label">obras total del cliente</span>
                  <span className="kpi-value">{tablaObras.length}</span>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">cantidad de pendientes (reeventa)</span>
                  <span className="kpi-value">{pendientesActivos}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </>
    )
  } else if (paso === 1) {
    const hayPendientes = tablaPend.some((p) => p.pendiente > 0)
    const pendObligatorio = sel.tipo === 'entrega' && hayPendientes
    cuerpo = (
      <>
        <div className="cobro-card ag-asistente-tabla">
          <h3 className="cobro-card-title">Tipo de turno, obras y pendientes de entrega</h3>
          <p className="cobro-card-desc">
            {!sel.tipo
              ? 'Elegí el tipo de turno: con eso se buscan en Monday las obras y los pendientes de entrega del cliente.'
              : sel.tipo === 'entrega'
                ? 'Reparto: tildá los pendientes de entrega que van en este turno.'
                : 'Tildá la obra del turno. Los pendientes de entrega son opcionales y van en el mismo turno.'}
          </p>

          {/* Primero el tipo de turno. */}
          <div className="carga-grid ag-asistente-campos ag-asistente-campos--2">
            <div className="med-campo">
              <label className="med-l" htmlFor={`${uid}-tipo`}>
                Tipo de turno *
              </label>
              <SelectBuscable
                id={`${uid}-tipo`}
                valor={sel.tipo ?? ''}
                opciones={tipos.map((t) => ({ valor: t.clave, texto: t.titulo }))}
                placeholder="Seleccionar..."
                falta={marcar && !sel.tipo}
                onElegir={(v) => {
                  setSel((x) => elegirTipo(x, v))
                  if (v === 'entrega') setOps([])
                }}
              />
            </div>
          </div>

          {sel.tipo !== 'entrega' && (
            <>
              <hr className="ag-sel-division" />
              <div className="ag-sel-cabeza">
                <h4 className="ag-sel-sub">
                  <i className="fas fa-building" /> Obra del turno
                </h4>
                <label className="ag-con-obra">
                  <input
                    type="checkbox"
                    className="ant-check"
                    checked={sel.conObra}
                    onChange={(e) => {
                      setSel((x) => cambiarConObra(x, e.target.checked))
                      if (!e.target.checked) setOps([])
                    }}
                  />
                  Con Obra
                </label>
              </div>
              {sel.conObra ? (
                <>
                  <div className="ant-tabla-wrap ag-sel-tabla">
                    <table className="ant-tabla ant-tabla--fija">
                      <colgroup>
                        <col className="ant-w-check" />
                        <col style={{ width: '28%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '16%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="ant-col-check" />
                          <th>Obra</th>
                          <th className="ant-col-cen">Material</th>
                          <th className="ant-col-cen">Etapa de producción</th>
                          <th className="ant-col-cen">Saldo</th>
                          <th className="ant-col-cen">Porcentaje de cancelación</th>
                          <th className="ant-col-cen">OP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tablaObras.length === 0
                          ? filaAviso(7, 'las obras', 'El cliente no tiene obras.')
                          : pagina(tablaObras, pagObras).map((o) => {
                              const on = sel.obraId === o.id
                              const color = colorCancelacion(o.pctCancelado)
                              const despliega = on && sel.tipo === 'colocacion'
                              return (
                                <Fragment key={o.id}>
                                  <tr
                                    className={`ant-row ${on ? 'ant-row--on' : ''} ${despliega ? 'ag-row--abierta' : ''}`}
                                  >
                                    <td className="ant-col-check">
                                      <input
                                        type="checkbox"
                                        className="ant-check"
                                        checked={on}
                                        onChange={() => {
                                          setSel((s) => elegirObra(s, o.id))
                                          setOps([])
                                        }}
                                        aria-label={`Elegir ${o.nombre}`}
                                      />
                                    </td>
                                    <td>
                                      <span className="ant-nro">{o.nombre}</span>
                                      <span className="ant-detalle">{o.ubicacion || 'Sin ubicación'}</span>
                                    </td>
                                    <td className="ant-col-cen">
                                      {o.material ? (
                                        <MaterialChip material={o.material} />
                                      ) : (
                                        <span className="ant-sd">—</span>
                                      )}
                                    </td>
                                    <td className="ant-col-cen">
                                      <EtapaChip texto={o.etapa} color={o.etapaColor} />
                                    </td>
                                    <td className="ant-col-cen">
                                      {o.saldo === null ? (
                                        <span className="ant-sd">Sin dato</span>
                                      ) : (
                                        <span className={`ant-num ${o.saldo > 0 ? 'ag-saldo-debe' : ''}`}>
                                          {dinero(o.saldo)}
                                        </span>
                                      )}
                                    </td>
                                    <td className="ant-col-cen">
                                      {o.pctCancelado === null ? (
                                        <span className="ant-sd">Sin dato</span>
                                      ) : (
                                        <span className={`ag-pct ag-pct--${color}`}>
                                          {Math.round(o.pctCancelado)} % cancelada
                                        </span>
                                      )}
                                    </td>
                                    <td className="ant-col-cen">
                                      <button type="button" className="ant-ver" onClick={() => setVerOpsDe(o.id)}>
                                        <i className="fas fa-industry" /> Ver OP
                                        {on && ops.length ? ` (${ops.length})` : ''}
                                      </button>
                                    </td>
                                  </tr>
                                  {despliega && (
                                    <tr className="ag-fila-detalle">
                                      <td colSpan={7}>
                                        <div className="carga-grid ag-detalle-obra">
                                          {campoAberturas}
                                          {aprobacionPorSaldo(o.saldo) === 'noAprobada' && (
                                            <div className="ag-aviso-saldo" role="note">
                                              <AprobacionChip aprobacion="noAprobada" chico />
                                              <span>
                                                La obra tiene saldo pendiente de cancelar ({dinero(o.saldo)}), por lo
                                                que se adjuntará el mensaje de recordatorio al usuario en el mensaje
                                                final del turno.
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              )
                            })}
                      </tbody>
                    </table>
                  </div>
                  <Paginador
                    pagina={pagObras}
                    total={tablaObras.length}
                    setPagina={setPagObras}
                    que={['obra', 'obras']}
                  />
                </>
              ) : (
                <p className="ag-sin-obra">
                  <i className="fas fa-circle-info" /> Las obras no se listan: el turno se carga sin obra asignada.
                </p>
              )}
            </>
          )}

          {
            <>
              <hr className="ag-sel-division" />
              <h4 className="ag-sel-sub">
                <i className="fas fa-truck" /> Pendientes de entrega{' '}
                <span className="ag-sel-opcional">{pendObligatorio ? '(tildá al menos uno)' : '(opcional)'}</span>
              </h4>
              <div className="ant-tabla-wrap">
                <table className="ant-tabla ant-tabla--fija">
                  <colgroup>
                    <col className="ant-w-check" />
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '21%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="ant-col-check" />
                      <th>Producto</th>
                      <th className="ant-col-cen">Vendido</th>
                      <th className="ant-col-cen">Entregado</th>
                      <th className="ant-col-cen">Por entregar</th>
                      <th className="ant-col-cen">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tablaPend.length === 0
                      ? filaAviso(6, 'los pendientes de entrega', 'El cliente no tiene pendientes de entrega.')
                      : pagina(tablaPend, pagPend).map((p) => {
                          const on = sel.pendientesIds.includes(p.id)
                          const vedada = p.pendiente <= 0
                          return (
                            <tr
                              key={p.id}
                              className={`ant-row ${on ? 'ant-row--on' : ''} ${vedada ? 'ant-row--off' : ''}`}
                              title={vedada ? 'Ya está entregado: no queda nada por entregar.' : undefined}
                            >
                              <td className="ant-col-check">
                                <input
                                  type="checkbox"
                                  className="ant-check"
                                  checked={on}
                                  disabled={vedada}
                                  onChange={() => setSel((s) => alternarPendiente(s, p.id))}
                                  aria-label={`Elegir ${p.producto}`}
                                />
                              </td>
                              <td>
                                <span className="ant-nro">{p.producto}</span>
                                <span className="ant-detalle">{p.nombre}</span>
                              </td>
                              <td className="ant-col-cen">
                                <span className="ant-num">{p.vendido}</span>
                              </td>
                              <td className="ant-col-cen">
                                <span className="ant-num">{Math.max(0, p.vendido - p.pendiente)}</span>
                              </td>
                              <td className="ant-col-cen">
                                <span className="ant-num ant-pend">{p.pendiente}</span>
                              </td>
                              <td className="ant-col-cen">
                                <span
                                  className={`ag-estado-pend ag-estado-pend--${entregaDePendiente(p.vendido, p.pendiente)}`}
                                >
                                  {p.estado ||
                                    {
                                      entregado: 'Entregado',
                                      parcial: 'Parcialmente Entregado',
                                      pendiente: 'Pend de Entregar',
                                    }[entregaDePendiente(p.vendido, p.pendiente)]}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                  </tbody>
                </table>
              </div>
              <Paginador
                pagina={pagPend}
                total={tablaPend.length}
                setPagina={setPagPend}
                que={['pendiente', 'pendientes']}
              />
              {sel.pendientesIds.length > 0 && obra && (
                <p className="ag-nota">
                  <i className="fas fa-circle-info" /> Los pendientes van en el mismo turno de la obra: se crea un solo
                  turno, de tipo <strong>{tipoCfg?.titulo ?? ''}</strong>.
                </p>
              )}
            </>
          }
        </div>
      </>
    )
  } else {
    cuerpo = (
      <div className="card card-pad ag-registro-unico">
        <h3 className="resumen-title">Ficha de registro de turno</h3>
        <dl className="ag-resumen">
          <dt>Cliente</dt>
          <dd>
            {nombreCliente}
            {!cuenta?.clienteId && <span className="ant-detalle">La cuenta no tiene un cliente asignado</span>}
          </dd>
          <dt>Cuenta corriente</dt>
          <dd>{cuenta?.nombre}</dd>
          <dt>Tipo de turno</dt>
          <dd>{tipoCfg && <TipoTurnoChip tipo={tipo} etiqueta={tipoCfg.titulo} />}</dd>
          <dt>Obra</dt>
          <dd>
            {obra ? (
              <>
                {obra.nombre}
                {obra.ubicacion && <span className="ant-detalle">{obra.ubicacion}</span>}
              </>
            ) : (
              <span className="ant-sd">Sin obra</span>
            )}
          </dd>
          {obra && (
            <>
              <dt>Órdenes de producción</dt>
              <dd>
                {ops.length ? ops.map((o) => o.nombre).join(', ') : <span className="ant-sd">Ninguna vinculada</span>}
              </dd>
            </>
          )}
          {tipo === 'colocacion' && (
            <>
              <dt>Cant Aberturas a colocar</dt>
              <dd>{nAberturas != null ? nAberturas : <span className="ant-sd">Sin cargar</span>}</dd>
            </>
          )}
          <dt>Pendientes de entrega</dt>
          <dd>
            {pendientes.length ? (
              pendientes.map((p) => (
                <span key={p.id} className="ag-resumen-item">
                  {p.producto} <span className="ag-por-entregar">· {p.pendiente} por entregar</span>
                </span>
              ))
            ) : (
              <span className="ant-sd">Ninguno</span>
            )}
          </dd>
          {tipo === 'colocacion' && obra && (
            <>
              <dt>Estado de aprobación</dt>
              <dd>
                <AprobacionChip aprobacion={aprobacion} /> <span className="ag-saldo">Saldo: {dinero(obra.saldo)}</span>
              </dd>
            </>
          )}
          {editar ? (
            <>
              <dt>Estado</dt>
              <dd>
                <EstadoTurnoChip estado={editar.estado} />
              </dd>
            </>
          ) : (
            <>
              <dt>Estado al registrarlo</dt>
              <dd className="ag-estado-registro">
                <EstadoTurnoChip estado="pendiente" />
                <span className="ag-estado-nota">(Si se envía el mensaje de asignación, el turno resulta Enviado)</span>
              </dd>
            </>
          )}
        </dl>

        <div className="ag-registro-campos">
          <div className="med-campo">
            <label className="med-l" htmlFor={`${uid}-fecha`}>
              Fecha de turno *
            </label>
            <div className={`med-conic ${marcar && !fecha ? 'ag-fecha--falta' : ''}`}>
              <i className="fas fa-calendar-day" aria-hidden="true" />
              <input
                id={`${uid}-fecha`}
                className="med-input med-fecha"
                type="date"
                min={hoy}
                value={fecha}
                disabled={fase !== null || !!editar}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          </div>
          <div className="med-campo">
            <label className="med-l" htmlFor={`${uid}-hora`}>
              Rango Horario Aproximado
            </label>
            <div className="med-conic">
              <i className="fas fa-clock" aria-hidden="true" />
              <input
                id={`${uid}-hora`}
                className="med-input med-fecha"
                type="time"
                step={300}
                value={hora}
                disabled={fase !== null || !!editar}
                onClick={(e) => e.currentTarget.showPicker?.()}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
          </div>
          {editar && (
            <p className="ag-nota ag-nota--fila">
              <i className="fas fa-lock" /> La fecha y el rango horario no se editan: se cambian al reprogramar el turno.
            </p>
          )}
          {tipo === 'reparacion' && (
            <div className="med-campo">
              <label className="med-l" htmlFor={`${uid}-rep`}>
                Tipo de reparación *
              </label>
              <SelectBuscable
                id={`${uid}-rep`}
                valor={tipoRep}
                opciones={(tiposRep ?? []).map((t) => ({ valor: t.nombre, texto: t.nombre }))}
                placeholder="Seleccionar..."
                cargando={tiposRep === null}
                textoCargando="Leyendo los tipos de reparación…"
                falta={marcar && !tipoRep}
                disabled={fase !== null}
                onElegir={setTipoRep}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Creado el turno, el asistente se cierra: queda sólo la pregunta del mensaje. */}
      {fase !== 'preguntando' && (
        <Modal
          title=""
          onClose={() => onCerrar()}
          cerrable={fase === null}
          className="ag-asistente obras-v2 anticipos-v2 agenda-v2"
        >
          <div className="ag-asistente-cabeza">
            <div className="ag-asistente-tit">
              <i className={`fas ${editar ? 'fa-pen-to-square' : 'fa-calendar-plus'}`} aria-hidden="true" />
              <div>
                <h3 className="modal-title">{editar ? 'Editar turno' : 'Nuevo turno'}</h3>
                <p className="ag-asistente-cuando">
                  {fechaInicial ? fechaHoraCorta(fechaInicial, horaInicial) : 'Elegí la fecha al registrar'}
                </p>
              </div>
            </div>
            <Stepper
              steps={ETAPAS}
              current={paso}
              maxReached={pasoMax}
              className="stepper--tight ag-asistente-stepper"
              onStep={fase === null ? (i) => setPaso(i) : undefined}
            />
          </div>
          <div className="ag-asistente-cuerpo">{cuerpo}</div>
          <div className="ag-asistente-pie">
            <button
              type="button"
              className="btn-volver"
              disabled={fase !== null}
              onClick={() => (paso === 0 ? onCerrar() : setPaso(paso - 1))}
            >
              <i className="fas fa-arrow-left" /> Volver
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={fase !== null || cargando || preparando}
              onClick={continuar}
            >
              {paso < 2 ? (
                <>
                  Continuar a {ETAPAS[paso + 1]} <i className="fas fa-arrow-right" />
                </>
              ) : (
                <>
                  {editar ? (
                    <>
                      <i className="fas fa-floppy-disk" /> Guardar Turno
                    </>
                  ) : (
                    <>
                      <i className="fas fa-calendar-check" /> Confirmar turno
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </Modal>
      )}

      {obraDeOps && (
        <ModalOrdenes
          obraNombre={obraDeOps.nombre}
          ordenesIds={obraDeOps.ordenesIds}
          elegidas={sel.obraId === obraDeOps.id ? ops.map((o) => o.id) : []}
          onClose={() => setVerOpsDe(null)}
          onListo={(elegidas) => {
            setVerOpsDe(null)
            /* Sin OP elegidas de otra obra, no cambia nada: la selección de OP es opcional. */
            if (sel.obraId !== obraDeOps.id && elegidas.length === 0) return
            /* Vincular OP de una obra es elegir esa obra (la única del turno). */
            setSel((s) => ({
              ...(s.obraId === obraDeOps.id ? s : elegirObra(s, obraDeOps.id)),
              opIds: elegidas.map((o) => o.id),
            }))
            setOps(elegidas)
          }}
        />
      )}

      {preparando && (
        <ModalCargando titulo="Leyendo los datos del turno..." detalle="Se cargan su cliente, su obra, sus pendientes y sus OP." />
      )}

      {fase === 'registrando' &&
        (editar ? (
          <ModalCargando
            titulo="Registrando los cambios del turno..."
            detalle="Se actualizan en la Agenda sólo los datos que cambiaste."
          />
        ) : (
          <ModalCargando
            titulo="Registrando el turno en la Agenda..."
            detalle="Se verifica que el horario esté libre y se crea el turno con todos los datos."
          />
        ))}

      {fase === 'preguntando' && creado && cuenta && (
        <EnvioMensaje
          titulo="¿Desea enviar el mensaje de asignación al cliente?"
          texto={texto}
          textoNo="No, dejarlo Pendiente"
          cliente={{ id: cuenta.clienteId, nombre: nombreCliente, celular: cuenta.celular }}
          registrar={(enviado) => registrarAsignacion(creado.id, enviado, hoyLocal())}
          onCelular={(nuevo) => setCuenta({ ...cuenta, celular: nuevo })}
          onTerminar={terminar}
        >
          <p className="modal-clave">El turno ya quedó registrado en la Agenda.</p>
          <p className="modal-nota">
            Si lo enviás, el turno pasa a <strong>Enviado</strong>. Si no, queda <strong>Pendiente de Enviar</strong>.
          </p>
        </EnvioMensaje>
      )}

      {faltan && (
        <AvisoModal titulo={faltan.titulo} faltantes={faltan.items} onClose={() => setFaltan(null)}>
          Completá lo siguiente:
        </AvisoModal>
      )}
      {bloqueo && (
        <AvisoModal titulo="Ese horario no está libre" onClose={() => setBloqueo(null)}>
          {bloqueo}
        </AvisoModal>
      )}
      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
    </>
  )
}
