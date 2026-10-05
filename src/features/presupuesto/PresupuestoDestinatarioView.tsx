import { useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { ModalErrorConsulta, conTope } from '@/features/agenda/ModalErrorConsulta'
import { BuscadorObras, ayudaDe, useBuscadorObras } from '@/features/shared/BuscadorObras'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar, type EntradaIndice } from '@/lib/busquedaObras'
import { etiquetaPaso } from '@/lib/pasos'
import { normalizar } from '@/lib/texto'
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
import { BolsaFicha, ContactoFicha } from './Fichas'
import { ModoSelect } from './ModoSelect'

/** Lo que dice el buscador compartido cuando Monday no trae nada; acá se reemplaza por uno propio. */
const SIN_RESULTADOS_BUSCADOR = 'Sin resultados en Monday. Probá con parte del nombre o pegá el id.'

const TEXTOS: Record<TipoContacto, { titulo: string; placeholder: string; vacio: string; sinResultados: string; tituloBuscar: string }> = {
  Cliente: {
    titulo: 'Cliente',
    placeholder: 'Buscar cliente por nombre',
    vacio: 'Escribí el nombre del cliente o su id para buscar.',
    sinResultados: 'Sin resultados para la búsqueda ingresada. Probá ingresando otro nombre de cliente.',
    tituloBuscar: 'Buscar directamente en Monday, por si el cliente todavía no está en la lista rápida',
  },
  Constructor: {
    titulo: 'Constructor/Arquitecto',
    placeholder: 'Buscar constructor o arquitecto por nombre',
    vacio: 'Escribí el nombre del constructor/arquitecto o su id para buscar.',
    sinResultados: 'Sin resultados para la búsqueda ingresada. Probá ingresando otro nombre de constructor/arquitecto.',
    tituloBuscar: 'Buscar directamente en Monday, por si el constructor todavía no está en la lista rápida',
  },
}

/**
 * Un buscador de contactos (cliente o constructor) con su ficha: el mismo buscador de la obra en
 * Producción, sobre el índice del tablero de ese contacto. Sugiere mientras se escribe y el botón
 * Buscar va a Monday por el que la lista rápida todavía no tiene.
 */
function BuscadorContacto({
  tipo,
  elegido,
  onElegido,
  onError,
}: {
  tipo: TipoContacto
  elegido: Contacto | null
  onElegido: (c: Contacto | null) => void
  onError: (accion: string) => void
}) {
  const t = TEXTOS[tipo]
  const [indice, setIndice] = useState<EntradaIndice[]>([])
  const [cargando, setCargando] = useState(false)
  const [noEncontrado, setNoEncontrado] = useState(false)

  /* El índice llega de a una página: cada una ya sirve para sugerir, sin esperar a todas. */
  useEffect(() => cargarIndiceContactos(tipo, (lista) => setIndice(indexar(lista))), [tipo])

  const abrir = async (id: string) => {
    setCargando(true)
    try {
      const c = await conTope(getContacto(tipo, id))
      if (!c) {
        setNoEncontrado(true)
        return
      }
      onElegido(c)
    } catch {
      onError(`leer los datos del ${tipo === 'Cliente' ? 'cliente' : 'constructor/arquitecto'}`)
    } finally {
      setCargando(false)
    }
  }

  const b = useBuscadorObras({
    indice,
    buscarRemoto: async (texto) => {
      try {
        return await conTope(buscarContactos(tipo, texto))
      } catch (e) {
        onError(`buscar el ${tipo === 'Cliente' ? 'cliente' : 'constructor/arquitecto'}`)
        throw e
      }
    },
    abrir,
    onSinResultados: () => {},
    pedidoVacio: t.vacio,
  })
  const ayudaBuscador = ayudaDe(b, indice.length > 0, true, '')
  const ayuda = ayudaBuscador === SIN_RESULTADOS_BUSCADOR ? (b.error ? '' : t.sinResultados) : ayudaBuscador

  return (
    <section className="pres-contacto">
      <h3 className="carga-sec-t">
        <i className={`fas ${tipo === 'Cliente' ? 'fa-user' : 'fa-helmet-safety'}`} /> {t.titulo}
      </h3>
      <BuscadorObras
        b={b}
        placeholder={t.placeholder}
        ayuda={ayuda}
        ayudaEnRojo={false}
        deshabilitado={!mondayHabilitado()}
        ocupado={cargando}
        tituloBuscar={t.tituloBuscar}
      />
      <ContactoFicha
        tipo={tipo}
        contacto={cargando ? null : elegido}
        cargando={cargando}
        onQuitar={() => onElegido(null)}
      />
      {noEncontrado && (
        <AvisoModal titulo="No se encontró" onClose={() => setNoEncontrado(false)}>
          Lo que buscaste no está en el tablero de {tipo === 'Cliente' ? 'Clientes' : 'Constructor/Arquitecto'}. Probá con
          parte del nombre o pegá el id del ítem.
        </AvisoModal>
      )}
    </section>
  )
}

/** Los textos por los que se encuentra una bolsa: su nombre, su cliente, su constructor y su ID. */
const entradaBolsa = (b: BolsaPresupuesto) => ({
  id: b.id,
  nombre: b.nombre,
  buscables: [b.cliente?.nombre ?? '', b.arquitecto?.nombre ?? '', b.idPresupuesto],
})

