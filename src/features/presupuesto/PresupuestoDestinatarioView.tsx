import { useEffect, useMemo, useRef, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { ModalErrorConsulta, conTope } from '@/features/agenda/ModalErrorConsulta'
import { BuscadorObras, ayudaDe, useBuscadorObras, type ObraEncontrada } from '@/features/shared/BuscadorObras'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar } from '@/lib/busquedaObras'
import { etiquetaPaso } from '@/lib/pasos'
import { bolsaParaCargar } from '@/lib/presupuesto'
import {
  bolsasDeContacto,
  buscarContactos,
  cargarIndiceContactos,
  getContacto,
  mondayHabilitado,
  type Contacto,
  type TipoContacto,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { conDestinatario } from './borrador'
import { ContactoUnicoFicha, ContactosFichas } from './Fichas'
import { ModoSelect } from './ModoSelect'

/** Lo que dice el buscador compartido cuando Monday no trae nada; acá se reemplaza por uno propio. */
const SIN_RESULTADOS_BUSCADOR = 'Sin resultados en Monday. Probá con parte del nombre o pegá el id.'

/** Cómo se nombra y se pinta cada tipo de contacto: la pastilla del resultado y la ventana de reemplazo. */
const TIPO: Record<TipoContacto, { etiqueta: string; color: string; articulo: string }> = {
  Cliente: { etiqueta: 'Cliente', color: '#89263c', articulo: 'un cliente' },
  Constructor: { etiqueta: 'Constructor/Arquitecto', color: '#575ce5', articulo: 'un constructor/arquitecto' },
}

const SIN_RESULTADOS = 'Sin resultados para la búsqueda ingresada. Probá con otro nombre de cliente o de constructor/arquitecto.'
const SIN_RESULTADOS_CLIENTE = 'Sin resultados para la búsqueda ingresada. Probá con otro nombre de cliente.'

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
 *
 * Cargar otro presupuesto: busca SÓLO clientes (regla del usuario, 13/10/2026), en una sola card.
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

  /** Cargar sobre uno existente: UN solo contacto, y sólo cliente. */
  const unico = presupuesto.modo === 'cargar'
  const tiposBusqueda: TipoContacto[] = unico ? ['Cliente'] : ['Cliente', 'Constructor']

  /* Los índices llegan de a una página: cada una ya sirve para sugerir. */
  useEffect(() => {
    const dejar = tiposBusqueda.map((t) => cargarIndiceContactos(t, (lista) => setListas((l) => ({ ...l, [t]: lista }))))
    return () => dejar.forEach((f) => f())
    // Sólo cuando cambia el modo (y con él, qué se busca).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unico])

  const marcar = (t: TipoContacto) => (c: { id: string; nombre: string }) => {
    tipos.current.set(c.id, t)
    return { ...c, etiqueta: { texto: TIPO[t].etiqueta, color: TIPO[t].color } }
  }

  const indice = useMemo(
    () => indexar([...listas.Cliente.map(marcar('Cliente')), ...(unico ? [] : listas.Constructor.map(marcar('Constructor')))]),
    [listas, unico],
  )

  const actual = (t: TipoContacto) =>
    unico ? (presupuesto.cliente ?? presupuesto.arquitecto) : t === 'Cliente' ? presupuesto.cliente : presupuesto.arquitecto
  /** De qué tipo es el contacto que hay (para nombrarlo al preguntar si se reemplaza). */
  const tipoActual = (t: TipoContacto): TipoContacto => (unico ? (presupuesto.cliente ? 'Cliente' : 'Constructor') : t)

  /**
   * Deja (o saca) el contacto de su card. Otro cliente u otro constructor cambia a quién se manda: el
   * envío que hubiera salido ya no vale.
   */
  const asignar = (t: TipoContacto, c: Contacto | null) =>
    dispatch({
      type: 'setPresupuesto',
      cambios: {
        ...(t === 'Cliente' ? { cliente: c } : { arquitecto: c }),
        /* Con un solo contacto, el del otro tipo se va. */
        ...(unico && c ? (t === 'Cliente' ? { arquitecto: null } : { cliente: null }) : {}),
        envio: null,
        /* Cargar sobre uno existente: otro cliente tiene otros presupuestos. */
        ...(presupuesto.modo === 'cargar' ? { bolsa: null, enviados: [] } : {}),
      },
    })

  /** Se editó el contacto desde su card (ya quedó en Monday): la card y el envío siguen con lo nuevo. */
  const editado = (t: TipoContacto, c: Contacto) =>
    dispatch({ type: 'setPresupuesto', cambios: t === 'Cliente' ? { cliente: c } : { arquitecto: c } })

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
          unico ? Promise.resolve([]) : conTope(buscarContactos('Constructor', texto)),
        ])
        return [...clientes.map(marcar('Cliente')), ...constructores.map(marcar('Constructor'))]
      } catch (e) {
        onError(unico ? 'buscar el cliente' : 'buscar el cliente o el constructor/arquitecto')
        throw e
      }
    },
    abrir,
    onSinResultados: () => {},
    pedidoVacio: unico ? 'Escribí el nombre del cliente para buscar.' : 'Escribí el nombre del cliente o del constructor/arquitecto para buscar.',
  })
  const listo = listas.Cliente.length > 0 || (!unico && listas.Constructor.length > 0)
  const ayudaBuscador = ayudaDe(b, listo, true, '')
  const ayuda =
    ayudaBuscador === SIN_RESULTADOS_BUSCADOR ? (b.error ? '' : unico ? SIN_RESULTADOS_CLIENTE : SIN_RESULTADOS) : ayudaBuscador

  return (
    <>
      <BuscadorObras
        b={b}
        placeholder={unico ? 'Buscar cliente por nombre' : 'Buscar cliente o constructor/arquitecto por nombre'}
        ayuda={ayuda}
        ayudaEnRojo={false}
        deshabilitado={!mondayHabilitado()}
        ocupado={leyendo !== null}
        tituloBuscar={unico ? 'Buscar directamente en Monday, en Clientes' : 'Buscar directamente en Monday, en Clientes y en Constructor/Arquitecto'}
        renderFila={(f) => <FilaContacto f={f} />}
      />
      {unico ? (
        <ContactoUnicoFicha
          cliente={presupuesto.cliente}
          leyendo={leyendo !== null}
          onQuitar={() => asignar('Cliente', null)}
          onGuardado={(c) => editado('Cliente', c)}
        />
      ) : (
        <ContactosFichas
          cliente={presupuesto.cliente}
          arquitecto={presupuesto.arquitecto}
          leyendo={leyendo === 'Cliente' || leyendo === 'Constructor' ? leyendo : null}
          onQuitar={(t) => asignar(t, null)}
          onGuardado={editado}
        />
      )}

      {reemplazo && (
        <Modal
          title={`¿Reemplazar ${tipoActual(reemplazo.tipo) === 'Cliente' ? 'el cliente' : 'el constructor/arquitecto'}?`}
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
          Ya tenías {TIPO[tipoActual(reemplazo.tipo)].articulo} seleccionado: <strong>{actual(reemplazo.tipo)?.nombre}</strong>. ¿Querés
          reemplazarlo por <strong>{reemplazo.nuevo.nombre}</strong>?
        </Modal>
      )}
      {noEncontrado && (
        <AvisoModal titulo="No se encontró" onClose={() => setNoEncontrado(false)}>
          {unico
            ? 'Lo que buscaste no está en el tablero de Clientes. Probá con parte del nombre o pegá el id del ítem.'
            : 'Lo que buscaste no está en el tablero de Clientes ni en el de Constructor/Arquitecto. Probá con parte del nombre o pegá el id del ítem.'}
        </AvisoModal>
      )}
    </>
  )
}

