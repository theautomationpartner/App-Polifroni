import { useEffect, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { Modal } from '@/components/ui/Modal'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { indexar, type EntradaIndice } from '@/lib/busquedaObras'
import { BuscadorObras, ayudaDe, useBuscadorObras } from '@/features/shared/BuscadorObras'
import {
  buscarObras,
  getIndiceObras,
  getObra,
  mondayHabilitado,
} from '@/services/monday'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { DestinoSelect } from '@/features/shared/DestinoSelect'
import { useApp, useDispatch } from '@/state/hooks'
import type { Destino, Obra } from '@/types'
import { etiquetaPaso, tipoDe } from '@/lib/pasos'
import { ObraFichaCliente } from './ObraFichaCliente'
import { validarEntrada, type ValidacionEntrada } from './validaciones'

/**
 * Paso 1 · Elegir la obra.
 *
 * **Acá no se lista ni se precarga el tablero.** No se le pide NADA a Monday hasta que alguien
 * busca: ni al abrir la pantalla ni por detrás. 573 obras ordenadas por lo que el tablero devuelva
 * primero no son una lista —son algo que hay que recorrer— y la obra que se viene a abrir se sabe
 * de antemano.
 *
 * El costo de no tener índice en memoria hay que saberlo: la búsqueda es la del tablero, o sea por
 * NOMBRE (y por id de ítem pegado). Probado contra la API, Monday no acepta `contains_text` sobre
 * la cuenta corriente ni sobre la ubicación, así que buscar por cliente sólo sería posible
 * teniendo el tablero en memoria.
 *
 * Lo que devuelve la búsqueda se despliega SOBRE el campo, como en La Batea, y hay que elegir una:
 * una lista suelta debajo deja seguir sin haber elegido nada, y todo lo que viene después necesita
 * una obra. Elegir es el paso, no un detalle.
 */
/** Lo que falta mientras no hay obra: va en rojo debajo del buscador, hasta que se carga una. */
const AYUDA_SIN_OBRA = 'Buscá y cargá una obra para continuar'

export function ObrasView() {
  const dispatch = useDispatch()
  const { destino, obra: obraElegida } = useApp()

  /** Se tocó una obra sin haber contestado a quién se envía: se pide primero eso. */
  const [sinDestino, setSinDestino] = useState(false)
  /** Se intentó continuar sin contestar a quién se envía: la pregunta queda marcada en rojo. */
  const [marcarDestino, setMarcarDestino] = useState(false)
  /**
   * La obra leída de Monday, a la vista en la ficha. Todavía NO es la obra de la operación: lo es
   * recién al tocar "Continuar". Volviendo a esta etapa con el stepper, arranca en la ya elegida.
   */
  const [vista, setVista] = useState<Obra | null>(obraElegida)
  const [cargandoObra, setCargandoObra] = useState(false)
  const [sinObra, setSinObra] = useState(false)
  const [noEncontrada, setNoEncontrada] = useState(false)

  /** El índice del buscador rápido (id + nombre de cada obra), bajado una vez por sesión. */
  const [indice, setIndice] = useState<EntradaIndice[]>([])
  /**
   * Obra elegida que todavía NO se abrió porque hay algo que preguntar.
   *
   * Las validaciones del circuito se resuelven acá y no adentro de cada etapa: preguntar al entrar
   * no agrega un paso, reemplaza el momento en que la persona se iba a dar cuenta sola tres
   * pantallas después.
   */
  const [pendiente, setPendiente] = useState<{ obra: Obra; aviso: ValidacionEntrada } | null>(null)

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

  /**
   * Lee la obra COMPLETA de Monday y la muestra en la ficha. Sin ventana en el medio: mientras se
   * consulta, la ficha queda en esqueleto en su lugar, como la del cliente de La Batea.
   */
  const abrir = async (id: string) => {
    setCargandoObra(true)
    try {
      const obra = await getObra(id)
      if (!obra) {
        setVista(null)
        setNoEncontrada(true)
        return
      }
      setVista(obra)
    } catch {
      dispatch({ type: 'errorMonday', accion: 'buscar la obra' })
    } finally {
      setCargandoObra(false)
    }
  }

  const b = useBuscadorObras({
    indice,
    buscarRemoto: async (t) => (await buscarObras(t, 50)).filas.map((f) => ({ id: f.id, nombre: f.nombre })),
    abrir,
    onSinResultados: () => setNoEncontrada(true),
    pedidoVacio: 'Escribí el nombre de la obra o su id para buscar.',
  })

  /**
   * Continuar con la obra de la ficha. El botón queda SIEMPRE a la vista: si falta algo, la ventana
   * lo explica al tocarlo. Recién acá se valida (¿ya tiene órdenes?, ¿tiene el tipo?) y se entra.
   */
  const continuar = () => {
    if (!vista || cargandoObra) {
      setSinObra(true)
      return
    }
    if (!destino) {
      setMarcarDestino(true)
      setSinDestino(true)
      return
    }
    const aviso = validarEntrada(destino, vista)
    if (aviso) {
      setPendiente({ obra: vista, aviso })
      return
    }
    entrar(vista, destino)
  }

  /** Lo que viene después de la obra, para anticiparlo en el pie. */
  const siguiente = destino ? etiquetaPaso('carga', destino, tipoDe(vista)) : ''
  /* Sin obra no se anticipa nada en el pie: lo que falta se dice debajo del buscador, que es
     donde se resuelve. */
  const motivoBloqueo = vista && !destino ? 'Elegí a quién vas a enviarle la orden' : ''

  /**
   * Abre la obra en la pantalla de una acción. La acción va PRIMERO: `setObra` entra a la pantalla
   * de la acción que esté elegida.
   */
  const entrar = (obra: Obra, d: Destino, existente = false) => {
    /* Elegir la obra NO crea nada en el tablero: la OP nace recién cuando se carga su documento.
       Entrar a mirar una obra y salir no deja ítems vacíos. */
    if (d !== destino) dispatch({ type: 'setDestino', destino: d })
    dispatch({ type: 'setObra', obra, existente })
  }

  /** Aceptar la pregunta: se aplica lo que haya que aplicar y recién ahí se entra. */
  const confirmar = (existente = false) => {
    if (!pendiente) return
    const { obra, aviso } = pendiente
    setPendiente(null)
    if (existente) {
      entrar(obra, aviso.destino, true)
      return
    }
    /* La OP nueva arranca vacía por sí sola: el documento y las observaciones son de cada OP, así
       que no hay nada de la orden anterior que limpiar en la obra. */
    entrar(obra, aviso.destino)
  }

  /** El renglón de ayuda del buscador. Sin obra cargada —y sin otra cosa que decir— pide la obra. */
  const ayuda = ayudaDe(b, indice.length > 0, !!vista || cargandoObra, AYUDA_SIN_OBRA)

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      {/* La pregunta que decide el recorrido va ANTES de elegir la obra: de ella depende qué se
          hace en las etapas que siguen. */}
      {/* La marca roja se va sola apenas se contesta: la condición mira el destino, no un reset. */}
      <DestinoSelect falta={marcarDestino && !destino} />

      <PasoTitulo
        titulo="Seleccionar Obra"
        descripcion="Buscá y seleccioná la obra a la cual pertenece la orden de producción que querés enviar."
      />



      {/* Sólo aparece corriendo en tu máquina: en el servidor el token no lo pone el navegador
          sino la función de `api/`, así que `mondayHabilitado()` ya no pregunta por él. */}
      {sinToken && (
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
        deshabilitado={sinToken}
        ocupado={cargandoObra}
      />

      {b.error && <Aviso tono="err">{b.error}</Aviso>}

      {/* La ficha se muestra SIEMPRE: en esqueleto mientras no hay obra o se consulta Monday, y
          con los datos reales al resolver la búsqueda (la `ClienteFicha` de La Batea). */}
      <ObraFichaCliente obra={cargandoObra ? null : vista} cargando={cargandoObra} />

      {/* El avance queda SIEMPRE a la vista: si falta algo, la ventana lo explica al tocarlo. */}
      <div className="actions-footer">
        <span className={`paso-siguiente ${motivoBloqueo ? 'paso-siguiente--bloqueo' : ''}`}>
          {motivoBloqueo ? (
            <>
              <i className="fas fa-circle-exclamation" /> {motivoBloqueo}
            </>
          ) : vista && siguiente ? (
            <>
              <i className="fas fa-arrow-turn-up paso-siguiente-ic" /> Siguiente: {siguiente}
            </>
          ) : null}
        </span>
        <button type="button" className="btn btn-primary" disabled={cargandoObra} onClick={continuar}>
          Continuar{siguiente ? ` a ${siguiente}` : ''} <i className="fas fa-arrow-right" />
        </button>
      </div>

      {/* Cuando hay una búsqueda hecha, el recordatorio de abajo deja volver a abrir la lista sin
          tener que buscar otra vez. Elegir sigue siendo obligatorio: no hay ningún camino que siga
          sin una obra. */}
      {/* Sólo con varias coincidencias y ninguna cargada todavía: con la obra en la ficha, la lista
          ya no tiene nada que pedir. */}
      {b.buscado && b.resultados.length > 1 && !b.abierto && !vista && !cargandoObra && (
        <button type="button" className="card obras-retomar" onClick={() => b.setAbierto(true)}>
          <i className="fas fa-list-ul" />
          <span>
            <strong>{b.resultados.length}</strong>{' '}
            {b.resultados.length === 1 ? 'obra encontrada' : 'obras encontradas'} para «{b.buscado}» ·
            elegí una para seguir
          </span>
          <span className="obras-retomar-x" onClick={b.limpiar}>
            Limpiar
          </span>
        </button>
      )}

      {pendiente && (
        <Modal
          title={pendiente.aviso.titulo}
          icon={
            <i
              className={`fas ${pendiente.aviso.tono === 'warn' ? 'fa-triangle-exclamation modal-icon--warn' : 'fa-circle-info modal-icon--info'}`}
            />
          }
          onClose={() => setPendiente(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setPendiente(null)}>
                {pendiente.aviso.cancelar}
              </button>
              {pendiente.aviso.aceptar && (
                <button type="button" className="btn btn-primary btn-marca" onClick={() => confirmar()}>
                  {pendiente.aviso.aceptar}
                </button>
              )}
              {/* El segundo camino: mandar una de las órdenes que la obra ya tiene cargadas. */}
              {pendiente.aviso.alternativa && (
                <button type="button" className="btn btn-primary btn-marca" onClick={() => confirmar(true)}>
                  {pendiente.aviso.alternativa}
                </button>
              )}
            </>
          }
        >
          <p className="modal-clave">{pendiente.aviso.clave}</p>
          {pendiente.aviso.nota && <p className="modal-nota">{pendiente.aviso.nota}</p>}
        </Modal>
      )}

      {sinDestino && (
        <AvisoModal titulo="Elegí a quién vas a enviarle la orden" onClose={() => setSinDestino(false)}>
          Contestá arriba «¿A quién vas a enviarle la orden?»: de eso depende qué se hace con la obra.
        </AvisoModal>
      )}

      {sinObra && (
        <AvisoModal titulo="Falta cargar una obra" onClose={() => setSinObra(false)}>
          Para continuar tenés que buscar y cargar una obra. Usá el buscador de arriba y volvé a
          intentar.
        </AvisoModal>
      )}

      {noEncontrada && (
        <AvisoModal titulo="Obra no encontrada" onClose={() => setNoEncontrada(false)}>
          La obra que buscaste no está en el tablero de Obras. Probá con parte del nombre o pegá el
          id del ítem.
        </AvisoModal>
      )}
    </section>
  )
}
