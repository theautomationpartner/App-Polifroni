import { useEffect, useMemo, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { EstadoOrdenBadge } from '@/components/ui/EstadoOrdenBadge'
import { BuscadorObras, ayudaDe, useBuscadorObras } from '@/features/shared/BuscadorObras'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar, sugerir } from '@/lib/busquedaObras'
import { VISTA_ESTADO } from '@/lib/estadosOp'
import { etiquetaPaso } from '@/lib/pasos'
import {
  contarSubelementos,
  getUrlArchivo,
  ordenesEditables,
  subelementosDeOrdenes,
  type OrdenEditable,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { lecturaBase } from './lecturaBase'

const AYUDA_SIN_ORDEN = 'Buscá y cargá una orden para continuar'

const fecha = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')
/** Una OP sin subelementos (anterior a que se cargaran): sus aberturas salen del PDF original en la etapa 2. */
const sinCargar = (o: OrdenEditable) => o.aberturas === 0

/**
 * Editar Órdenes de Producción · Etapa 1: buscar la orden.
 *
 * Se busca por N° de orden, nombre de obra o cliente. Las órdenes editables (PVC, ni canceladas ni
 * con la producción completada) se bajan una vez al entrar —con su cliente— y la búsqueda es en
 * memoria, mientras se escribe. Con más de una coincidencia se despliega la lista, como el buscador
 * de obras de "Cargar y Enviar", con el número, la obra, el tipo y la etapa de cada una (el resto
 * —cliente, aberturas, vidrios— va en la ficha, para no recargar cada resultado). Elegida, se ve su ficha y se continúa.
 *
 * Al continuar arranca, por detrás, la lectura base de la orden (ver `lecturaBase`): si no estaba
 * guardada hay que leer el PDF original con la IA, y así está lista cuando se carga el dibujo nuevo.
 */
export function EditarBuscarView() {
  const dispatch = useDispatch()
  const { edicion } = useApp()
  const [ordenes, setOrdenes] = useState<OrdenEditable[] | null>(null)
  const [error, setError] = useState(false)
  const [intento, setIntento] = useState(0)
  const [vista, setVista] = useState<OrdenEditable | null>(edicion.orden)
  const [sinOrden, setSinOrden] = useState(false)
  const [noEncontrada, setNoEncontrada] = useState(false)

  useEffect(() => {
    let vivo = true
    setError(false)
    void (async () => {
      try {
        const lista = await ordenesEditables()
        if (!vivo) return
        setOrdenes(lista)
        /* Las aberturas y los vidrios llegan después: la búsqueda ya funciona sin ellos. */
        const subs = await subelementosDeOrdenes(lista.map((o) => o.id))
        if (!vivo) return
        setOrdenes(lista.map((o) => (subs[o.id] ? { ...o, ...contarSubelementos(subs[o.id]) } : o)))
      } catch {
        if (vivo) setError(true)
      }
    })()
    return () => {
      vivo = false
    }
  }, [intento])

  /* La ficha muestra los conteos apenas llegan. */
  const porId = useMemo(() => new Map((ordenes ?? []).map((o) => [o.id, o])), [ordenes])
  const enFicha = vista ? (porId.get(vista.id) ?? vista) : null

  const indice = useMemo(
    () =>
      indexar(
        (ordenes ?? []).map((o) => ({
          id: o.id,
          nombre: o.obraNombre || o.nombre,
          buscables: [o.numero, o.idOp, o.nombre, o.cliente].filter(Boolean),
        })),
      ),
    [ordenes],
  )

  const b = useBuscadorObras({
    indice,
    /* No hay nada más que buscar afuera: todas las editables ya están en memoria. */
    buscarRemoto: async (t) => sugerir(indice, t, 500).obras.map((o) => ({ id: o.id, nombre: o.nombre })),
    abrir: async (id) => setVista(porId.get(id) ?? null),
    onSinResultados: () => setNoEncontrada(true),
    pedidoVacio: 'Escribí el N° de orden, el nombre de la obra o el del cliente.',
  })

  const continuar = () => {
    if (!enFicha) {
      setSinOrden(true)
      return
    }
    void lecturaBase(enFicha).catch(() => {})
    dispatch({ type: 'elegirOrdenEdicion', orden: enFicha })
  }

  const verPdf = async (o: OrdenEditable) => {
    const pdf = o.opFinal.find((a) => !a.esImagen) ?? o.opFinal[0]
    if (!pdf) return
    const pestana = window.open('', '_blank')
    try {
      const url = await getUrlArchivo(pdf.assetId)
      if (pestana) pestana.location.href = url
      else window.open(url, '_blank', 'noopener')
    } catch {
      pestana?.close()
    }
  }

  const ayuda = ordenes === null && !error ? 'Cargando las órdenes de producción…' : ayudaDe(b, indice.length > 0, !!enFicha, AYUDA_SIN_ORDEN)
  const siguiente = etiquetaPaso('carga', null, 'PVC', 'editar')

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Buscar Orden"
        descripcion="Buscá la orden de producción que querés editar por su número, el nombre de la obra o el del cliente."
      />

      <BuscadorObras
        b={b}
        placeholder="Buscar por N° de orden, obra o cliente"
        tituloBuscar="Buscar entre todas las órdenes de PVC que se pueden editar"
        ayuda={ayuda}
        ayudaEnRojo={ayuda === AYUDA_SIN_ORDEN}
        deshabilitado={ordenes === null}
        renderFila={(f) => {
          const o = porId.get(f.id)
          if (!o) return null
          return (
            <>
              <span className="ritem-main">
                {/* El tipo, a la derecha del nombre de la obra, en el mismo renglón. */}
                <span className="ed-ritem-linea">
                  <span className="ritem-name">
                    {o.numero ? `N° ${o.numero}` : 'Sin N°'} · {o.obraNombre || o.nombre}
                  </span>
                  <span className="ritem-sub">
                    <span>
                      <i className="fas fa-industry" />
                      {o.tipo || 'PVC'}
                    </span>
                  </span>
                </span>
              </span>
              <span className="ritem-chips">
                <EstadoOrdenBadge estado={o.estadoOrden} chico />
              </span>
            </>
          )
        }}
      />

      {error && (
        <Aviso tono="err">
          No se pudieron leer las órdenes de producción desde Monday.{' '}
          <button type="button" className="cobro-reintentar" onClick={() => setIntento((n) => n + 1)}>
            Volver a intentar
          </button>
        </Aviso>
      )}

      {b.buscado && b.resultados.length > 1 && !b.abierto && !enFicha && (
        <button type="button" className="card obras-retomar" onClick={() => b.setAbierto(true)}>
          <i className="fas fa-list-ul" />
          <span>
            <strong>{b.resultados.length}</strong> órdenes encontradas para «{b.buscado}» · elegí una para seguir
          </span>
          <span className="obras-retomar-x" onClick={b.limpiar}>
            Limpiar
          </span>
        </button>
      )}

      <FichaOrden orden={enFicha} onVerPdf={(o) => void verPdf(o)} />

      <div className="actions-footer">
        <span className="paso-siguiente">
          {enFicha && (
            <>
              <i className="fas fa-arrow-turn-up paso-siguiente-ic" /> Siguiente: {siguiente}
            </>
          )}
        </span>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {siguiente} <i className="fas fa-arrow-right" />
        </button>
      </div>

      {sinOrden && (
        <AvisoModal titulo="Falta elegir una orden" onClose={() => setSinOrden(false)}>
          Para continuar tenés que buscar y elegir la orden de producción que vas a editar.
        </AvisoModal>
      )}
      {noEncontrada && (
        <AvisoModal titulo="Orden no encontrada" onClose={() => setNoEncontrada(false)}>
          No hay una orden de PVC editable con ese número, obra o cliente. Las canceladas y las que ya
          tienen la producción completada no se pueden editar.
        </AvisoModal>
      )}
    </section>
  )
}

