import { useEffect, useMemo, useRef, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { ModalErrorConsulta, conTope } from '@/features/agenda/ModalErrorConsulta'
import { BuscadorObras, ayudaDe, useBuscadorObras, type ObraEncontrada } from '@/features/shared/BuscadorObras'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar } from '@/lib/busquedaObras'
import { etiquetaPaso } from '@/lib/pasos'
import {
  buscarContactos,
  cargarIndiceContactos,
  getContacto,
  mondayHabilitado,
  type Contacto,
  type TipoContacto,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { conDestinatario } from './borrador'
import { ContactosFichas } from './Fichas'
import { ModalAltaContacto } from './ModalAltaContacto'

/** Lo que dice el buscador compartido cuando Monday no trae nada; acá se reemplaza por uno propio. */
const SIN_RESULTADOS_BUSCADOR = 'Sin resultados en Monday. Probá con parte del nombre o pegá el id.'

/** Cómo se nombra y se pinta cada tipo de contacto: la pastilla del resultado y la ventana de reemplazo. */
const TIPO: Record<TipoContacto, { etiqueta: string; color: string; articulo: string }> = {
  Cliente: { etiqueta: 'Cliente', color: '#89263c', articulo: 'un cliente' },
  Constructor: { etiqueta: 'Constructor/Arquitecto', color: '#575ce5', articulo: 'un constructor/arquitecto' },
}

const SIN_RESULTADOS =
  'Sin resultados para la búsqueda ingresada. Probá con otro nombre o CUIT, o tocá «+ Alta nueva» para cargarlo.'

/** Una fila del desplegable: el nombre, la pastilla de lo que es (la misma `op-estado` de los estados) y el id. */
function FilaContacto({ f }: { f: ObraEncontrada }) {
  return (
    <>
      <span className="ritem-main pres-ritem">
        <span className="ritem-name">{f.nombre}</span>
        {f.etiqueta && (
          <span className="op-estado op-estado--sm" style={{ ['--op-c' as string]: f.etiqueta.color }}>
            {f.etiqueta.texto}
          </span>
        )}
      </span>
      <span className="ritem-code">{f.id}</span>
    </>
  )
}

/**
 * Crear: UN buscador para el cliente y el constructor/arquitecto. Es el mismo buscador de la obra en
 * Producción, sobre los dos índices juntos: mientras se escribe sugiere de los dos tableros, cada
 * resultado con su pastilla («Cliente» o «Constructor/Arquitecto»), y el botón Buscar va a Monday a
 * los dos. Lo elegido va a su card: el cliente a la del cliente, el constructor a la suya.
 *
 * Si ya había un cliente (o un constructor) elegido y se elige otro, se pregunta antes de reemplazarlo.
 */
function BuscadorContactos({ onError }: { onError: (accion: string) => void }) {
  const { presupuesto } = useApp()
  const dispatch = useDispatch()
  const [listas, setListas] = useState<Record<TipoContacto, { id: string; nombre: string }[]>>({ Cliente: [], Constructor: [] })
  /** De qué tablero es cada id que se vio (en el índice o en una búsqueda): decide a qué card va. */
  const tipos = useRef(new Map<string, TipoContacto>())
  /** Se está leyendo el elegido: el tipo, si se sabe (para el esqueleto de su card). */
  const [leyendo, setLeyendo] = useState<TipoContacto | 'buscando' | null>(null)
  const [noEncontrado, setNoEncontrado] = useState(false)
  /** Se eligió otro con la card ya ocupada: se pregunta antes de reemplazar. */
  const [reemplazo, setReemplazo] = useState<{ tipo: TipoContacto; nuevo: Contacto } | null>(null)
  /** El alta nueva está abierta (la búsqueda no encontró nada): con el CUIT buscado, si lo era. */
  const [alta, setAlta] = useState<{ cuit: string } | null>(null)

  const tiposBusqueda: TipoContacto[] = ['Cliente', 'Constructor']

  /* Los índices llegan de a una página: cada una ya sirve para sugerir. */
  useEffect(() => {
    const dejar = tiposBusqueda.map((t) => cargarIndiceContactos(t, (lista) => setListas((l) => ({ ...l, [t]: lista }))))
    return () => dejar.forEach((f) => f())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const marcar = (t: TipoContacto) => (c: { id: string; nombre: string }) => {
    tipos.current.set(c.id, t)
    return { ...c, etiqueta: { texto: TIPO[t].etiqueta, color: TIPO[t].color } }
  }

  const indice = useMemo(
    () => indexar([...listas.Cliente.map(marcar('Cliente')), ...listas.Constructor.map(marcar('Constructor'))]),
    [listas],
  )

  const actual = (t: TipoContacto) => (t === 'Cliente' ? presupuesto.cliente : presupuesto.arquitecto)

  /**
   * Deja (o saca) el contacto de su card. Otro cliente u otro constructor cambia a quién se manda: el
   * envío que hubiera salido ya no vale.
   */
  const asignar = (t: TipoContacto, c: Contacto | null) =>
    dispatch({
      type: 'setPresupuesto',
      cambios: {
        ...(t === 'Cliente' ? { cliente: c } : { arquitecto: c }),
        envio: null,
      },
    })

  /** Se editó el contacto desde su card (ya quedó en Monday): la card y el envío siguen con lo nuevo. */
  const editado = (t: TipoContacto, c: Contacto) =>
    dispatch({ type: 'setPresupuesto', cambios: t === 'Cliente' ? { cliente: c } : { arquitecto: c } })

  /**
   * Se dio de alta: el contacto ya está en Monday y va directo a su card (sin releerlo ni volver a
   * buscarlo). Se cierra el alta y se limpia el buscador, que no arrastra lo buscado a la próxima vez.
   */
  const creado = (t: TipoContacto, c: Contacto) => {
    asignar(t, c)
    setAlta(null)
    b.limpiar()
  }

  const abrir = async (id: string) => {
    let tipo = tipos.current.get(id) ?? null
    setLeyendo(tipo ?? 'buscando')
    try {
      let c: Contacto | null = null
      if (tipo) c = await conTope(getContacto(tipo, id))
      else {
        /* Un id pegado que no está en los índices: se prueba en los tableros que se buscan. */
        for (const t of tiposBusqueda) {
          c = await conTope(getContacto(t, id))
          if (c) {
            tipo = t
            break
          }
        }
      }
      if (!c || !tipo) {
        setNoEncontrado(true)
        return
      }
      const previo = actual(tipo)
      if (previo && previo.id !== c.id) setReemplazo({ tipo, nuevo: c })
      else asignar(tipo, c)
      b.limpiar()
    } catch {
      onError('leer los datos del contacto')
    } finally {
      setLeyendo(null)
    }
  }

  const b = useBuscadorObras({
    indice,
    buscarRemoto: async (texto) => {
      try {
        const [clientes, constructores] = await Promise.all([
          conTope(buscarContactos('Cliente', texto)),
          conTope(buscarContactos('Constructor', texto)),
        ])
        return [...clientes.map(marcar('Cliente')), ...constructores.map(marcar('Constructor'))]
      } catch (e) {
        onError('buscar el cliente o el constructor/arquitecto')
        throw e
      }
    },
    abrir,
    onSinResultados: () => {},
    pedidoVacio: 'Escribí el nombre o el CUIT del cliente o del constructor/arquitecto para buscar.',
  })
  const listo = listas.Cliente.length > 0 || listas.Constructor.length > 0
  const ayudaBuscador = ayudaDe(b, listo, true, '')
  const ayuda =
    ayudaBuscador === SIN_RESULTADOS_BUSCADOR ? (b.error ? '' : SIN_RESULTADOS) : ayudaBuscador

  return (
    <>
      <BuscadorObras
        b={b}
        placeholder="Buscar cliente o constructor/arquitecto por nombre o CUIT"
        ayuda={ayuda}
        ayudaEnRojo={false}
        deshabilitado={!mondayHabilitado()}
        ocupado={leyendo !== null}
        tituloBuscar="Buscar directamente en Monday, en Clientes y en Constructor/Arquitecto"
        altaNueva={() => setAlta({ cuit: /^[\d.\-\s]+$/.test(b.termino.trim()) ? b.termino : '' })}
        renderFila={(f) => <FilaContacto f={f} />}
      />
      <ContactosFichas
        cliente={presupuesto.cliente}
        arquitecto={presupuesto.arquitecto}
        leyendo={leyendo === 'Cliente' || leyendo === 'Constructor' ? leyendo : null}
        onQuitar={(t) => asignar(t, null)}
        onGuardado={editado}
      />

      {reemplazo && (
        <Modal
          title={`¿Reemplazar ${reemplazo.tipo === 'Cliente' ? 'el cliente' : 'el constructor/arquitecto'}?`}
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setReemplazo(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setReemplazo(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-marca"
                onClick={() => {
                  asignar(reemplazo.tipo, reemplazo.nuevo)
                  setReemplazo(null)
                }}
              >
                Aceptar
              </button>
            </>
          }
        >
          Ya tenías {TIPO[reemplazo.tipo].articulo} seleccionado: <strong>{actual(reemplazo.tipo)?.nombre}</strong>. ¿Querés
          reemplazarlo por <strong>{reemplazo.nuevo.nombre}</strong>?
        </Modal>
      )}
      {alta && (
        <ModalAltaContacto
          cuitInicial={alta.cuit}
          onVolver={() => {
            setAlta(null)
            b.limpiar()
          }}
          onCreado={creado}
        />
      )}
      {noEncontrado && (
        <AvisoModal titulo="No se encontró" onClose={() => setNoEncontrado(false)}>
          Lo que buscaste no está en el tablero de Clientes ni en el de Constructor/Arquitecto. Probá con parte del nombre o pegá el id
          del ítem.
        </AvisoModal>
      )}
    </>
  )
}

/**
 * Crear y Cargar Presupuestos · Etapa 1: a quién es el presupuesto. Sólo crea presupuestos nuevos
 * (regla del usuario, 15/10/2026): se elige el cliente y/o el constructor (no todos los presupuestos
 * llevan constructor). Otro presupuesto para uno existente se carga desde la consulta («+Nuevo»).
 */
export function PresupuestoDestinatarioView() {
  const dispatch = useDispatch()
  const { presupuesto } = useApp()
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  const [falta, setFalta] = useState(false)

  const continuar = () => {
    if (!conDestinatario(presupuesto)) {
      setFalta(true)
      return
    }
    dispatch({ type: 'goto', paso: 'carga' })
  }

  return (
    <section className="view paso-layout obras-v2 presupuesto-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('obra', null, null, 'presupuestos')}
        descripcion="Elegí a quién es el presupuesto: un cliente, un constructor/arquitecto o los dos."
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      <BuscadorContactos onError={setErrorMonday} />

      <div className="actions-footer">
        <span className="paso-siguiente">
          {conDestinatario(presupuesto) && (
            <>
              <i className="fas fa-file-invoice-dollar paso-siguiente-ic" /> Presupuesto para{' '}
              {[presupuesto.cliente?.nombre, presupuesto.arquitecto?.nombre].filter(Boolean).join(' y ')}
            </>
          )}
        </span>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {etiquetaPaso('carga', null, null, 'presupuestos')} <i className="fas fa-arrow-right" />
        </button>
      </div>

      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
      {falta && (
        <AvisoModal titulo="Falta elegir a quién es el presupuesto" onClose={() => setFalta(false)}>
          Buscá y cargá un cliente, un constructor/arquitecto o los dos. Al menos uno es obligatorio.
        </AvisoModal>
      )}
    </section>
  )
}
