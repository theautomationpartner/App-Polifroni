import { useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { BuscadorObras, ayudaDe, useBuscadorObras } from '@/features/shared/BuscadorObras'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar, type EntradaIndice } from '@/lib/busquedaObras'
import { etiquetaPaso } from '@/lib/pasos'
import {
  buscarClientes,
  getCliente,
  getElementosCliente,
  cargarIndiceClientes,
  mondayHabilitado,
  type ClienteTurno,
  type ElementosCliente,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { ClienteFicha } from './ClienteFicha'
import { ModalErrorConsulta, conTope } from './ModalErrorConsulta'

const AYUDA_SIN_CLIENTE = 'Buscá y cargá la cuenta corriente del cliente para continuar'
/** Lo que dice el buscador compartido cuando Monday no trae nada; en la Agenda se reemplaza. */
const SIN_RESULTADOS_BUSCADOR = 'Sin resultados en Monday. Probá con parte del nombre o pegá el id.'
const SIN_RESULTADOS = 'Sin resultados para la búsqueda ingresada. Probá ingresando otro nombre de cliente.'

/**
 * Crear Turno · Etapa 1: el cliente.
 *
 * El mismo buscador de la obra en Producción, sobre el índice de clientes: sugiere mientras se
 * escribe y el botón Buscar va a Monday por el cliente que la lista rápida todavía no tiene. Al
 * elegirlo se leen sus obras y sus pendientes, que son lo que la etapa 2 ofrece para el turno.
 *
 * Otro cliente que el que había descarta lo elegido después (RN-02): sus obras eran las del otro.
 */
export function CrearTurnoClienteView() {
  const dispatch = useDispatch()
  const { turno } = useApp()
  const [indice, setIndice] = useState<EntradaIndice[]>([])
  const [cliente, setCliente] = useState<ClienteTurno | null>(turno.cliente)
  const [elementos, setElementos] = useState<ElementosCliente | null>(turno.elementos)
  const [cargando, setCargando] = useState(false)
  const [noEncontrado, setNoEncontrado] = useState(false)
  const [sinCliente, setSinCliente] = useState(false)
  const [sinElementos, setSinElementos] = useState(false)
  /**
   * No se pudo consultar a Monday —token rotado, Monday caído o sin respuesta a tiempo—. Va en una
   * ventana de error, no en un renglón: no es algo que se arregle cambiando lo escrito.
   */
  const [errorMonday, setErrorMonday] = useState<string | null>(null)

  /* El índice llega de a una página: cada una ya sirve para sugerir, sin esperar a las siete. */
  useEffect(() => cargarIndiceClientes((lista) => setIndice(indexar(lista))), [])

  const abrir = async (id: string) => {
    setCargando(true)
    try {
      const c = await conTope(getCliente(id))
      if (!c) {
        setCliente(null)
        setElementos(null)
        setNoEncontrado(true)
        return
      }
      const e = await conTope(getElementosCliente(c))
      setCliente(c)
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
        /* El buscador también se entera, para dejar de esperar y no ofrecer resultados viejos. */
        throw e
      }
    },
    abrir,
    /* Sin resultados no hay ventana: lo dice el renglón gris debajo del buscador. */
    onSinResultados: () => {},
    pedidoVacio: 'Escribí el nombre del cliente o su id para buscar.',
  })
  const hayCliente = !!cliente || cargando
  const ayudaBuscador = ayudaDe(b, indice.length > 0, hayCliente, AYUDA_SIN_CLIENTE).replace(
    'No está en la lista rápida. Tocá Buscar para buscarla en Monday.',
    'No está en la lista rápida. Tocá Buscar para buscarla en Monday.',
  )
  /* Si la búsqueda falló, no es que no haya resultados: el error ya lo dice la ventana. */
  const ayuda =
    ayudaBuscador === SIN_RESULTADOS_BUSCADOR ? (b.error ? (hayCliente ? '' : AYUDA_SIN_CLIENTE) : SIN_RESULTADOS) : ayudaBuscador

  const continuar = () => {
    if (!cliente || !elementos || cargando) {
      setSinCliente(true)
      return
    }
    /* Todo turno es sobre una obra o un pendiente (RN-01): sin ninguno no hay qué agendar. */
    if (elementos.obras.length + elementos.pendientes.length === 0) {
      setSinElementos(true)
      return
    }
    const otro = turno.cliente?.id !== cliente.id
    dispatch({
      type: 'setTurno',
      cambios: otro
        ? { cliente, elementos, aberturas: null, tipo: null, elementoId: null }
        : { cliente, elementos },
    })
    dispatch({ type: 'goto', paso: 'carga' })
  }

  const total = elementos ? elementos.obras.length + elementos.pendientes.length : 0

  return (
    <section className="view paso-layout obras-v2 agenda-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Seleccionar Cliente"
        descripcion="Buscá la cuenta corriente del cliente con el que vas a agendar el turno: de ella salen sus obras y sus pendientes."
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      {turno.reprograma && (
        <Aviso tono="info">
          Reprogramando <strong>{turno.reprograma.nombre}</strong>: el turno original ya quedó cancelado.
        </Aviso>
      )}

      <BuscadorObras
        b={b}
        placeholder="Buscar cuenta corriente del cliente por nombre"
        ayuda={ayuda}
        ayudaEnRojo={ayuda === AYUDA_SIN_CLIENTE}
        deshabilitado={!mondayHabilitado()}
        ocupado={cargando}
        tituloBuscar="Buscar directamente en Monday, por si la cuenta todavía no está en la lista rápida"
      />

      <ClienteFicha cliente={cargando ? null : cliente} elementos={elementos} cargando={cargando} />

      <div className="actions-footer">
        <span className="paso-siguiente">
          {cliente && elementos && !cargando ? (
            <>
              <i className="fas fa-calendar-days paso-siguiente-ic" />{' '}
              {total === 0
                ? 'El cliente no tiene obras ni pendientes de entrega'
                : `${elementos.obras.length} ${elementos.obras.length === 1 ? 'obra' : 'obras'} y ${elementos.pendientes.length} ${
                    elementos.pendientes.length === 1 ? 'pendiente' : 'pendientes'
                  } de entrega`}
            </>
          ) : null}
        </span>
        <button type="button" className="btn btn-primary" disabled={cargando} onClick={continuar}>
          Continuar a {etiquetaPaso('carga', null, null, 'crearTurno')} <i className="fas fa-arrow-right" />
        </button>
      </div>

      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
      {sinCliente && (
        <AvisoModal titulo="Falta cargar un cliente" onClose={() => setSinCliente(false)}>
          Para continuar tenés que buscar y cargar un cliente. Usá el buscador de arriba y volvé a intentar.
        </AvisoModal>
      )}
      {sinElementos && cliente && (
        <AvisoModal titulo="El cliente no tiene obras ni pendientes" onClose={() => setSinElementos(false)}>
          Un turno se agenda sobre una obra o un pendiente de entrega, y <strong>{cliente.nombre}</strong> no tiene
          ninguno vinculado a sus cuentas corrientes.
        </AvisoModal>
      )}
      {noEncontrado && (
        <AvisoModal titulo="Cuenta corriente no encontrada" onClose={() => setNoEncontrado(false)}>
          La cuenta que buscaste no está en el tablero de Cuentas Corrientes Cliente. Probá con parte del nombre o pegá el
          id del ítem.
        </AvisoModal>
      )}
    </section>
  )
}
