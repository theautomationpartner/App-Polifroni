import { useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { ModalErrorConsulta, conTope } from '@/features/agenda/ModalErrorConsulta'
import { ObraFichaCliente } from '@/features/obras/ObraFichaCliente'
import { BuscadorObras, ayudaDe, useBuscadorObras } from '@/features/shared/BuscadorObras'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar, type EntradaIndice } from '@/lib/busquedaObras'
import { pendienteDeFacturar, porcentajeFacturado } from '@/lib/facturacion'
import { etiquetaPaso } from '@/lib/pasos'
import {
  buscarObras,
  getCuentaCorriente,
  getIndiceObras,
  getObra,
  mondayHabilitado,
  obrasDeCuenta,
  type CuentaCorriente,
  type ObraFacturable,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { Obra } from '@/types'
import { emisionIniciada, facturaInicial } from './borrador'

const AYUDA_SIN_OBRA = 'Buscá y cargá una obra para continuar'

/**
 * Facturar una Obra · Etapa 1: la obra que se factura.
 *
 * Es la MISMA búsqueda y la misma ficha de la obra de "Cargar y Enviar Órdenes de Producción"
 * (`BuscadorObras` + `ObraFichaCliente`): el índice rápido por nombre, el botón Buscar y la ficha con su
 * cliente, constructor e importes.
 *
 * TODO se lee al elegir la obra, mientras la ficha está en esqueleto: la obra, sus importes (total
 * pactado, diferencia y facturado) y su cuenta corriente con los movimientos (a quién se factura). Así
 * "Continuar" pasa a la etapa 2 en el acto, sin otra ventana de espera (regla del usuario, 13/10/2026).
 * Sin cuenta corriente vinculada no se puede facturar.
 */
export function FacturarObraView() {
  const dispatch = useDispatch()
  const { factura } = useApp()
  const bloqueada = emisionIniciada(factura)

  /** La obra a la vista en la ficha. Es la de la operación recién al continuar. */
  const [vista, setVista] = useState<Obra | null>(factura.obra)
  /** Lo facturado de la obra a la vista (total, diferencia y facturado), para su ficha. */
  const [importes, setImportes] = useState<ObraFacturable | null>(factura.obras[0] ?? null)
  /** La cuenta corriente de la obra a la vista, con sus movimientos. `null`: la obra no tiene. */
  const [cuenta, setCuenta] = useState<CuentaCorriente | null>(factura.cuenta)
  const [cargandoObra, setCargandoObra] = useState(false)
  const [indice, setIndice] = useState<EntradaIndice[]>([])
  const [aviso, setAviso] = useState<{ titulo: string; texto: string } | null>(null)
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  /** Otra obra con lo elegido de la anterior: se pregunta antes de descartarlo. */
  const [reemplazo, setReemplazo] = useState<Obra | null>(null)
  const sinToken = !mondayHabilitado()

  useEffect(() => {
    let vivo = true
    getIndiceObras()
      .then((obras) => vivo && setIndice(indexar(obras)))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  const abrir = async (id: string) => {
    setCargandoObra(true)
    setImportes(null)
    setCuenta(null)
    try {
      /* La obra y, a la par, lo que ya se le facturó (la ficha lo muestra en lugar del coordinador). */
      const [obra, facturadas] = await Promise.all([conTope(getObra(id)), conTope(obrasDeCuenta([id]))])
      if (!obra) {
        setVista(null)
        setAviso({
          titulo: 'Obra no encontrada',
          texto: 'La obra que buscaste no está en el tablero de Obras. Probá con parte del nombre o pegá el id del ítem.',
        })
        return
      }
      /* Y su cuenta corriente, con los movimientos: es a quién se factura. */
      const cuentaId = obra.ctaCteClienteIds[0]
      const cc = cuentaId ? await conTope(getCuentaCorriente(cuentaId)) : null
      setImportes(facturadas[0] ?? null)
      setCuenta(cc)
      setVista(obra)
    } catch {
      setErrorMonday('buscar la obra')
    } finally {
      setCargandoObra(false)
    }
  }

  const b = useBuscadorObras({
    indice,
    buscarRemoto: async (t) => (await buscarObras(t, 50)).filas.map((f) => ({ id: f.id, nombre: f.nombre })),
    abrir,
    onSinResultados: () =>
      setAviso({
        titulo: 'Obra no encontrada',
        texto: 'La obra que buscaste no está en el tablero de Obras. Probá con parte del nombre o pegá el id del ítem.',
      }),
    pedidoVacio: 'Escribí el nombre de la obra o su id para buscar.',
  })

  /** Pasa a la etapa 2 con lo que ya se leyó al elegir la obra: no vuelve a Monday. */
  const entrar = (obra: Obra) => {
    if (!cuenta) {
      setAviso({
        titulo: 'La obra no tiene cuenta corriente',
        texto: `${obra.nombre} no tiene una cuenta corriente de cliente vinculada (✋Cta Cte Cliente). Sin ella no se puede facturar.`,
      })
      return
    }
    if (!importes || importes.id !== obra.id) {
      setErrorMonday('leer los importes de la obra')
      return
    }
    const misma = factura.obra?.id === obra.id
    dispatch({
      type: 'setFactura',
      cambios: misma
        ? { obra, cuenta, obras: [importes] }
        : { ...facturaInicial(), obra, cuenta, obras: [importes], documento: cuenta.cliente?.documento ?? '' },
    })
    dispatch({ type: 'goto', paso: 'carga' })
  }

  const continuar = () => {
    if (cargandoObra) return
    if (!vista) {
      setAviso({
        titulo: 'Falta cargar una obra',
        texto: 'Para continuar tenés que buscar y cargar una obra. Usá el buscador de arriba y volvé a intentar.',
      })
      return
    }
    /* Con la emisión empezada, la obra ya está fija: se sigue sin volver a leer. */
    if (bloqueada) {
      dispatch({ type: 'goto', paso: 'carga' })
      return
    }
    if (factura.obra && factura.obra.id !== vista.id && factura.tipo) {
      setReemplazo(vista)
      return
    }
    entrar(vista)
  }

  const ayuda = ayudaDe(b, indice.length > 0, !!vista || cargandoObra, AYUDA_SIN_OBRA)
  const siguiente = etiquetaPaso('carga', null, null, 'facturar')

  return (
    <section className="view paso-layout obras-v2 facturar-v2">
      <PasoHeader />
      <PasoTitulo titulo={etiquetaPaso('obra', null, null, 'facturar')} descripcion="Buscá y seleccioná la obra que querés facturar." />

      {sinToken && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como <strong>VITE_MONDAY_TOKEN</strong> y
          reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}
      {bloqueada && (
        <Aviso tono="info">La factura ya empezó a emitirse en el sistema: la obra no se puede cambiar en esta operación.</Aviso>
      )}

      {!bloqueada && (
        <BuscadorObras
          b={b}
          placeholder="Buscar obra por nombre"
          ayuda={ayuda}
          ayudaEnRojo={ayuda === AYUDA_SIN_OBRA}
          deshabilitado={sinToken}
          ocupado={cargandoObra}
        />
      )}
      {b.error && <Aviso tono="err">{b.error}</Aviso>}

      <ObraFichaCliente
        obra={cargandoObra ? null : vista}
        cargando={cargandoObra}
        facturacion={
          importes && vista && importes.id === vista.id
            ? { facturado: importes.facturado, pendiente: pendienteDeFacturar(importes), porcentaje: porcentajeFacturado(importes) }
            : null
        }
      />

      <div className="actions-footer">
        <span className="paso-siguiente">
          {vista && (
            <>
              <i className="fas fa-arrow-turn-up paso-siguiente-ic" /> Siguiente: {siguiente}
            </>
          )}
        </span>
        <button type="button" className="btn btn-primary" disabled={cargandoObra} onClick={continuar}>
          Continuar a {siguiente} <i className="fas fa-arrow-right" />
        </button>
      </div>

      {b.buscado && b.resultados.length > 1 && !b.abierto && !vista && !cargandoObra && (
        <button type="button" className="card obras-retomar" onClick={() => b.setAbierto(true)}>
          <i className="fas fa-list-ul" />
          <span>
            <strong>{b.resultados.length}</strong> {b.resultados.length === 1 ? 'obra encontrada' : 'obras encontradas'} para «{b.buscado}» ·
            elegí una para seguir
          </span>
          <span className="obras-retomar-x" onClick={b.limpiar}>
            Limpiar
          </span>
        </button>
      )}

      {reemplazo && (
        <Modal
          title="¿Cambiar la obra?"
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setReemplazo(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setReemplazo(null)}>
                Volver
              </button>
              <button
                type="button"
                className="btn btn-primary btn-marca"
                onClick={() => {
                  const o = reemplazo
                  setReemplazo(null)
                  entrar(o)
                }}
              >
                Aceptar
              </button>
            </>
          }
        >
          Ya tenías elegido qué facturar de <strong>{factura.obra?.nombre}</strong>. Al cambiar a <strong>{reemplazo.nombre}</strong> se
          descarta.
        </Modal>
      )}
      {aviso && (
        <AvisoModal titulo={aviso.titulo} onClose={() => setAviso(null)}>
          {aviso.texto}
        </AvisoModal>
      )}
      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
    </section>
  )
}