/**
 * Crear y Cargar Presupuestos · Etapa 1: a quién es el presupuesto.
 *
 * Arriba, qué se va a hacer: crear un presupuesto nuevo o cargar otro sobre uno ya existente. Al crear
 * se elige el cliente y/o el constructor (no todos los presupuestos llevan constructor). Al cargar
 * sobre uno existente se elige SÓLO el cliente; sus presupuestos se buscan al continuar: los de sus
 * bolsas que no están Ganadas ni Perdidas (ver `bolsaParaCargar`). Sin ninguna, se avisa y no se avanza.
 */
export function PresupuestoDestinatarioView() {
  const dispatch = useDispatch()
  const { presupuesto } = useApp()
  const { modo } = presupuesto
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  const [falta, setFalta] = useState<'modo' | 'destinatario' | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [sinPresupuestos, setSinPresupuestos] = useState<string | null>(null)

  const continuar = async () => {
    if (buscando) return
    if (!modo) {
      setFalta('modo')
      return
    }
    if (!conDestinatario(presupuesto)) {
      setFalta('destinatario')
      return
    }
    if (modo === 'cargar' && presupuesto.cliente) {
      /* Los presupuestos del cliente se buscan recién ahora, al día: puede haber cambiado alguno. */
      setBuscando(true)
      try {
        const r = bolsaParaCargar(await conTope(bolsasDeContacto('Cliente', presupuesto.cliente.id)))
        if (!r) {
          setSinPresupuestos(presupuesto.cliente.nombre)
          return
        }
        dispatch({ type: 'setPresupuesto', cambios: { bolsa: r.bolsa, enviados: r.enviados, envio: null } })
      } catch {
        setErrorMonday('buscar los presupuestos del cliente')
        return
      } finally {
        setBuscando(false)
      }
    }
    dispatch({ type: 'goto', paso: 'carga' })
  }

  return (
    <section className="view paso-layout obras-v2 presupuesto-v2">
      <PasoHeader />

      {/* La pregunta que decide el recorrido va ANTES del título de la etapa, como «¿A quién vas a
          enviarle la orden?» en Producción: de ella depende qué se elige abajo. */}
      <ModoSelect falta={falta === 'modo' && !modo} />

      <PasoTitulo
        titulo={etiquetaPaso('obra', null, null, 'presupuestos', modo)}
        descripcion={
          modo === 'cargar'
            ? 'Buscá el cliente: al continuar se buscan sus presupuestos ya enviados para cargarle otro.'
            : 'Elegí a quién es el presupuesto: un cliente, un constructor/arquitecto o los dos.'
        }
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      {/* Los dos modos usan el mismo buscador; al cargar sobre uno existente, sólo de clientes. */}
      {modo && <BuscadorContactos key={modo} onError={setErrorMonday} />}

      <div className="actions-footer">
        <span className="paso-siguiente">
          {modo === 'crear' && conDestinatario(presupuesto) && (
            <>
              <i className="fas fa-file-invoice-dollar paso-siguiente-ic" /> Presupuesto para{' '}
              {[presupuesto.cliente?.nombre, presupuesto.arquitecto?.nombre].filter(Boolean).join(' y ')}
            </>
          )}
          {modo === 'cargar' && presupuesto.cliente && (
            <>
              <i className="fas fa-file-invoice-dollar paso-siguiente-ic" /> Presupuestos de {presupuesto.cliente.nombre}
            </>
          )}
        </span>
        <button type="button" className="btn btn-primary" disabled={buscando} onClick={() => void continuar()}>
          Continuar a {etiquetaPaso('carga', null, null, 'presupuestos', modo)} <i className="fas fa-arrow-right" />
        </button>
      </div>

      {buscando && (
        <ModalCargando titulo="Buscando los presupuestos del cliente..." detalle="Se leen sus presupuestos ya enviados. Esperá unos segundos." />
      )}
      {sinPresupuestos && (
        <AvisoModal titulo="El cliente no tiene presupuestos para cargar" onClose={() => setSinPresupuestos(null)}>
          <strong>{sinPresupuestos}</strong> no tiene presupuestos cargados (o los que tiene ya están Ganados o Perdidos). Para
          enviarle uno, elegí «Crear nuevo presupuesto».
        </AvisoModal>
      )}
      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
      {falta === 'modo' && (
        <AvisoModal titulo="Falta elegir qué vas a hacer" onClose={() => setFalta(null)}>
          Elegí si vas a crear un presupuesto nuevo o cargar otro presupuesto en uno abierto.
        </AvisoModal>
      )}
      {falta === 'destinatario' && (
        <AvisoModal
          titulo={modo === 'cargar' ? 'Falta elegir el cliente' : 'Falta elegir a quién es el presupuesto'}
          onClose={() => setFalta(null)}
        >
          {modo === 'cargar'
            ? 'Buscá y cargá el cliente al que le vas a sumar otro presupuesto.'
            : 'Buscá y cargá un cliente, un constructor/arquitecto o los dos. Al menos uno es obligatorio.'}
        </AvisoModal>
      )}
    </section>
  )
}
