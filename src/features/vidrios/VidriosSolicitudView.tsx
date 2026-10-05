import { useEffect, useState } from 'react'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { consolidar, type Corte } from '@/lib/vidrios'
import { comoUsuario, ordenesDeObra, vidriosDeOrdenes } from '@/services/monday'
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
 */
export function VidriosSolicitudView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const { vidriosOps, usuario, usuarios, responsableId } = useApp()
  const [cortes, setCortes] = useState<Corte[] | null>(null)
  /** Las OP de la solicitud, por su id ("IDOP-071"), para la orden de compra. */
  const [nombresOps, setNombresOps] = useState<string[]>([])
  /** Y por su N° de orden ("1234" en PVC, "A123" en Aluminio), como va en el Excel. */
  const [numerosOps, setNumerosOps] = useState<string[]>([])
  const [error, setError] = useState(false)
  /** La orden de compra generada, lista para descargar. */
  const [excel, setExcel] = useState<Blob | null>(null)
  const [generando, setGenerando] = useState(false)
  const [errorExcel, setErrorExcel] = useState(false)

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

  const generar = async () => {
    setGenerando(true)
    setErrorExcel(false)
    try {
      setExcel(await ordenCompraExcel({ obra: obra.nombre, ordenes: numerosOps, cortes: cortes ?? [] }))
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
    a.download = `Orden de compra vidrios - ${obra.nombre}.xlsx`.replace(/[\\/:*?"<>|]+/g, ' ')
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
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
          disabled={!cortes?.length}
          onClick={() =>
            dispatch({
              type: 'exito',
              exito: { texto: 'Solicitud de cortes preparada', detalle: `${obra.nombre} · ${total} piezas de vidrio` },
            })
          }
        >
          <i className="fas fa-flag-checkered" /> Finalizar Operación
        </button>
      </PieEtapa>
    </section>
  )
}
