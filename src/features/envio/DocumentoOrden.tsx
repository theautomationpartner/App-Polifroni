import { useState } from 'react'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { getUrlArchivo, type ResumenOrden } from '@/services/monday'

/** Los rótulos de los datos: los mismos en la tarjeta llena y en la vacía. */
const ROTULOS = ['N° Orden', 'N° OP original', 'Tipo', 'Medido por', 'Fecha de medición'] as const

/**
 * La tarjeta TODAVÍA SIN orden: la misma forma que la llena, con rayas en lugar de datos.
 *
 * No dice nada: el selector de arriba ya pide que se elija una orden, y repetirlo acá es ruido. Lo
 * que hace es anticipar QUÉ va a aparecer —y dónde—, así que al elegir no salta nada de lugar: los
 * datos ocupan el sitio que ya tenían las rayas.
 */
export function DocumentoOrdenVacio() {
  return (
    <div className="docop docop--fantasma" aria-hidden="true">
      <div className="docop-cab">
        <span className="docop-ic">
          <i className="fas fa-file-pdf" />
        </span>
        <div className="docop-tit">
          <span className="docop-id">—</span>
          <span className="docop-arch">—</span>
        </div>
      </div>
      <dl className="docop-datos">
        {ROTULOS.map((l) => (
          <div key={l}>
            <dt>{l}</dt>
            <dd className="docop-falta">—</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** "2026-09-25" → "25/09/2026". */
const fecha = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso)

/**
 * El documento que se le manda al cliente: la OP final de la orden emitida.
 *
 * Sin vista previa embebida: el PDF se abre aparte, en el visor del navegador, que es donde se lee
 * bien (zoom, páginas, descarga). Acá se muestra QUÉ orden es —su número, el de HETMO, quién midió y
 * cuándo— para confirmar de un vistazo que se está por mandar la correcta.
 *
 * La cabecera lleva UN estado, el de la OP. Antes convivían el del WhatsApp y el de la orden, y una
 * OP podía leerse "Enviada" y "Generada" a la vez: dos respuestas a una sola pregunta.
 */
export function DocumentoOrden({
  orden,
  cargando,
  vacio = 'Elegí la orden para ver su documento.',
}: {
  orden: ResumenOrden | null
  cargando: boolean
  /** Qué decir cuando todavía no hay orden. */
  vacio?: string
}) {
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
        <p>{orden && !pdf ? 'Esta orden no tiene la OP final adjunta.' : vacio}</p>
      </div>
    )
  }

  const valores = [orden.numero, orden.nOpHetmo, orden.tipo, orden.medidoPor, fecha(orden.fechaMedicion)]
  const datos = ROTULOS.map((l, i) => ({ l, v: valores[i] }))

  return (
    <div className="docop docop--aparece">
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
        <EstadoOrdenBadge estado={orden.estadoOrden} />
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

/**
 * El documento que TODAVÍA NO está en Monday (Aluminio): el PDF cargado en la app, con los datos de
 * la medición. Es el que se envía y el que se registra al finalizar. Se abre desde la memoria del
 * navegador, sin pedirle nada al tablero.
 */
export function DocumentoLocal({
  archivo,
  numero,
  tipo,
  medidoPor,
  fecha: fechaMed,
}: {
  archivo: File
  numero: string
  tipo: string
  medidoPor: string
  fecha: string
}) {
  const abrir = () => {
    const url = URL.createObjectURL(archivo)
    window.open(url, '_blank')
    /* La dirección vive lo que tarda en abrirse la pestaña: después se libera la memoria. */
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  const datos = [
    { l: 'N° Orden', v: numero },
    { l: 'Tipo', v: tipo },
    { l: 'Medido por', v: medidoPor },
    { l: 'Fecha de medición', v: fecha(fechaMed) },
  ]

  return (
    <div className="docop docop--aparece">
      <div className="docop-cab">
        <span className="docop-ic" aria-hidden="true">
          <i className="fas fa-file-pdf" />
        </span>
        <div className="docop-tit">
          <span className="docop-id">{numero ? `N° ${numero}` : 'Orden de Producción'}</span>
          <span className="docop-arch" title={archivo.name}>
            {archivo.name}
          </span>
        </div>
        <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: '#579bfc' }}>
          <i className="fas fa-paperclip" aria-hidden="true" /> Adjunta en la OP
        </span>
      </div>

      <dl className="docop-datos">
        {datos.map((d) => (
          <div key={d.l}>
            <dt>{d.l}</dt>
            <dd className={d.v ? '' : 'docop-falta'}>{d.v || '—'}</dd>
          </div>
        ))}
      </dl>

      <button type="button" className="btn btn-primary docop-abrir" onClick={abrir}>
        <i className="fas fa-arrow-up-right-from-square" /> Abrir documento
      </button>
    </div>
  )
}
