import { useState } from 'react'
import { AvisoModal } from '@/components/ui/AvisoModal'
import { SoltarArchivo } from '@/components/ui/SoltarArchivo'
import { useObra } from '@/features/obras/useObra'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { useAccionEnCurso } from '@/features/shared/useAccionEnCurso'
import { etiquetaPaso, tipoDe } from '@/lib/pasos'
import { ArchivoMuyPesado, prepararArchivoParaSubir } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { DatosMedicion } from './DatosMedicion'
import { reservarNumeroDeCarga } from './ordenDeObra'
import { useNumeroOrden } from './useNumeroOrden'

/**
 * Etapa 2 · Cargar OP (obras de Aluminio, envío al cliente o constructor).
 *
 * Aluminio no pasa por la lectura con IA ni por las observaciones: el PDF que se carga ES la
 * orden. El recuadro es el mismo de la carga de HETMO, y a la derecha sólo van los datos de la
 * medición.
 *
 * El PDF queda EN LA APP: en Monday no se crea nada hasta "Finalizar Operación", que crea la OP, le
 * adjunta el PDF en `🤖OP OriginaL` y registra los datos de la medición y el envío (ver
 * `registrarAluminio`). El envío manda el PDF dentro del pedido. Al cargarlo sólo se reserva el N°
 * de orden en la base, porque va en el mensaje que sale antes de finalizar.
 */
export function CargarOpView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const { borrador, enviado, destino } = useApp()
  const numero = useNumeroOrden(obra)
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [faltan, setFaltan] = useState<string[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useAccionEnCurso('Esperá a que termine de prepararse el documento.', subiendo)

  const m = borrador.medicion
  const archivo = borrador.archivo

  const elegir = async (elegido: File) => {
    let f = elegido
    if (!/pdf$/i.test(f.type || f.name)) {
      setError('El archivo tiene que ser un PDF.')
      return
    }
    setError('')
    setSubiendo(true)
    try {
      /* El mismo filtro que se aplica al subir: un archivo que no entra en el tope de Vercel se
         rechaza AHORA, no al finalizar. */
      f = await prepararArchivoParaSubir(f)
      /* Otro archivo es otra orden: el envío que se hubiera hecho con el anterior ya no vale. */
      dispatch({ type: 'setBorrador', cambios: { archivo: f, generada: true, envio: null } })
      /* Si otra persona tomó el número que se mostraba, el campo pasa al que quedó reservado. Si la
         base no contesta, se sigue: el número se reserva al finalizar. */
      const reservado = await reservarNumeroDeCarga(obra, m, borrador.numeroReservado).catch((e) => {
        console.warn('[numeración] no se pudo reservar el número al cargar', e)
        return null
      })
      if (reservado) {
        dispatch({ type: 'setBorrador', cambios: { medicion: { ...m, nroOrden: reservado }, numeroReservado: true } })
      }
    } catch (e) {
      if (e instanceof ArchivoMuyPesado) {
        setError(e.message)
        return
      }
      setError('No se pudo preparar el documento. Probá de nuevo en unos segundos.')
    } finally {
      setSubiendo(false)
    }
  }

  /* El PDF vive en la app: quitarlo no toca Monday. */
  const quitar = () => {
    dispatch({ type: 'setBorrador', cambios: { archivo: null, generada: false, envio: null } })
  }

  const continuar = () => {
    if (subiendo) {
      setAviso('El PDF de la orden todavía se está preparando. Esperá a que termine para continuar.')
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
          titulo={subiendo ? 'Procesando documento…' : error ? 'No se pudo cargar' : archivo ? 'Orden cargada' : undefined}
          detalle={error || undefined}
          deshabilitado={enviado || subiendo}
          onArchivo={(f) => void elegir(f)}
          onQuitar={archivo && !enviado && !subiendo ? quitar : undefined}
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
