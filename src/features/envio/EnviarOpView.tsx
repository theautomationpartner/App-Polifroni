import { useEffect, useState } from 'react'
import { useObra } from '@/features/obras/useObra'
import { FinalizarOperacion } from '@/features/shared/FinalizarOperacion'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PieEtapa } from '@/features/shared/PieEtapa'
import { nombreOrden } from '@/features/shared/nombreOrden'
import { registrarAluminio } from '@/features/op/registrarAluminio'
import { tipoDe } from '@/lib/pasos'
import { leerOrden, type ResumenOrden } from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import { DocumentoLocal, DocumentoOrden } from './DocumentoOrden'
import { EnviarOp, type OrdenLocal } from './EnviarOp'

/**
 * Etapa 3 · Enviar OP (Aluminio al cliente o constructor, y cualquier obra al taller).
 *
 * Es sólo el bloque de envío de La Batea, con la orden a la derecha para ver QUÉ se manda antes de
 * mandarlo. La orden es la que se cargó en la etapa 2 (aluminio) o la que se eligió en la tabla
 * (taller).
 *
 * Aluminio, cargando una orden nueva, es distinto: la OP y su PDF ya están en Monday (se adjuntó al
 * cargarlo), pero los datos y el envío se registran recién al tocar "Finalizar Operación" (ver
 * `registrarAluminio`). El documento que se ve es el PDF cargado en la app.
 */
export function EnviarOpView() {
  const obra = useObra()
  const dispatch = useDispatch()
  const { destino, borrador, ordenId, existente, responsableId } = useApp()
  const modo = destino === 'taller' ? 'taller' : 'cliente'
  /** Aluminio, orden nueva: el registro se completa al finalizar. */
  const enApp = modo === 'cliente' && !existente && tipoDe(obra) === 'Aluminio'
  const local: OrdenLocal | null =
    enApp && borrador.archivo
      ? {
          ordenId: borrador.ordenId,
          archivo: borrador.archivo,
          numero: borrador.medicion.nroOrden.trim(),
          tipo: 'Aluminio',
          medidoPor: borrador.medicion.medidoPor,
          fecha: borrador.medicion.fecha,
          observacion: borrador.medicion.observacion,
        }
      : null
  /* La OP elegida en la tabla (al taller, o "Enviar una ya cargada"), o la que se cargó en la
     etapa 2. */
  const id = enApp ? null : modo === 'taller' || existente ? ordenId : borrador.ordenId
  const [orden, setOrden] = useState<ResumenOrden | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    if (!id) {
      setOrden(null)
      setCargando(false)
      return
    }
    void leerOrden(id)
      .then((o) => vivo && setOrden(o))
      .catch(() => vivo && setOrden(null))
      .finally(() => vivo && setCargando(false))
    return () => {
      vivo = false
    }
  }, [id, obra])

  const listo = enApp ? !!local : !!orden &&
    orden.opFinal.length > 0 &&
    (modo === 'taller'
      ? orden.estadoOrden === 'confirmada'
      : orden.estadoOrden === 'generada' || orden.estadoOrden === 'pendiente')

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Enviar OP"
        descripcion={
          modo === 'taller'
            ? 'Mandá al taller la orden confirmada para que se fabrique.'
            : 'Mandá la orden al cliente o al constructor, con el enlace para que la confirme.'
        }
      />

      <div className="emision-grid emision-grid--mitades">
        <div className="card card-pad">
          <h3 className="resumen-title">
            {modo === 'taller' ? 'La orden que sale al taller' : 'Documento que se envía'}
          </h3>
          {local ? (
            <DocumentoLocal
              archivo={local.archivo}
              numero={local.numero}
              tipo={local.tipo}
              medidoPor={local.medidoPor}
              fecha={local.fecha}
            />
          ) : (
            <DocumentoOrden orden={orden} cargando={cargando} vacio="No hay una orden elegida." />
          )}
        </div>
        <EnviarOp
          modo={modo}
          orden={orden}
          listo={listo}
          local={local}
          avisoNoListo={
            enApp
              ? 'Falta cargar el PDF de la orden en la etapa anterior'
              : cargando
              ? 'Leyendo la orden del tablero'
              : !orden
                ? 'No hay una orden elegida: volvé a la etapa anterior'
                : modo === 'taller' && orden.estadoOrden !== 'confirmada'
                  ? 'Esta orden no está confirmada: no se manda al taller'
                  : orden.opFinal.length === 0
                    ? 'La orden no tiene la OP final adjunta'
                    : 'Esta orden ya fue confirmada o cancelada: no se envía al cliente'
          }
        />
      </div>

      <PieEtapa>
        <FinalizarOperacion
          detalle={local ? `N° ${local.numero} · Aluminio` : orden ? nombreOrden(orden) : undefined}
          registrar={
            local
              ? () =>
                  registrarAluminio({
                    obra,
                    borrador,
                    responsableId,
                    avanzar: (cambios) => dispatch({ type: 'setBorrador', cambios }),
                  })
              : undefined
          }
        />
      </PieEtapa>
    </section>
  )
}
