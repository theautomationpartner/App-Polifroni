import { useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ObraFichaCliente } from '@/features/obras/ObraFichaCliente'
import { BuscadorObras, ayudaDe, useBuscadorObras } from '@/features/shared/BuscadorObras'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar, type EntradaIndice } from '@/lib/busquedaObras'
import { enElTaller } from '@/lib/estadosOp'
import { etiquetaPaso, tipoDe } from '@/lib/pasos'
import { delTipoDeLaObra } from '@/lib/vidrios'
import { buscarObras, getIndiceObras, getObra, mondayHabilitado } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra } from '@/types'

const AYUDA_SIN_OBRA = 'Buscá y cargá una obra para continuar'

/**
 * Solicitud de cortes de vidrio · Etapa 1: la obra.
 *
 * El mismo buscador y la misma ficha que "Cargar y Enviar". Sólo se sigue con una obra que tenga
 * órdenes en el taller y del mismo tipo que la obra (en una de PVC, órdenes de PVC; en una de
 * Aluminio, de Aluminio; ver `delTipoDeLaObra`): los vidrios que se piden son los de órdenes ya
 * mandadas a fabricar. Cuáles
 * de esas órdenes tienen vidrios pendientes de solicitar se ve en la etapa siguiente, con la misma
 * consulta que arma su tabla (ver `VidriosSeleccionView`).
 */
export function VidriosObraView() {
  const dispatch = useDispatch()
  const { obra: elegida } = useApp()
  const [indice, setIndice] = useState<EntradaIndice[]>([])
  const [vista, setVista] = useState<Obra | null>(elegida)
  const [cargando, setCargando] = useState(false)
  const [noEncontrada, setNoEncontrada] = useState(false)
  const [sinObra, setSinObra] = useState(false)
  const [sinTaller, setSinTaller] = useState(false)

  useEffect(() => {
    let vivo = true
    getIndiceObras()
      .then((o) => vivo && setIndice(indexar(o)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  const abrir = async (id: string) => {
    setCargando(true)
    try {
      const o = await getObra(id)
      if (!o) {
        setVista(null)
        setNoEncontrada(true)
        return
      }
      setVista(o)
    } catch {
      dispatch({ type: 'errorMonday', accion: 'buscar la obra' })
    } finally {
      setCargando(false)
    }
  }

  const b = useBuscadorObras({
    indice,
    buscarRemoto: async (t) => (await buscarObras(t, 50)).filas.map((f) => ({ id: f.id, nombre: f.nombre })),
    abrir,
    onSinResultados: () => setNoEncontrada(true),
    pedidoVacio: 'Escribí el nombre de la obra o su id para buscar.',
  })
  const ayuda = ayudaDe(b, indice.length > 0, !!vista || cargando, AYUDA_SIN_OBRA)

  const tipo = tipoDe(vista)
  const enTallerTodas = vista ? vista.ordenes.filter((o) => enElTaller(o.estado, o.envioTaller)) : []
  const enTaller = enTallerTodas.filter((o) => delTipoDeLaObra(tipo, o.tipo)).length
  const siguiente = etiquetaPaso('carga', null, null, 'vidrios')

  const continuar = () => {
    if (!vista || cargando) {
      if (!vista) setSinObra(true)
      return
    }
    if (enTaller === 0) {
      setSinTaller(true)
      return
    }
    dispatch({ type: 'setObra', obra: vista })
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Seleccionar Obra"
        descripcion="Buscá la obra cuyas órdenes enviadas al taller necesitan los vidrios cortados."
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      <BuscadorObras
        b={b}
        placeholder="Buscar obra por nombre"
        ayuda={ayuda}
        ayudaEnRojo={ayuda === AYUDA_SIN_OBRA}
        deshabilitado={!mondayHabilitado()}
        ocupado={cargando}
      />
      {b.error && <Aviso tono="err">{b.error}</Aviso>}

      <ObraFichaCliente obra={cargando ? null : vista} cargando={cargando} />

      <div className="actions-footer">
        <span className="paso-siguiente">
          {vista && !cargando ? (
            <>
              <i className="fas fa-industry paso-siguiente-ic" />{' '}
              {enTaller === 0
                ? 'Sin órdenes enviadas al taller'
                : `${enTaller} ${enTaller === 1 ? 'orden enviada' : 'órdenes enviadas'} al taller`}
            </>
          ) : null}
        </span>
        <button type="button" className="btn btn-primary" disabled={cargando} onClick={continuar}>
          Continuar a {siguiente} <i className="fas fa-arrow-right" />
        </button>
      </div>

      {sinObra && (
        <AvisoModal titulo="Falta cargar una obra" onClose={() => setSinObra(false)}>
          Para continuar tenés que buscar y cargar una obra. Usá el buscador de arriba y volvé a intentar.
        </AvisoModal>
      )}
      {sinTaller && vista && !tipo && (
        <AvisoModal titulo="La obra no tiene su tipo cargado" onClose={() => setSinTaller(false)}>
          Los cortes de vidrio se piden para órdenes del mismo tipo que la obra (PVC o Aluminio).{' '}
          <strong>{vista.nombre}</strong> no tiene cargado su tipo en Monday: cargalo y volvé a buscarla.
        </AvisoModal>
      )}
      {sinTaller && vista && tipo && enTallerTodas.length > 0 && (
        <AvisoModal titulo={`Esta obra no tiene órdenes de ${tipo} enviadas al taller`} onClose={() => setSinTaller(false)}>
          <strong>{vista.nombre}</strong> es una obra de {tipo}, y los cortes de vidrio se piden sólo para sus
          órdenes de {tipo} que ya salieron al taller. Las que tiene en el taller son de otro tipo.
        </AvisoModal>
      )}
      {sinTaller && vista && tipo && enTallerTodas.length === 0 && (
        <AvisoModal titulo="Esta obra no tiene órdenes enviadas al taller" onClose={() => setSinTaller(false)}>
          Los cortes de vidrio se piden para órdenes que ya salieron al taller. <strong>{vista.nombre}</strong>{' '}
          todavía no tiene ninguna: enviala desde «Cargar y Enviar Órdenes de Producción» → Al Taller.
        </AvisoModal>
      )}
      {noEncontrada && (
        <AvisoModal titulo="Obra no encontrada" onClose={() => setNoEncontrada(false)}>
          La obra que buscaste no está en el tablero de Obras. Probá con parte del nombre o pegá el id del ítem.
        </AvisoModal>
      )}
    </section>
  )
}
