import { useEffect, useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { consolidar, type Corte } from '@/lib/vidrios'
import { comoUsuario, ordenesDeObra, registrarSolicitudVidrios, vidriosDeOrdenes } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { CortesOrdenCompra } from './CortesOrdenCompra'
import { ordenCompraExcel } from './ordenCompraExcel'
import { ResumenOrdenCompra } from './ResumenOrdenCompra'

/**
 * Solicitud de cortes de vidrio · Etapa 3: la orden de compra al proveedor.
 *
 * Junta los vidrios de las órdenes elegidas en CORTES —misma composición y mismas medidas, con las
 * piezas sumadas—. A la izquierda, el resumen de la orden de compra con sus acciones (generar el
 * Excel, descargarlo y abrir Tempoglass); a la derecha, los cortes que lleva, del mismo alto.
 *
 * Tempoglass no tiene una API pública: es un sistema web con usuario y contraseña (investigado el
 * 02/10/2026). Hasta tener una integración, la orden de compra se genera en Excel (ver
 * `ordenCompraExcel`) y se carga a mano en su sistema, que se abre desde acá.
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
  const armarExcel = () => ordenCompraExcel({ obra: obra.nombre, ordenes: numerosOps, cortes: cortes ?? [] })

  const generar = async () => {
    setGenerando(true)
    setErrorExcel(false)
    try {
      setExcel(await armarExcel())
    } catch {
      setExcel(null)
      setErrorExcel(true)
    } finally {
      setGenerando(false)
    }
  }

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
          onGenerar={() => void generar()}
          onDescargar={descargar}
        />
        <CortesOrdenCompra cortes={cortes} error={error} />
      </div>

      <PieEtapa>
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
