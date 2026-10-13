import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { ModalErrorConsulta, conTope } from '@/features/agenda/ModalErrorConsulta'
import { BuscadorObras, ayudaDe, useBuscadorObras, type ObraEncontrada } from '@/features/shared/BuscadorObras'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar } from '@/lib/busquedaObras'
import { etiquetaPaso } from '@/lib/pasos'
import {
  buscarContactos,
  cargarIndiceContactos,
  getContacto,
  leerBolsa,
  listarBolsasAbiertas,
  mondayHabilitado,
  ETIQUETA_PRES,
  type BolsaPresupuesto,
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

  /* Los dos índices llegan de a una página: cada una ya sirve para sugerir. */
  useEffect(() => {
    const dejar = (['Cliente', 'Constructor'] as const).map((t) =>
      cargarIndiceContactos(t, (lista) => setListas((l) => ({ ...l, [t]: lista }))),
    )
    return () => dejar.forEach((f) => f())
  }, [])

  const marcar = (t: TipoContacto) => (c: { id: string; nombre: string }) => {
    tipos.current.set(c.id, t)
    return { ...c, etiqueta: { texto: TIPO[t].etiqueta, color: TIPO[t].color } }
  }

  const indice = useMemo(
    () => indexar([...listas.Cliente.map(marcar('Cliente')), ...listas.Constructor.map(marcar('Constructor'))]),
    [listas],
  )

  /**
   * Cargar sobre uno existente: UN solo contacto, cliente o constructor —el que se buscó—. Elegir otro
   * (de cualquiera de los dos tipos) lo reemplaza.
   */
  const unico = presupuesto.modo === 'cargar'
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
        /* Cargar sobre uno existente: otro contacto tiene otros presupuestos abiertos. */
        ...(presupuesto.modo === 'cargar' ? { bolsa: null } : {}),
      },
    })

  const abrir = async (id: string) => {
    let tipo = tipos.current.get(id) ?? null
    setLeyendo(tipo ?? 'buscando')
    try {
      let c: Contacto | null = null
      if (tipo) c = await conTope(getContacto(tipo, id))
      else {
        /* Un id pegado que no está en los índices: se prueba en los dos tableros. */
        for (const t of ['Cliente', 'Constructor'] as const) {
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
    pedidoVacio: 'Escribí el nombre del cliente o del constructor/arquitecto para buscar.',
  })
  const listo = listas.Cliente.length > 0 || listas.Constructor.length > 0
  const ayudaBuscador = ayudaDe(b, listo, true, '')
  const ayuda = ayudaBuscador === SIN_RESULTADOS_BUSCADOR ? (b.error ? '' : SIN_RESULTADOS) : ayudaBuscador

  return (
    <>
      <BuscadorObras
        b={b}
        placeholder="Buscar cliente o constructor/arquitecto por nombre"
        ayuda={ayuda}
        ayudaEnRojo={false}
        deshabilitado={!mondayHabilitado()}
        ocupado={leyendo !== null}
        tituloBuscar="Buscar directamente en Monday, en Clientes y en Constructor/Arquitecto"
        renderFila={(f) => <FilaContacto f={f} />}
      />
      {unico ? (
        <ContactoUnicoFicha
          cliente={presupuesto.cliente}
          arquitecto={presupuesto.arquitecto}
          leyendo={leyendo === 'Cliente' || leyendo === 'Constructor' ? leyendo : null}
          onQuitar={(t) => asignar(t, null)}
        />
      ) : (
        <ContactosFichas
          cliente={presupuesto.cliente}
          arquitecto={presupuesto.arquitecto}
          leyendo={leyendo === 'Cliente' || leyendo === 'Constructor' ? leyendo : null}
          onQuitar={(t) => asignar(t, null)}
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
          Lo que buscaste no está en el tablero de Clientes ni en el de Constructor/Arquitecto. Probá con parte del nombre o
          pegá el id del ítem.
        </AvisoModal>
      )}
    </>
  )
}

/** Cómo se nombra una bolsa en el selector: su nombre, su ID y cuántos presupuestos tiene. */
const rotuloBolsa = (b: BolsaPresupuesto) =>
  `${b.nombre}${b.idPresupuesto ? ` · ${b.idPresupuesto}` : ''} · ${b.presupuestos.length} ${
    b.presupuestos.length === 1 ? 'presupuesto' : 'presupuestos'
  }`

/**
 * Cargar otro presupuesto sobre uno ya existente: con el cliente y/o el constructor elegidos arriba
 * (el mismo buscador de "Crear nuevo presupuesto"), sus presupuestos abiertos —en "Solicitud de
 * Presupuesto"—. Si tiene uno, se toma solo; si tiene varios, se elige sobre cuál; si no tiene
 * ninguno, se dice. La bolsa no se muestra en una ficha aparte: sólo la card del contacto (regla del
 * usuario, 09/10/2026).
 */
function BolsasDelContacto({ onError }: { onError: (accion: string) => void }) {
  const uid = useId()
  const { presupuesto } = useApp()
  const dispatch = useDispatch()
  const { cliente, arquitecto, bolsa } = presupuesto
  const [bolsas, setBolsas] = useState<BolsaPresupuesto[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [cerrada, setCerrada] = useState<string | null>(null)

  /* Las abiertas son pocas: se leen todas una vez y se filtran por el contacto elegido. */
  useEffect(() => {
    let vivo = true
    conTope(listarBolsasAbiertas())
      .then((l) => vivo && setBolsas(l))
      .catch(() => {
        if (!vivo) return
        setBolsas([])
        onError('leer los presupuestos abiertos')
      })
    return () => {
      vivo = false
    }
    // Una sola lectura al entrar: el aviso de error no la vuelve a disparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hayContacto = !!(cliente || arquitecto)
  const delContacto = useMemo(
    () =>
      (bolsas ?? []).filter(
        (b) => (!!cliente && b.cliente?.id === cliente.id) || (!!arquitecto && b.arquitecto?.id === arquitecto.id),
      ),
    [bolsas, cliente, arquitecto],
  )

  /* Se relee la bolsa elegida: puede haber cambiado de estado desde que se listó, y trae sus
     presupuestos enviados al día. */
  const elegir = async (id: string) => {
    setCargando(true)
    try {
      const b = await conTope(leerBolsa(id))
      if (!b || b.estado !== ETIQUETA_PRES.solicitud) {
        setCerrada(b?.nombre ?? 'El presupuesto')
        setBolsas((l) => (l ?? []).filter((x) => x.id !== id))
        return
      }
      dispatch({ type: 'setPresupuesto', cambios: { bolsa: b, envio: null } })
    } catch {
      onError('leer el presupuesto')
    } finally {
      setCargando(false)
    }
  }

  /* Con UN presupuesto abierto no hay nada que elegir: se toma solo. */
  const unico = delContacto.length === 1 ? delContacto[0].id : null
  useEffect(() => {
    if (unico && bolsa?.id !== unico && !cargando) void elegir(unico)
    // Sólo cuando cambia cuál es el único.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unico])

  if (!hayContacto) return null

  return (
    <>
      {bolsas === null ? (
        <Aviso tono="info">
          Leyendo los presupuestos abiertos…
        </Aviso>
      ) : delContacto.length === 0 ? (
        <Aviso tono="err">
          {[cliente?.nombre, arquitecto?.nombre].filter(Boolean).join(' y ')} no{' '}
          {cliente && arquitecto ? 'tienen' : 'tiene'} presupuestos abiertos («Solicitud de Presupuesto»). Elegí otro
          contacto o creá un presupuesto nuevo.
        </Aviso>
      ) : (
        delContacto.length > 1 && (
          /* `carga-grid`: el desplegable en bordó, como en la carga. */
          <div className="card carga-datos carga-grid pres-elegir-bolsa">
            <label className="med-l" htmlFor={`${uid}-bolsa`}>
              ¿Sobre qué presupuesto vas a cargar? *
            </label>
            <SelectBuscable
              id={`${uid}-bolsa`}
              valor={bolsa?.id ?? ''}
              opciones={delContacto.map((b) => ({ valor: b.id, texto: rotuloBolsa(b) }))}
              placeholder={`Tiene ${delContacto.length} presupuestos abiertos: elegí uno`}
              cargando={cargando}
              textoCargando="Leyendo el presupuesto…"
              onElegir={(id) => void elegir(id)}
            />
          </div>
        )
      )}
      {cerrada && (
        <AvisoModal titulo="El presupuesto ya no está abierto" onClose={() => setCerrada(null)}>
          <strong>{cerrada}</strong> ya no está en «Solicitud de Presupuesto»: no se le pueden cargar más presupuestos.
          Elegí otro o creá uno nuevo.
        </AvisoModal>
      )}
    </>
  )
}

/**
 * Crear y Cargar Presupuestos · Etapa 1: a quién es el presupuesto.
 *
 * Arriba, qué se va a hacer: crear un presupuesto nuevo o cargar otro sobre uno ya existente. En los
 * dos se elige el cliente y/o el constructor (no todos los presupuestos llevan constructor); al cargar
 * sobre uno existente, además, cuál de sus presupuestos abiertos (ver `BolsasDelContacto`).
 */
export function PresupuestoDestinatarioView() {
  const dispatch = useDispatch()
  const { presupuesto } = useApp()
  const { modo } = presupuesto
  const [errorMonday, setErrorMonday] = useState<string | null>(null)
  const [falta, setFalta] = useState<'modo' | 'destinatario' | null>(null)

  const continuar = () => {
    if (!modo) {
      setFalta('modo')
      return
    }
    if (!conDestinatario(presupuesto)) {
      setFalta('destinatario')
      return
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
            ? 'Buscá el cliente o el constructor/arquitecto: se toma su presupuesto abierto para cargarle otro.'
            : 'Elegí a quién es el presupuesto: un cliente, un constructor/arquitecto o los dos.'
        }
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      {/* Los dos modos eligen el cliente y/o el constructor con el mismo buscador; al cargar sobre uno
          existente, además, sobre cuál de sus presupuestos abiertos. */}
      {modo && <BuscadorContactos onError={setErrorMonday} />}

      {modo === 'cargar' && <BolsasDelContacto onError={setErrorMonday} />}

      <div className="actions-footer">
        <span className="paso-siguiente">
          {modo === 'crear' && conDestinatario(presupuesto) && (
            <>
              <i className="fas fa-file-invoice-dollar paso-siguiente-ic" /> Presupuesto para{' '}
              {[presupuesto.cliente?.nombre, presupuesto.arquitecto?.nombre].filter(Boolean).join(' y ')}
            </>
          )}
          {modo === 'cargar' && presupuesto.bolsa && (
            <>
              <i className="fas fa-file-invoice-dollar paso-siguiente-ic" /> {presupuesto.bolsa.presupuestos.length}{' '}
              {presupuesto.bolsa.presupuestos.length === 1 ? 'presupuesto cargado' : 'presupuestos cargados'}
            </>
          )}
        </span>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {etiquetaPaso('carga', null, null, 'presupuestos', modo)} <i className="fas fa-arrow-right" />
        </button>
      </div>

      {errorMonday && <ModalErrorConsulta accion={errorMonday} onClose={() => setErrorMonday(null)} />}
      {falta === 'modo' && (
        <AvisoModal titulo="Falta elegir qué vas a hacer" onClose={() => setFalta(null)}>
          Elegí si vas a crear un presupuesto nuevo o cargar otro presupuesto en uno abierto.
        </AvisoModal>
      )}
      {falta === 'destinatario' && (
        <AvisoModal
          titulo={modo === 'cargar' ? 'Falta elegir el presupuesto' : 'Falta elegir a quién es el presupuesto'}
          onClose={() => setFalta(null)}
        >
          {modo === 'cargar'
            ? 'Buscá y cargá el presupuesto abierto al que le vas a sumar otro presupuesto.'
            : 'Buscá y cargá un cliente, un constructor/arquitecto o los dos. Al menos uno es obligatorio.'}
        </AvisoModal>
      )}
    </section>
  )
}
