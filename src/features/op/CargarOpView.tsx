import { useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { SoltarArchivo } from '@/components/ui/SoltarArchivo'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { etiquetaPaso, tipoDe } from '@/lib/pasos'
import { quitarEtmoDeOrden, subirEtmoAOrden } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { DatosMedicion } from './DatosMedicion'
import { abrirOrdenDeObra } from './ordenDeObra'
import { useNumeroOrden } from './useNumeroOrden'

/**
 * Etapa 2 · Cargar OP (obras de Aluminio, envío al cliente o constructor).
 *
 * Aluminio no pasa por la lectura con IA ni por las observaciones: el PDF que se carga ES la
 * orden. El recuadro es el mismo de la carga de HETMO, y a la derecha sólo van los datos de la
 * medición.
 *
 * Al soltar el PDF nace la OP en el tablero (si todavía no existe) y el archivo se adjunta en
 * `🤖OP OriginaL`: de ahí lo descarga el escenario de envío. El resto —datos de la medición,
 * nombre, envío— se registra al tocar "Finalizar Operación" (ver `registrarAluminio`).
 */
export function CargarOpView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const { borrador, enviado, destino, responsableId } = useApp()
  const numero = useNumeroOrden(obra)
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [faltan, setFaltan] = useState<string[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useAccionEnCurso('Esperá a que termine de cargarse el documento.', subiendo)

  const m = borrador.medicion
  const archivo = borrador.archivo

  const elegir = async (f: File) => {
    if (!/pdf$/i.test(f.type || f.name)) {
      setError('El archivo tiene que ser un PDF.')
      return
    }
    setError('')
    setSubiendo(true)
    try {
      /* Al crear la OP se reserva su número: si otra persona tomó el que se mostraba, el campo
         pasa al que quedó reservado. */
      const nueva = borrador.ordenId ? null : await abrirOrdenDeObra(obra, m, responsableId)
      const id = borrador.ordenId ?? nueva!.id
      dispatch({
        type: 'setBorrador',
        cambios: {
          ordenId: id,
          ...(nueva && nueva.numero !== m.nroOrden ? { medicion: { ...m, nroOrden: nueva.numero } } : {}),
        },
      })
      await subirEtmoAOrden(id, f)
      /* Otro archivo es otra orden: el envío que se hubiera hecho con el anterior ya no vale. */
      dispatch({ type: 'setBorrador', cambios: { archivo: f, archivoSubido: f, generada: true, envio: null } })
    } catch {
      setError('No se pudo guardar el documento en Monday. Probá de nuevo en unos segundos.')
      dispatch({ type: 'errorMonday', accion: 'cargar la orden de producción' })
    } finally {
      setSubiendo(false)
    }
  }

  const quitar = async () => {
    if (!borrador.ordenId) return
    setSubiendo(true)
    try {
      await quitarEtmoDeOrden(borrador.ordenId)
      dispatch({ type: 'setBorrador', cambios: { archivo: null, archivoSubido: null, generada: false, envio: null } })
    } catch {
      dispatch({ type: 'errorMonday', accion: 'quitar el documento' })
    } finally {
      setSubiendo(false)
    }
  }

  const continuar = () => {
    if (subiendo) {
      setAviso('El PDF de la orden todavía se está guardando en el sistema. Esperá a que termine para continuar.')
      return
    }
    const f = [
      ...(!archivo ? ['Cargá el PDF de la orden de producción.'] : []),
      ...(!m.nroOrden.trim() ? ['Falta el N° de orden en «Datos de Medición».'] : []),
    ]
    if (f.length) {
      setFaltan(f)
      return
    }
    dispatch({ type: 'goto', paso: 'envio' })
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Cargar OP"
        descripcion="Cargá el PDF de la orden de producción y completá los datos de la medición."
      />

      <div className="carga-grid">
        <SoltarArchivo
          id="op-aluminio"
          archivo={archivo?.name ?? null}
          estado={subiendo ? 'procesando' : error ? 'error' : archivo ? 'listo' : 'vacio'}
          titulo={subiendo ? 'Guardando el documento…' : error ? 'No se pudo cargar' : archivo ? 'Orden cargada' : undefined}
          detalle={error || undefined}
          deshabilitado={enviado || subiendo}
          onArchivo={(f) => void elegir(f)}
          onQuitar={archivo && !enviado && !subiendo ? () => void quitar() : undefined}
        />

        <div className="card carga-datos">
          <section className="carga-sec">
            <h3 className="carga-sec-t">
              <i className="fas fa-ruler-combined" /> Datos de la medición
            </h3>
            <DatosMedicion
              valor={m}
              onCambio={(medicion) => dispatch({ type: 'setBorrador', cambios: { medicion } })}
              disabled={enviado}
              numeroCargando={numero.cargando}
              numeroError={numero.error}
            />
          </section>
        </div>
      </div>

      <PieEtapa>
        <button type="button" className="btn btn-primary" onClick={continuar}>
          Continuar a {etiquetaPaso('envio', destino, tipoDe(obra))} <i className="fas fa-arrow-right" />
        </button>
      </PieEtapa>

      {aviso && (
        <AvisoModal titulo="Se está cargando el documento" onClose={() => setAviso(null)}>
          {aviso}
        </AvisoModal>
      )}

      {faltan && (
        <AvisoModal titulo="Todavía no se puede continuar" faltantes={faltan} onClose={() => setFaltan(null)}>
          Completá lo siguiente para pasar al envío:
        </AvisoModal>
      )}
    </section>
  )
}