/** La ficha de la orden elegida: lo que se va a editar, antes de seguir. */
function FichaOrden({ orden: o, onVerPdf }: { orden: OrdenEditable | null; onVerPdf: (o: OrdenEditable) => void }) {
  const vacio = !o
  const val = (contenido: React.ReactNode) =>
    vacio ? <span className="skeleton skeleton--valor" /> : <span className="kpi-value">{contenido}</span>
  return (
    <div className={`card no-radius cliente-ficha ${vacio ? 'cliente-ficha--vacio' : ''}`}>
      <div className="client-header">
        <div>
          {vacio ? (
            <>
              <span className="skeleton skeleton--linea skeleton--corto" />
              <span className="skeleton skeleton--linea skeleton--titulo" />
              <span className="skeleton skeleton--linea skeleton--medio" />
            </>
          ) : (
            <>
              <span className="client-id">{[o.idOp, o.numero ? `N° ${o.numero}` : ''].filter(Boolean).join(' · ')}</span>
              <h2 className="client-name">{o.obraNombre || o.nombre}</h2>
              <div className="badges">
                <span className="badge badge-gray">Cliente: {o.cliente || 'Sin cliente'}</span>
                <span className="badge badge-gray">Medido por: {o.medidoPor || '—'}</span>
                <span className="badge badge-gray">Fecha de medición: {fecha(o.fechaMedicion)}</span>
              </div>
            </>
          )}
        </div>
        <div className="status-indicators">
          {vacio ? (
            <>
              <span className="skeleton skeleton--tipo" />
              <span className="skeleton skeleton--estado" />
            </>
          ) : (
            <>
              {/* El verde de PVC, como la etiqueta Tipo de la obra en el tablero. */}
              <span className="obra-tipo" style={{ background: '#00c875' }}>
                {o.tipo || 'PVC'}
              </span>
              <div className="status-indicator">
                <span className="status-dot" style={{ background: VISTA_ESTADO[o.estadoOrden].color }} />
                {o.estado || VISTA_ESTADO[o.estadoOrden].rotulo}
              </div>
            </>
          )}
        </div>
      </div>
      <hr className="divider" />
      <section className="credito-grupo">
        <div className="kpi-grid kpi-grid--3">
          <div className="kpi-card">
            <span className="kpi-label">Aberturas</span>
            {val(o && sinCargar(o) ? 'Sin cargar' : (o?.aberturas ?? '…'))}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Vidrios</span>
            {val(o && sinCargar(o) ? 'Sin cargar' : (o?.vidrios ?? '…'))}
          </div>
          <div className="kpi-card">
            <span className="kpi-label">OP final</span>
            {vacio ? (
              <span className="skeleton skeleton--valor" />
            ) : o.opFinal.length ? (
              <button type="button" className="btn btn-out btn--sm" onClick={() => onVerPdf(o)}>
                <i className="fas fa-eye" /> Ver OP final
              </button>
            ) : (
              <span className="kpi-value">Sin PDF</span>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
