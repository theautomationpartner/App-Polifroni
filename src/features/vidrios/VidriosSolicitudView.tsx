import { useEffect, useRef, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import {
  faltantesPedido,
  hoyIso,
  nombreObraTempoglass,
  type DatosPedidoTempoglass,
} from '@/lib/tempoglass'
import { consolidar, type Corte } from '@/lib/vidrios'
import {
  comoUsuario,
  crearOrdenCompraVidrios,
  guardarIdObraTempoglass,
  guardarOrdenCompraGenerada,
  marcarVidriosSolicitados,
  ordenesDeObra,
  registrarSolicitudVidrios,
  vidriosDeOrdenes,
  vidriosYaSolicitados,
  type ResumenOrden,
} from '@/services/monday'
import { cargarPedidoTempoglass, type AvanceTempoglass, type ObraTempoglass } from '@/services/tempoglass'
import { useApp, useDispatch } from '@/state/hooks'
import { CortesOrdenCompra } from './CortesOrdenCompra'
import { ordenCompraExcel } from './ordenCompraExcel'
import { errorDelPaso, estadoDeAvance, EstadoRobotPill, robotEnCurso, type EstadoRobot } from './EstadoRobot'
import { pedidoTempoglassExcel } from './pedidoTempoglassExcel'
import { ResumenOrdenCompra } from './ResumenOrdenCompra'

/**
 * Solicitud de cortes de vidrio · Etapa 3: la orden de compra al proveedor.
 *
 * Junta los vidrios de las órdenes elegidas en CORTES —misma composición y mismas medidas, con las
 * piezas sumadas—. A la izquierda, el resumen de la orden de compra con sus acciones (generar el
 * Excel y descargarlo); a la derecha, los cortes que lleva, del mismo alto.
 *
 * Tempoglass no tiene una API pública: es un sistema web con usuario y contraseña. Con el comentario
 * y la fecha de entrega completos, "Generar orden de compra" arma la orden de compra (ver
 * `ordenCompraExcel`) y la planilla con el formato de Tempoglass (`pedidoTempoglassExcel`), guarda
 * las dos en la OP (`Generar Orden Compra Vidrio`) y el robot (`api/_tempoglass.ts`) carga el pedido
 * allá: busca la obra, crea el pedido, importa la planilla y lo cierra. Al final queda el Id.Int.Obra
 * en la OP y un ítem en 🪞 Orden de Compra Vidrios.
 *
 * "Finalizar Operación" sube el Excel de la orden de compra a cada OP que entra en ella
 * (`🤖Orden de Compra de Vidrios`) y deja su `🤖Estado Vidrios` en "Solicitados": así no vuelven a
 * aparecer en una solicitud nueva.
 */
export function VidriosSolicitudView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const { vidriosOps, usuario, usuarios, responsableId } = useApp()
  const [cortes, setCortes] = useState<Corte[] | null>(null)
  /** Las OP que entran en la orden de compra (las elegidas que tienen vidrios), por su ítem. */
  const [idsOps, setIdsOps] = useState<string[]>([])
  /** Las OP de la solicitud, por su id ("IDOP-071"), para la orden de compra. */
  const [nombresOps, setNombresOps] = useState<string[]>([])
  /** Y por su N° de orden ("1234" en PVC, "A123" en Aluminio), como va en el Excel. */
  const [numerosOps, setNumerosOps] = useState<string[]>([])
  const [error, setError] = useState(false)
  /** La orden de compra generada, lista para descargar. */
  const [excel, setExcel] = useState<Blob | null>(null)
  const [generando, setGenerando] = useState(false)
  const [errorExcel, setErrorExcel] = useState(false)
  /** Lo que pasa después de generar: guardar en la OP y el robot de Tempoglass (ver `EstadoRobot`). */
  const [robot, setRobot] = useState<EstadoRobot | null>(null)
  const robotOcupado = robotEnCurso(robot)
  /** El Excel que ya quedó guardado en las OP: si es el actual, "Reintentar" no lo vuelve a subir. */
  const [guardadoEnOp, setGuardadoEnOp] = useState<Blob | null>(null)
  /** La cabecera del pedido en Tempoglass, que se completa antes de generar. */
  const [pedido, setPedido] = useState<DatosPedidoTempoglass>({ comentario: '', fecha: '' })
  /** La planilla con el formato de Tempoglass, la que importa el robot. */
  const [planilla, setPlanilla] = useState<File | null>(null)
  /** Las OP de la solicitud (las que tienen vidrios), con sus datos. */
  const [opsSolicitud, setOpsSolicitud] = useState<ResumenOrden[]>([])
  /* Lo que ya quedó hecho en Tempoglass y Monday, para que un reintento retome y no repita: la obra
     elegida, el pedido creado (`retomar`), el pedido terminado (`cargado`) y el ítem de 🪞. Son refs:
     los avisos del robot llegan en medio de una función que sigue corriendo. */
  const obraTempoglass = useRef<{ obra: ObraTempoglass; idIntObra: string } | null>(null)
  const retomar = useRef<{ pedido: string; obra: ObraTempoglass; idIntObra: string } | null>(null)
  const cargado = useRef<{ pedido: string; idIntObra: string; renglones: number } | null>(null)
  const itemOc = useRef<string | null>(null)
  const [finalizando, setFinalizando] = useState(false)
  const [errorFinal, setErrorFinal] = useState(false)

  useAccionEnCurso('Esperá a que se registre la solicitud en las órdenes.', finalizando)

  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const [ops, porOp] = await Promise.all([ordenesDeObra(obra.ordenesIds), vidriosDeOrdenes(vidriosOps)])
        const nombre = (id: string) => ops.find((o) => o.id === id)?.idOp || `OP ${id}`
        const lista = vidriosOps.flatMap((id) => (porOp[id] ?? []).map((vidrio) => ({ op: nombre(id), vidrio })))
        if (!vivo) return
        setCortes(consolidar(lista))
        const conVidrios = vidriosOps.filter((id) => (porOp[id] ?? []).length > 0)
        setIdsOps(conVidrios)
        setOpsSolicitud(ops.filter((o) => conVidrios.includes(o.id)))
        setNombresOps(conVidrios.map(nombre))
        /* El N° de la OP, PVC o Aluminio ("A…"); sin número, su id. */
        setNumerosOps(conVidrios.map((id) => ops.find((o) => o.id === id)?.numero.trim() || nombre(id)))
        setExcel(null)
      } catch {
        if (vivo) {
          setCortes([])
          setError(true)
        }
      }
    })()
    return () => {
      vivo = false
    }
  }, [obra, vidriosOps])

  const emisor =
    usuarios.find((u) => u.id === responsableId) ?? (usuario ? comoUsuario(usuario.id, usuario.name) : null)
  const total = (cortes ?? []).reduce((n, c) => n + c.cantidad, 0)

  const nombreExcel = `Orden de compra vidrios - ${obra.nombre}.xlsx`.replace(/[\\/:*?"<>|]+/g, ' ')
  const nombrePlanilla = `PedidoDVH - ${nombresOps.join(', ') || obra.nombre}.xlsx`.replace(/[\\/:*?"<>|]+/g, ' ')
  const armarExcel = () => ordenCompraExcel({ obra: obra.nombre, ordenes: numerosOps, cortes: cortes ?? [] })

  /** Arma la orden de compra (para leer) y la planilla con el formato de Tempoglass (para importar). */
  const armarArchivos = async (): Promise<{ orden: Blob; planilla: File }> => {
    const [orden, planilla] = await Promise.all([armarExcel(), pedidoTempoglassExcel(cortes ?? [])])
    return { orden, planilla: new File([planilla], nombrePlanilla, { type: planilla.type }) }
  }

  const generar = async () => {
    if (faltantesPedido(pedido).length) return
    setGenerando(true)
    setErrorExcel(false)
    setRobot(null)
    let archivos: { orden: Blob; planilla: File }
    try {
      archivos = await armarArchivos()
      setExcel(archivos.orden)
      setPlanilla(archivos.planilla)
    } catch {
      setExcel(null)
      setErrorExcel(true)
      return
    } finally {
      setGenerando(false)
    }
    void guardarYCargar(archivos.orden, archivos.planilla)
  }

  /**
   * Guarda en la OP la orden de compra y la planilla de Tempoglass y, ya guardadas, el robot carga
   * el pedido allá. Si Monday falla, el robot no corre: lo que se carga en Tempoglass tiene que ser
   * lo que quedó registrado acá.
   */
  const guardarYCargar = async (orden: Blob, archivoPlanilla: File) => {
    setRobot({ fase: 'guardando' })
    try {
      const archivoOrden = new File([orden], nombreExcel, { type: orden.type })
      await Promise.all(idsOps.map((id) => guardarOrdenCompraGenerada(id, [archivoOrden, archivoPlanilla])))
      setGuardadoEnOp(orden)
    } catch (e) {
      console.warn('[vidrios] no se pudo guardar la orden de compra en las OP', e)
      setRobot({ fase: 'error', texto: 'No se pudo guardar la orden de compra en la OP' })
      return
    }

    /* Un pedido de Tempoglass es de UNA OP: su obra allá lleva el nombre de esa OP. */
    if (idsOps.length !== 1) {
      setRobot({
        fase: 'error',
        texto: `El robot carga el pedido de una sola OP y esta orden junta ${idsOps.length}: cargalo a mano en Tempoglass.`,
      })
      return
    }
    /* Nunca dos pedidos para la misma OP. La marca es `🤖Estado Vidrios` en "Solicitados" (la pone
       el robot al terminar), leída en Monday en este momento: la pantalla pudo quedar abierta desde
       antes. El Id.Int.Obra NO sirve de marca: es el número de la OBRA en Tempoglass, no del pedido. */
    if (!retomar.current) {
      try {
        if (await vidriosYaSolicitados(idsOps[0]!)) {
          setRobot({
            fase: 'error',
            texto: 'Los vidrios de esta OP ya se solicitaron (🤖Estado Vidrios: Solicitados): no se carga otro pedido.',
          })
          return
        }
      } catch (e) {
        console.warn('[vidrios] no se pudo verificar si la OP ya tiene pedido en Tempoglass', e)
        setRobot({ fase: 'error', texto: 'No se pudo verificar en Monday si esta OP ya tiene pedido en Tempoglass' })
        return
      }
    }
    await cargarEnTempoglass(archivoPlanilla)
  }

  /**
   * Corre el robot y muestra cada aviso en vivo en el pie. El servidor ya reintenta lo que se
   * arregla con un login nuevo; acá se cubre lo que el servidor no puede: que el pedido mismo no
   * llegue o se corte a mitad (la red del usuario, un corte de Vercel). Eso se reintenta UNA vez,
   * RETOMANDO el pedido si ya se había creado: nunca se crea otro.
   */
  const cargarEnTempoglass = async (archivoPlanilla: File) => {
    const alAvanzar = (a: AvanceTempoglass) => {
      if (a.etapa === 'obraSeleccionada') obraTempoglass.current = { obra: a.obra, idIntObra: a.idIntObra }
      if (a.etapa === 'pedidoCreado' && obraTempoglass.current) {
        retomar.current = { pedido: a.pedido, ...obraTempoglass.current }
      }
      setRobot(estadoDeAvance(a))
    }
    const op = opsSolicitud.find((o) => o.id === idsOps[0])
    if (!op) return setRobot({ fase: 'error', texto: 'No se encontraron los datos de la OP para cargar el pedido' })
    const correr = () =>
      cargarPedidoTempoglass(
        {
          /* La obra en Tempoglass lleva el nombre de la OP ("IDOP-097 - PVC 2326"): si no existe,
             el robot la crea con ese nombre y la ubicación de la obra en Monday. */
          nombre: nombreObraTempoglass(op),
          ubicacion: obra.ubicacion,
          comentario: pedido.comentario.trim(),
          fecha: pedido.fecha,
          archivo: archivoPlanilla,
          esperado: { renglones: (cortes ?? []).length, piezas: total },
          retomar: retomar.current ?? undefined,
        },
        alAvanzar,
      )
    setRobot({ fase: 'sesion' })
    try {
      const r = await correr().catch(async (e) => {
        console.warn('[vidrios] el pedido al robot de Tempoglass falló; se reintenta una vez', e)
        setRobot({ fase: 'reintentando', intento: 2, de: 2, motivo: 'se cortó la conexión con el robot' })
        await new Promise((listo) => setTimeout(listo, 2000))
        return correr()
      })
      if (r.etapa === 'error') return setRobot(errorDelPaso(r.paso, r.mensaje))
      cargado.current = { pedido: r.pedido, idIntObra: r.idIntObra, renglones: r.renglones }
      await registrarEnMonday()
    } catch (e) {
      console.warn('[vidrios] el robot de Tempoglass no respondió', e)
      setRobot(errorDelPaso('conexion', 'no se pudo hablar con el robot. Revisá la conexión.'))
    }
  }

  /**
   * El pedido ya está cargado y cerrado en Tempoglass: se registra en Monday. El Id.Int.Obra en la
   * OP, el ítem en 🪞 Orden de Compra Vidrios y la OP en "Solicitados" (🤖Estado Vidrios). El ítem se
   * crea UNA vez: un reintento no lo repite; lo demás se reescribe igual.
   */
  const registrarEnMonday = async () => {
    const c = cargado.current
    const op = opsSolicitud.find((o) => o.id === idsOps[0])
    if (!c || !op) return
    setRobot({ fase: 'registrando' })
    try {
      await guardarIdObraTempoglass(op.id, c.idIntObra)
      if (!itemOc.current) {
        itemOc.current = await crearOrdenCompraVidrios({
          nombre: nombreObraTempoglass(op),
          idIntObra: c.idIntObra,
          obraId: obra.id,
          ordenId: op.id,
          fechaColocacion: pedido.fecha,
          fechaPedido: hoyIso(),
        })
      }
      /* Con el ítem de 🪞 creado, la OP queda "Solicitados": ya tiene su pedido. */
      await marcarVidriosSolicitados(op.id)
      setRobot({ fase: 'listo', pedido: c.pedido, renglones: c.renglones })
    } catch (e) {
      console.warn('[vidrios] el pedido quedó en Tempoglass pero no se registró en Monday', e)
      setRobot({ fase: 'error', texto: `El pedido ${c.pedido} quedó cargado en Tempoglass, pero no se pudo registrar en Monday` })
    }
  }

  /** "Reintentar" del pie: retoma desde lo que falló, sin repetir lo que ya quedó hecho. */
  const reintentar = () => {
    if (!excel || !planilla || robotOcupado) return
    if (cargado.current) return void registrarEnMonday()
    void (guardadoEnOp === excel ? cargarEnTempoglass(planilla) : guardarYCargar(excel, planilla))
  }

  /* Una vez creado el pedido en Tempoglass, "Generar" no se vuelve a habilitar: crearía otro. */
  const bloqueoGenerar = robotOcupado
    ? 'Esperá a que termine el robot de Tempoglass'
    : robot?.fase === 'listo'
      ? 'El pedido ya se cargó en Tempoglass'
      : retomar.current
        ? `El pedido ${retomar.current.pedido} ya se creó en Tempoglass: usá «Reintentar» para terminarlo`
        : null

  const descargar = () => {
    if (!excel) return
    const url = URL.createObjectURL(excel)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreExcel
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  /** Sube la orden de compra a cada OP, marca sus vidrios como "Solicitados" y cierra la
      operación. Reintentar es seguro: la columna del archivo se vacía antes de subirlo y la
      etiqueta se reescribe igual. Si el Excel no se generó todavía, se genera acá. */
  const finalizar = async () => {
    if (finalizando) return
    setFinalizando(true)
    try {
      const blob = excel ?? (await armarExcel())
      setExcel(blob)
      const archivo = new File([blob], nombreExcel, { type: blob.type })
      await Promise.all(idsOps.map((id) => registrarSolicitudVidrios(id, archivo)))
    } catch (e) {
      console.warn('[vidrios] no se pudo marcar la solicitud en las órdenes', e)
      setErrorFinal(true)
      return
    } finally {
      setFinalizando(false)
    }
    dispatch({
      type: 'exito',
      exito: { texto: 'Solicitud de cortes registrada', detalle: `${obra.nombre} · ${total} piezas de vidrio` },
    })
  }

  return (
    <section className="view paso-layout obras-v2 anticipos-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Solicitar Cortes"
        descripcion="Revisá los cortes, generá la orden de compra y cargala en Tempoglass."
      />

      <div className="emision-grid vid-solicitud">
        <ResumenOrdenCompra
          emisor={emisor}
          obra={obra.nombre}
          ordenes={nombresOps}
          cortes={cortes}
          generando={generando}
          generada={!!excel}
          error={errorExcel}
          pedido={pedido}
          onPedido={(cambio) => setPedido((p) => ({ ...p, ...cambio }))}
          bloqueo={bloqueoGenerar}
          onGenerar={() => void generar()}
          onDescargar={descargar}
        />
        <CortesOrdenCompra cortes={cortes} error={error} />
      </div>

      <PieEtapa>
        {robot && <EstadoRobotPill estado={robot} onReintentar={reintentar} />}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!cortes?.length || !idsOps.length || finalizando}
          onClick={() => void finalizar()}
        >
          <i className="fas fa-flag-checkered" /> Finalizar Operación
        </button>
      </PieEtapa>

      {finalizando && (
        <ModalCargando
          titulo="Registrando la solicitud de cortes..."
          detalle={`Subimos la orden de compra a ${idsOps.length === 1 ? 'la orden de producción' : `las ${idsOps.length} órdenes de producción`} y marcamos sus vidrios como «Solicitados» en Monday. Esperá unos segundos.`}
        />
      )}
      {errorFinal && (
        <AvisoModal titulo="No se pudo registrar la solicitud" onClose={() => setErrorFinal(false)}>
          Monday no respondió al subir la orden de compra o al marcar los vidrios como «Solicitados». Reintentá
          en unos segundos; si la falla persiste, contactate con el soporte de TAP.
        </AvisoModal>
      )}
    </section>
  )
}