/**
 * Cargar otro presupuesto: buscar la bolsa abierta ("Solicitud de Presupuesto") por el cliente o el
 * constructor al que pertenece. Las abiertas son pocas: se leen todas una vez y el buscador sugiere
 * sobre ellas.
 */
function BuscadorBolsa({ onError }: { onError: (accion: string) => void }) {
  const { presupuesto } = useApp()
  const dispatch = useDispatch()
  const [bolsas, setBolsas] = useState<BolsaPresupuesto[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [cerrada, setCerrada] = useState<string | null>(null)

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

  const indice = bolsas ? indexar(bolsas.map(entradaBolsa)) : []

  /* Se relee la bolsa elegida: puede haber cambiado de estado desde que se listó. Los contactos se
     leen de su tablero, para tener su e-mail y el celular vigente. */
  const abrir = async (id: string) => {
    setCargando(true)
    try {
      const b = await conTope(leerBolsa(id))
      if (!b || b.estado !== ETIQUETA_PRES.solicitud) {
        setCerrada(b?.nombre ?? 'El presupuesto')
        return
      }
      const [cliente, arquitecto] = await Promise.all([
        b.cliente ? conTope(getContacto('Cliente', b.cliente.id)) : Promise.resolve(null),
        b.arquitecto ? conTope(getContacto('Constructor', b.arquitecto.id)) : Promise.resolve(null),
      ])
      dispatch({
        type: 'setPresupuesto',
        cambios: { bolsa: b, cliente: cliente ?? b.cliente, arquitecto: arquitecto ?? b.arquitecto, envio: null },
      })
    } catch {
      onError('leer el presupuesto')
    } finally {
      setCargando(false)
    }
  }

  const b = useBuscadorObras({
    indice,
    /* Las abiertas ya están en memoria: el botón Buscar las vuelve a pedir, por si se abrió una
       recién, y filtra por lo escrito. */
    buscarRemoto: async (texto) => {
      try {
        const l = await conTope(listarBolsasAbiertas())
        setBolsas(l)
        const q = normalizar(texto)
        return l
          .filter((x) => [x.nombre, x.id, ...entradaBolsa(x).buscables].some((v) => normalizar(v).includes(q)))
          .map((x) => ({ id: x.id, nombre: x.nombre }))
      } catch (e) {
        onError('buscar el presupuesto')
        throw e
      }
    },
    abrir,
    onSinResultados: () => {},
    pedidoVacio: 'Escribí el nombre del cliente o del constructor para buscar.',
  })
  const sinBolsa = !presupuesto.bolsa && !cargando
  const ayudaBuscador = ayudaDe(b, indice.length > 0, !sinBolsa, 'Buscá y cargá el presupuesto abierto para continuar')
  const ayuda =
    ayudaBuscador === SIN_RESULTADOS_BUSCADOR
      ? b.error
        ? ''
        : 'No hay presupuestos abiertos de ese cliente o constructor. Probá con otro nombre.'
      : bolsas && bolsas.length === 0 && sinBolsa
        ? 'No hay presupuestos en «Solicitud de Presupuesto». Creá uno nuevo.'
        : ayudaBuscador

  return (
    <>
      <BuscadorObras
        b={b}
        placeholder={bolsas === null ? 'Leyendo los presupuestos abiertos…' : 'Buscar por cliente o constructor/arquitecto'}
        ayuda={ayuda}
        ayudaEnRojo={sinBolsa && !b.termino}
        deshabilitado={!mondayHabilitado() || bolsas === null}
        ocupado={cargando}
        tituloBuscar="Volver a leer los presupuestos abiertos en Monday y buscar en ellos"
      />
      <BolsaFicha bolsa={cargando ? null : presupuesto.bolsa} cargando={cargando} />
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
 * Arriba, qué se va a hacer: crear un presupuesto nuevo —se elige el cliente y/o el constructor (no
 * todos los presupuestos llevan constructor)— o cargar otro en uno abierto, buscándolo por el cliente
 * o el constructor al que pertenece.
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

  /* Otro cliente u otro constructor cambia a quién se manda: el envío que hubiera salido ya no vale. */
  const elegir = (cambios: { cliente?: Contacto | null; arquitecto?: Contacto | null }) =>
    dispatch({ type: 'setPresupuesto', cambios: { ...cambios, envio: null } })

  return (
    <section className="view paso-layout obras-v2 presupuesto-v2">
      <PasoHeader />
      <PasoTitulo
        titulo={etiquetaPaso('obra', null, null, 'presupuestos', modo)}
        descripcion={
          modo === 'cargar'
            ? 'Buscá el presupuesto abierto del cliente o del constructor al que le vas a cargar otro presupuesto.'
            : 'Elegí qué vas a hacer y a quién es el presupuesto: un cliente, un constructor/arquitecto o los dos.'
        }
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en <strong>.env.local</strong> como{' '}
          <strong>VITE_MONDAY_TOKEN</strong> y reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      <ModoSelect falta={falta === 'modo' && !modo} />

      {modo === 'crear' && (
        <div className="pres-contactos">
          <BuscadorContacto
            tipo="Cliente"
            elegido={presupuesto.cliente}
            onElegido={(c) => elegir({ cliente: c })}
            onError={setErrorMonday}
          />
          <BuscadorContacto
            tipo="Constructor"
            elegido={presupuesto.arquitecto}
            onElegido={(c) => elegir({ arquitecto: c })}
            onError={setErrorMonday}
          />
        </div>
      )}

      {modo === 'cargar' && <BuscadorBolsa onError={setErrorMonday} />}

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
