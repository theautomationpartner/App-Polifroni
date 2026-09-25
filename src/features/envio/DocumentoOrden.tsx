import { useState } from 'react'
import { EstadoBadge } from '@/components/ui/Aviso'
import { COLOR_ENVIO_OP, getUrlArchivo, type ResumenOrden } from '@/services/monday'

/** "2026-09-25" → "25/09/2026". */
const fecha = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso)

/**
 * El documento que se le manda al cliente: la OP final de la orden emitida.
 *
 * Sin vista previa embebida: el PDF se abre aparte, en el visor del navegador, que es donde se lee
 * bien (zoom, páginas, descarga). Acá se muestra QUÉ orden es —su número, el de HETMO, quién midió y
 * cuándo— para confirmar de un vistazo que se está por mandar la correcta.
 */
export function DocumentoOrden({ orden, cargando }: { orden: ResumenOrden | null; cargando: boolean }) {
  const [abriendo, setAbriendo] = useState(false)
  const pdf = orden ? (orden.opFinal.find((a) => !a.esImagen) ?? orden.opFinal[0]) : null

  const abrir = async () => {
    if (!pdf) return
    /* La ventana se abre EN el click y después se le carga la dirección: abrirla recién cuando
       Monday contesta la haría bloquear como ventana emergente. */
    const ventana = window.open('', '_blank')
    setAbriendo(true)
    try {
      const url = await getUrlArchivo(pdf.assetId)
      if (ventana) ventana.location.href = url
      else window.open(url, '_blank', 'noreferrer')
    } catch {
      ventana?.close()
    } finally {
      setAbriendo(false)
    }
  }

  if (cargando) {
    return (
      <div className="docop docop--vacio">
        <i className="fas fa-circle-notch spin" />
        <p>Buscando la orden emitida…</p>
      </div>
    )
  }

  if (!orden || !pdf) {
    return (
      <div className="docop docop--vacio">
        <i className="fas fa-file-circle-exclamation" />
        <p>Todavía no hay una OP final emitida para esta obra.</p>
      </div>
    )
  }

  const datos: { l: string; v: string }[] = [
    { l: 'N° Orden', v: orden.numero },
    { l: 'N° OP Hetmo', v: orden.nOpHetmo },
    { l: 'Tipo', v: orden.tipo },
    { l: 'Medido por', v: orden.medidoPor },
    { l: 'Fecha de medición', v: fecha(orden.fechaMedicion) },
  ]

  return (
    <div className="docop">
      <div className="docop-cab">
        <span className="docop-ic" aria-hidden="true">
          <i className="fas fa-file-pdf" />
        </span>
        <div className="docop-tit">
          <span className="docop-id">{orden.idOp || 'Orden de Producción'}</span>
          <span className="docop-arch" title={pdf.nombre}>
            {pdf.nombre}
          </span>
        </div>
        <EstadoBadge
          label="Envío"
          estado={{ texto: orden.estadoEnvio, color: COLOR_ENVIO_OP[orden.estadoEnvio] ?? '' }}
          vacio="Sin enviar"
          pendiente
        />
      </div>

      <dl className="docop-datos">
        {datos.map((d) => (
          <div key={d.l}>
            <dt>{d.l}</dt>
            <dd className={d.v ? '' : 'docop-falta'}>{d.v || '—'}</dd>
          </div>
        ))}
      </dl>

      <button type="button" className="btn btn-primary docop-abrir" onClick={() => void abrir()}>
        {abriendo ? (
          <>
            <i className="fas fa-circle-notch spin" /> Abriendo…
          </>
        ) : (
          <>
            <i className="fas fa-arrow-up-right-from-square" /> Abrir documento
          </>
        )}
      </button>
    </div>
  )
}
