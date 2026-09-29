import { useEffect, useRef, useState } from 'react'
import { Aviso } from '@/components/ui/Aviso'
import { DropArchivo } from '@/components/ui/DropArchivo'
import { Modal } from '@/components/ui/Modal'
import { ModalCargando } from '@/components/ui/ModalCargando'
import { ObraFicha, useObra } from '@/features/obras/ObraFicha'
import { PasoHeader, PasoTitulo } from '@/features/shared/PasoHeader'
import { PasoNav, useRefrescarObra } from '@/features/shared/PasoNav'
import { datosObservaciones, useGenerarOp } from './useGenerarOp'
import { registrarNumero, tipoDeObra } from '@/services/make'
import {
  BOARD_ORDENES,
  COL,
  COL_OP,
  ESTADO_OP,
  completarOrden,
  marcarRecienEmitida,
  renombrarOrdenEmitida,
  copiarArchivo,
  crearSubelementos,
  getArchivosOrden,
  guardarNroHetmo,
  quitarEtmoDeOrden,
  subirEtmoAOrden,
  terminarVisita,
  setEstadoOrden,
  getUrlArchivo,
  limpiarEstado,
} from '@/services/monday'
import { useApp, useDispatch } from '@/state/hooks'
import type { ArchivoObra } from '@/types'
import { ObservacionesAberturas } from './ObservacionesAberturas'
import { DatosMedicion, hoyLocal, medicionInicial, type Medicion } from './DatosMedicion'
import { cantidadDe, cantidadesPorModelo } from './opFinal/datos'
import { generarOpFinal, type ResultadoGenerar } from './opFinal/generar'
import {
  fusionar,
  normalizarNombre,
  parsear,
  rotuloAbertura,
  serializar,
  sinCompletar,
  type Abertura,
} from './observaciones'
import { DatosObraFaltantes } from './DatosObraFaltantes'
import { ordenDeObra } from './ordenDeObra'
import { ultimaOpFinal } from './ultimaOp'
import { faltaParaLeer } from './requisitos'
import { useLeerObservaciones } from './useLeerObservaciones'

/** Datos de la medición (nro de orden, medido por, fecha). Apagado hasta que se guarden en su tablero. */
const MOSTRAR_MEDICION = true

/** Archivos ya adjuntos en la columna: se abren, y se quitan si se cargó el equivocado. */
function ListaArchivos({
  archivos,
  onQuitar,
  quitando,
}: {
  archivos: ArchivoObra[]
  onQuitar: () => void
  quitando: boolean
}) {
  const [abriendo, setAbriendo] = useState<string | null>(null)

  const abrir = async (a: ArchivoObra) => {
    setAbriendo(a.assetId)
    try {
      const url = await getUrlArchivo(a.assetId)
      window.open(url, '_blank', 'noreferrer')
    } finally {
      setAbriendo(null)
    }
  }

  if (archivos.length === 0) return null

  return (
    <div className="archivo-lista">
      {archivos.map((a) => (
        <div className="archivo-item" key={a.assetId}>
          <i className={`fas ${a.esImagen ? 'fa-file-image' : 'fa-file-pdf'}`} />
          <span className="archivo-item-n">{a.nombre}</span>
          <button type="button" className="archivo-item-a" onClick={() => void abrir(a)}>
            {abriendo === a.assetId ? 'Abriendo…' : 'Ver'}
          </button>
          {/* Quitar vacía la columna ENTERA: Monday no sabe borrar un archivo suelto. Por eso el
              botón está en cada renglón pero avisa de qué se trata antes de tocar nada. */}
          <button
            type="button"
            className="archivo-item-x"
            title="Quitar el documento de la obra"
            aria-label="Quitar el documento de la obra"
            disabled={quitando}
            onClick={onQuitar}
          >
            <i className={`fas ${quitando ? 'fa-circle-notch spin' : 'fa-xmark'}`} />
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Paso 2 · Orden ETMO y observaciones.
 *
 * Son las dos entradas del escenario que arma la OP final: el PDF que genera el sistema de diseño
 * y las observaciones. Las dos viven en el tablero, y por eso se escriben acá y no en un borrador
 * local: el escenario las lee de ahí.
 *
 * Las observaciones se editan POR ABERTURA, y no se escriben a mano en un campo libre: quién sabe
 * cuántas aberturas tiene el documento es el documento. Por eso cargar el ETMO y leerlo es UN solo
 * gesto, y el panel de observaciones recién se habilita cuando la lectura contestó. Si en el
 * momento se dijo que no, el botón de leer queda ahí para cuando se cambie de idea.
 */
/**
 * El borrador de las observaciones de UNA OP, guardado en el navegador.
 *
 * Antes vivía en la columna "Observaciones OP" de la obra, que se borró: las observaciones son de
 * cada orden, y al generarla quedan en SUS subelementos del tablero de órdenes. Hasta entonces lo
 * escrito se guarda acá, atado a la OP, para que recargar la página o ir y volver de otra etapa no
 * lo pierda. Es sólo un borrador: sin almacenamiento del navegador, queda en memoria.
 */
const claveBorrador = (ordenId: string) => `observaciones:${ordenId}`

function leerBorrador(ordenId: string): string {
  try {
    return localStorage.getItem(claveBorrador(ordenId)) ?? ''
  } catch {
    return ''
  }
}

function guardarBorrador(ordenId: string, texto: string): boolean {
  try {
    if (texto) localStorage.setItem(claveBorrador(ordenId), texto)
    else localStorage.removeItem(claveBorrador(ordenId))
    return true
  } catch {
    return false
  }
}

export function EtmoView() {
  const obra = useObra()
  const dispatch = useDispatch()
  /** Quién usa la app: queda como "Responsable" de la OP que emite. */
  const { usuario } = useApp()
  const usuarioRef = useRef(usuario)
  usuarioRef.current = usuario
  const refrescar = useRefrescarObra()
  const lectura = useLeerObservaciones(obra.id)

  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [quitando, setQuitando] = useState(false)
  const [guardado, setGuardado] = useState<'limpio' | 'guardando' | 'guardado' | 'error'>('limpio')
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'err' | 'info'; texto: string } | null>(null)
  /** Se abre al cargar el documento: leerlo es una corrida, se pregunta antes de gastarla. */
  const [proponerLectura, setProponerLectura] = useState(false)
  /** Se abre al quitar el documento CUANDO hay observaciones escritas que se van a perder. */
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  /** Con valor = hay una confirmación abierta. Adentro, las aberturas que quedaron sin escribir. */
  const [confirmarGenerar, setConfirmarGenerar] = useState<string[] | null>(null)
  /* La OP final se genera DESDE ACÁ. Antes había que pasar al paso 3 y apretar otro botón: dos
     pantallas para una decisión que ya se tomó al tocar "Generar la OP final". */
  const [ordenId, setOrdenId] = useState<string | null>(null)
  /** La misma OP, para leerla al desmontar la pantalla. */
  const ordenIdRef = useRef<string | null>(null)
  ordenIdRef.current = ordenId
  const generacion = useGenerarOp(obra, ordenId)
  /* Si la obra ya tiene otras órdenes se avisa en el paso 1, al elegirla: acá no se vuelve a preguntar. */


  /* Las aberturas salen del borrador de la OP (ver `leerBorrador`), que guarda una línea por
     modelo. Así, al volver a esta etapa, la lista está sin tener que releer el documento. */
  const [aberturas, setAberturas] = useState<Abertura[]>([])
  const [indice, setIndice] = useState(0)
  /* Datos de la medición. Viajan a la OP del tablero de órdenes y al escenario que arma el PDF. */
  const [medicion, setMedicion] = useState<Medicion>(medicionInicial)
  /* Lo último de cada cosa, para leerlo cuando llega la respuesta de la generación (que se resuelve
     en un efecto, fuera del render en que se apretó el botón). */
  const medicionRef = useRef(medicion)
  medicionRef.current = medicion
  /** PVC o Aluminio: decide qué contador se usa y si el número lleva la "A". */
  const tipoOrden = tipoDeObra(obra.tipo.texto)
  const [numeroCargando, setNumeroCargando] = useState(true)
  const [numeroError, setNumeroError] = useState(false)
  /**
   * La OP de esta visita en el tablero de órdenes. La crea el paso 1 al elegir la obra para emitir
   * (siempre una nueva); acá se toma esa. Es donde se guarda todo lo que viene después.
   */
  const ordenAbierta = useRef<Promise<string | null> | null>(null)
  /** La Orden HETMO de ESTA OP: cada orden tiene la suya, la obra ya no la guarda. */
  const [etmoOrden, setEtmoOrden] = useState<ArchivoObra[]>([])
  /** El número con el que salió ESTA orden: es el que se registra como último usado. */
  const numeroUsado = useRef<string>('')
  /** Cómo salió el armado de la OP final en la app (errores y avisos de la última corrida). */
  const resultadoOp = useRef<ResultadoGenerar | null>(null)
  /** Después de generar, mientras se adjunta la OP al tablero de órdenes. */
  const [registrando, setRegistrando] = useState(false)

  /* La OP de esta visita ya tiene su tipo y su número automático (el siguiente al último emitido de
     su tipo). El campo "Nro Orden Producción" se llena con el número de ESA OP. Un número escrito a
     mano con el lápiz no se pisa. */
  useEffect(() => {
    let vivo = true
    setNumeroCargando(true)
    const promesa = ordenDeObra(obra, usuario?.id ?? null)
    ordenAbierta.current = promesa
      .then((o) => o.id)
      .catch((e) => {
        console.warn('[etmo] no se pudo crear la OP en el tablero de órdenes', e)
        return null
      })
    promesa
      .then((o) => {
        if (!vivo) return
        setOrdenId(o.id)
        void getArchivosOrden(o.id)
          .then((a) => vivo && setEtmoOrden(a.etmo))
          .catch(() => {})
        setNumeroError(!o.numero)
        if (o.numero) setMedicion((m) => (m.nroEditado ? m : { ...m, nroOrden: o.numero }))
      })
      .catch(() => vivo && setNumeroError(true))
      .finally(() => vivo && setNumeroCargando(false))
    return () => {
      vivo = false
    }
    // La visita es de la obra: no se vuelve a pedir porque la obra se relea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obra.id])

  /* Los vidrios leídos del documento se guardan en la sesión del navegador, por OP: si se recarga la
     página antes de generar, siguen estando para crear sus subelementos. */
  const claveVidrios = ordenId ? `vidrios:${ordenId}` : ''
  useEffect(() => {
    if (!claveVidrios || lectura.vidrios.length) return
    try {
      const guardados = sessionStorage.getItem(claveVidrios)
      if (guardados) lectura.setVidrios(JSON.parse(guardados))
    } catch {
      /* sin sesión del navegador: quedan en memoria */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveVidrios])
  useEffect(() => {
    if (!claveVidrios) return
    try {
      sessionStorage.setItem(claveVidrios, JSON.stringify(lectura.vidrios))
    } catch {
      /* sin sesión del navegador: quedan en memoria */
    }
  }, [claveVidrios, lectura.vidrios])


  /** Lo último que quedó en el borrador. */
  const ultimoGuardado = useRef('')
  /** Lo escrito que todavía no llegó al borrador, para no perderlo al salir de la pantalla. */
  const pendiente = useRef<string | null>(null)
  /**
   * Si en ESTA visita alguien tocó el texto.
   *
   * Sin esto, el guardado al salir depende de comparar dos cadenas, y cualquier camino que deje
   * la lista vacía sin que nadie haya escrito —abrir la obra a medio cargar, un estado que se
   * reinicia— termina escribiendo un campo vacío sobre lo que había. Guardar sólo cuando hubo
   * una edición de verdad hace que ese borrado silencioso no pueda ocurrir.
   */
  const edito = useRef(false)

  /* Con la OP ya conocida se recupera su borrador. Lo que se esté escribiendo no se pisa. */
  useEffect(() => {
    if (!ordenId || edito.current) return
    const guardado = leerBorrador(ordenId)
    ultimoGuardado.current = guardado
    if (guardado) setAberturas(parsear(guardado))
  }, [ordenId])

  const tieneAberturas = aberturas.length > 0
  /** Los dos datos que el escenario exige para armar la OP final. */
  const faltanDatosObra = !obra.ubicacion.trim() || !obra.celCoordinar.trim()
  const aberturasRef = useRef(aberturas)
  aberturasRef.current = aberturas
  const vidriosRef = useRef(lectura.vidrios)
  vidriosRef.current = lectura.vidrios
  const texto = serializar(aberturas)
  const tieneEtmo = etmoOrden.length > 0
  /* Lo mismo que filtra el router del escenario. Si falta algo, la corrida se cortaría sin avisar
     —y de paso ya habría tocado el estado de la obra—, así que el botón no se habilita. */
  const falta = faltaParaLeer(obra, tieneEtmo)

  /* Lo escrito NO se guarda mientras se escribe: se completan las que se quieran, en el orden que
     se quiera, y recién al salir del paso se vuelca al borrador. `pendiente` es lo último tecleado,
     y el efecto de abajo lo manda al desmontar la pantalla —se salga por donde se salga—. */
  pendiente.current = edito.current && texto !== ultimoGuardado.current ? texto : null

  useEffect(() => {
    return () => {
      const ultimo = pendiente.current
      if (ultimo !== null && ordenIdRef.current) guardarBorrador(ordenIdRef.current, ultimo)
    }
  }, [obra.id])

  /** Sube el documento a la obra y, con él arriba, ofrece leerlo. */
  const cargar = async () => {
    if (!archivo) return
    setSubiendo(true)
    setAviso(null)
    try {
      /* La Orden HETMO va a la OP de esta visita, no a la obra: cada orden tiene su documento. */
      const id = await ordenAbierta.current
      if (!id) throw new Error('No hay OP donde guardar el documento')
      await subirEtmoAOrden(id, archivo)
      setEtmoOrden((await getArchivosOrden(id)).etmo)
      const fresca = await refrescar()
      setArchivo(null)
      /* Sólo se ofrece leer si el escenario va a poder: proponerlo para que después falle en su
         filtro es hacerle perder el tiempo a quien dijo que sí. */
      setProponerLectura(fresca ? !faltaParaLeer(fresca, true) : false)
    } catch {
      setAviso({ tono: 'err', texto: 'No se pudo adjuntar el archivo en Monday.' })
      dispatch({ type: 'errorMonday', accion: 'adjuntar la Orden ETMO' })
    } finally {
      setSubiendo(false)
    }
  }

  /**
   * Quita el documento Y las observaciones.
   *
   * Van juntos porque las aberturas SON las de ese documento: la lista la armó su lectura. Dejarlas
   * al cambiar de archivo haría escribir observaciones contra un dibujo que ya no está, y el
   * documento nuevo puede traer otra cantidad y otros nombres.
   */
  const quitar = async () => {
    setConfirmarQuitar(false)
    setQuitando(true)
    setAviso(null)
    try {
      const id = await ordenAbierta.current
      if (id) await quitarEtmoDeOrden(id)
      setEtmoOrden([])
      if (id) guardarBorrador(id, '')
      ultimoGuardado.current = ''
      pendiente.current = null
      edito.current = false
      setAberturas([])
      setIndice(0)
      setGuardado('limpio')
      lectura.limpiar()
      await refrescar()
      setAviso({
        tono: 'ok',
        texto: 'Se quitó el documento y sus observaciones. Cargá el nuevo y volvé a generarlas.',
      })
    } catch {
      setAviso({ tono: 'err', texto: 'No se pudo quitar el documento.' })
      dispatch({ type: 'errorMonday', accion: 'quitar la Orden ETMO' })
    } finally {
      setQuitando(false)
    }
  }

  /* Se pregunta sólo si hay algo escrito que perder. Sacar un archivo recién subido, sin
     observaciones todavía, no necesita una ventana en el medio. */
  const pedirQuitar = () => {
    if (aberturas.some((a) => a.texto.trim())) setConfirmarQuitar(true)
    else void quitar()
  }

  /** Lo que tiene que llegar al escenario y a los subelementos de la OP. */
  const observacionesActuales = texto

  /**
   * Vuelca al borrador lo que haya escrito. Nunca frena la generación: si el navegador no deja
   * guardar, lo escrito sigue en pantalla y va igual a la OP.
   */
  const guardar = async (): Promise<boolean> => {
    if (!tieneAberturas) return true
    if (texto === ultimoGuardado.current) return true
    const id = ordenIdRef.current
    const ok = !!id && guardarBorrador(id, texto)
    if (ok) {
      ultimoGuardado.current = texto
      pendiente.current = null
      edito.current = false
    }
    setGuardado(ok ? 'guardado' : 'error')
    return true
  }

  /**
   * Guarda lo escrito y le pide a la automatización la Orden de Producción final.
   *
   * Las observaciones se le pasan A MANO a `correr`. No alcanza con guardarlas antes: el `extra`
   * del hook se armó con la obra de ESTE render, que todavía tiene el texto anterior al guardado.
   * Sin esto el escenario recibía el campo vacío aunque en Monday ya estuviera escrito, y la orden
   * salía sin ninguna observación.
   */
  const generar = async () => {
    setConfirmarGenerar(null)
    resultadoOp.current = null
    if (!(await guardar())) return
    const datos = medicion
    numeroUsado.current = datos.nroOrden.trim()
    const idOrden = await ordenAbierta.current
    await generacion.correr({
      ...datosObservaciones(observacionesActuales),
      /* El pedido sale en nombre de la OP del tablero de órdenes: el escenario lee de ahí la Orden
         HETMO y deja ahí la OP final. `itemId`, `pulseId` y `boardId` son los de la OP (también
         dentro de `event`); la obra viaja aparte en `obraId`. Las observaciones, igual que siempre. */
      ...(idOrden
        ? { itemId: idOrden, pulseId: Number(idOrden), boardId: String(BOARD_ORDENES) }
        : {}),
      ordenId: idOrden,
      obraId: obra.id,
      /* La Orden HETMO que tiene que leer el escenario (ya no busca la OP en Monday). */
      assetId: etmoOrden[0]?.assetId ?? null,
      fileName: etmoOrden[0]?.nombre ?? null,
      /* Para que el PDF salga con el MISMO número que queda en el tablero de órdenes. */
      nroOrden: datos.nroOrden.trim(),
      tipoOrden,
      medidoPor: datos.medidoPor,
      fechaMedicion: datos.fecha ? datos.fecha.split('-').reverse().join('/') : '',
      observacionMedicion: datos.observacion,
    })
  }

  /**
   * Con la respuesta de la generación, se guarda en la OP todo lo del paso: los datos del formulario
   * (número, medido por, observación, fecha) y los subelementos —una observación por abertura y un
   * renglón por vidrio—. Cada parte se intenta por separado: que falle una no deja sin hacer las
   * otras.
   *
   * La cantidad de cada vidrio es el TOTAL a pedir: la de su línea "Vid:" (vidrios de UNA abertura)
   * por las aberturas del modelo ("Uds:"), que salen de `lectura` —la de la generación—. V2 con
   * "Uds: 2" y "ud:1" lleva 2. Sin lectura, o sin la cantidad del modelo, queda la de la línea.
   */
  const guardarEnOrden = async (id: string, lectura: unknown): Promise<void> => {
    const datos = medicionRef.current
    await completarOrden(id, {
      tipo: tipoOrden,
      numero: datos.nroOrden.trim(),
      /* "Responsable" es quien EMITE la OP: el usuario de la sesión. Sin sesión —no pasa en
         producción, donde no se entra sin ella— queda el asignado de la obra, como antes. */
      personas: usuarioRef.current ? [usuarioRef.current.id] : obra.asignadoIds,
      medidoPor: datos.medidoPor,
      observacion: datos.observacion,
      fecha: datos.fecha,
    }).catch((e) => console.warn('[etmo] no se pudieron cargar los datos de la OP', e))
    const observaciones = aberturasRef.current.map((a) => ({
      nombre: normalizarNombre(a.nombre),
      texto: a.texto.trim(),
    }))
    const cantidades = cantidadesPorModelo(lectura)
    const vidrios = vidriosRef.current.map((v) => {
      const uds = cantidadDe(cantidades, v.modelo)
      return v.cant != null && uds != null ? { ...v, cant: v.cant * uds } : v
    })
    await crearSubelementos(id, observaciones, vidrios).catch((e) =>
      console.warn('[etmo] no se pudieron crear los subelementos de la OP', e),
    )
  }

  /**
   * La orden nueva todavía no se mandó a nadie.
   *
   * Los estados de envío hablan de un documento que ya no existe: dejarlos en "Enviado" después de
   * regenerar hace que la etapa siguiente muestre como hecho algo que hay que volver a hacer, y
   * ése es el tipo de error que se descubre cuando el cliente reclama. Se vacían, que no es lo
   * mismo que ponerles "no enviado": vacío dice "acá todavía no pasó nada".
   */
  useEffect(() => {
    if (generacion.estado.fase !== 'listo') return
    void Promise.all([
      limpiarEstado(obra.id, COL.estadoEnvioOp).catch(() => {}),
      limpiarEstado(obra.id, COL.mjsEnviadoCliente).catch(() => {}),
    ])
  }, [generacion.estado.fase, obra.id])

  /* Generada la orden, se pasa solo al envío: es donde se ve el PDF que acaba de salir y donde
     está lo único que queda por hacer con él.

     Se RELEE la obra antes de saltar. El final de la corrida se detecta leyendo el tablero por
     afuera del estado global, así que la obra en memoria sigue sin el archivo: saltando derecho,
     el paso de envío se abre diciendo "todavía no hay una OP final adjunta" sobre una orden que
     acaba de generarse, y con el botón de enviar apagado. */
  useEffect(() => {
    if (generacion.estado.fase !== 'listo') return
    void (async () => {
      setRegistrando(true)
      const fresca = await refrescar().catch(() => null)
      /* La OP del tablero de órdenes se completa ANTES de saltar: el PDF final, el estado
         "Generada" y el número como último usado. Son unos segundos, y hechos acá no dependen de
         que la pestaña siga abierta después. */
      const id = await ordenAbierta.current
      if (id) {
        /* La respuesta del webhook trae la lectura (con la cantidad de cada modelo) y el N° de OP
           HETMO ("9.205-1"). Si la corrida se cerró por el tablero antes de que contestara, se la
           espera unos segundos. */
        const cuerpo = await generacion.esperarRespuesta(20_000)
        await guardarEnOrden(id, cuerpo?.datos)
        const nOpHetmo = String(cuerpo?.nOpHetmo ?? '').trim()
        if (nOpHetmo && !/^-?$/.test(nOpHetmo)) {
          await guardarNroHetmo(id, nOpHetmo).catch((e) =>
            console.warn('[etmo] no se pudo guardar el N° OP HETMO', e),
          )
        }
        const propios = await getArchivosOrden(id).catch(() => null)
        if (cuerpo?.datos != null) {
          /* El escenario devuelve la lectura de Claude y la OP final se arma ACÁ: los dibujos, el
             PDF y la subida a la OP. Si falta algo que la orden no puede llevar vacía, no se
             genera y se dice qué falta; no se marca "Generada" ni se consume el número. */
          const med = medicionRef.current
          const base = fresca ?? obra
          resultadoOp.current = await generarOpFinal({
            ordenId: id,
            etmo: propios?.etmo[0] ?? null,
            lectura: cuerpo.datos,
            obra: base.nombre,
            direccion: base.ubicacion,
            celular: base.celCoordinar,
            nroOrden: med.nroOrden.trim(),
            fecha: hoyLocal().split('-').reverse().join('/'),
            /* Cada dato en su lugar, igual que en la OP del tablero: "Medido por" es lo elegido en la
               lista (también "Otro"), y la "Observación" (long_text_mm7g7k7n) va en su renglón. */
            medidoPor: med.medidoPor,
            observacionOp: med.observacion,
            aberturas: aberturasRef.current,
          })
          const r = resultadoOp.current
          if (r.avisos.length) console.warn('[etmo] OP final con avisos', r.avisos)
          if (!r.ok) {
            setAviso({ tono: 'err', texto: `No se generó la OP final. ${r.errores.join(' · ')}` })
            setRegistrando(false)
            return
          }
        } else {
          /* Escenario de antes: la OP final la deja él. Si la dejó en la obra, se copia a la OP. */
          const pdf = fresca ? ultimaOpFinal(fresca) : null
          if (propios && propios.opFinal.length === 0 && pdf) {
            await copiarArchivo(pdf, id, COL_OP.opFinal).catch((e) =>
              console.warn('[etmo] no se pudo adjuntar la OP final', e),
            )
          }
        }
        await setEstadoOrden(id, ESTADO_OP.generada).catch(() => {})
        /* El paso de envío abre ESTA OP, la que se acaba de generar. */
        marcarRecienEmitida(obra.id, id)
        /* Emitida: la OP toma su nombre definitivo, con el tipo y el número con que salió. */
        await renombrarOrdenEmitida(id, (fresca ?? obra).nombre, tipoOrden, medicionRef.current.nroOrden).catch(
          (e) => console.warn('[etmo] no se pudo renombrar la OP', e),
        )
        try {
          sessionStorage.removeItem(`vidrios:${id}`)
        } catch {
          /* nada que limpiar */
        }
        /* Las observaciones ya quedaron en los subelementos de la OP: el borrador no hace falta. */
        guardarBorrador(id, '')
      }
      if (numeroUsado.current) {
        await registrarNumero(tipoOrden, numeroUsado.current).catch((e) =>
          console.warn('[etmo] no se pudo actualizar la numeración', e),
        )
      }
      /* Generada: la próxima vez que se entre a esta obra, se abre una OP nueva. */
      terminarVisita(obra.id)
      setRegistrando(false)
      /* Si la IA no pudo leer algún dato, la orden salió con una raya ahí: se muestra qué quedó
         sin leer antes de pasar al envío, que es cuando todavía se puede revisar. */
      const avisos = resultadoOp.current?.avisos ?? []
      if (avisos.length) {
        setAviso({
          tono: 'info',
          texto: `La OP final se generó, pero revisala antes de enviarla: ${avisos.join(' · ')}`,
        })
        return
      }
      dispatch({ type: 'goto', paso: 'envio' })
    })()
    // `guardarEnOrden` lee lo último por refs: no hace falta volver a correr el efecto por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generacion.estado.fase, dispatch, refrescar, tipoOrden, obra.id])

  /* Si la automatización falla, la OP de esta visita queda como está: el próximo intento le vuelve a
     cargar los datos y le reemplaza los subelementos. */

  /**
   * Qué pasa al tocar "Generar la OP final".
   *
   * Siempre se pregunta antes, incluso con todo completo. No es un paso más del formulario: dispara
   * una automatización de un minuto que REEMPLAZA la orden que la obra tuviera. Y si quedaron
   * aberturas sin escribir se dice CUÁLES en la misma ventana, porque después de generar ya no
   * entran en el documento.
   *
   * Devuelve `false` siempre: al paso 3 se llega cuando la orden está hecha, no al apretar.
   */
  const alAvanzar = (): boolean => {
    setConfirmarGenerar(
      tieneAberturas ? sinCompletar(aberturas).map((a) => rotuloAbertura(a.nombre)) : [],
    )
    return false
  }

  /** Dispara el escenario que lee el documento y arma una caja por abertura. */
  const leerDocumento = async () => {
    setProponerLectura(false)
    setAviso(null)
    const ordenId = await ordenAbierta.current
    /* El escenario lee UN archivo: el primero de la columna, el mismo que toma Make con `files[]`. */
    const leidas = await lectura.leer(ordenId, etmoOrden[0] ?? null)
    /* Si era una foto, el escenario deja en su lugar el PDF convertido: se vuelve a leer la columna
       para mostrar lo que quedó adjunto. */
    if (ordenId) {
      void getArchivosOrden(ordenId)
        .then((a) => setEtmoOrden(a.etmo))
        .catch(() => {})
    }
    if (!leidas) return
    /* Lo ya escrito manda: la lectura aporta la LISTA, no pisa observaciones hechas a mano. */
    edito.current = true
    setAberturas((previas) => fusionar(leidas, previas))
    setIndice(0)
  }

  return (
    <section className="view paso-layout obras-v2">
      <PasoHeader />

      <PasoTitulo
        titulo="Subir Orden Hetmo"
      />

      <ObraFicha obra={obra} />

      <div className="paso-grid paso-grid--etmo">
        <div className="card">
          <div className="panel-t">
            <i className="fas fa-file-arrow-up" /> Orden Obtenida ETMO
          </div>

          <DropArchivo
            id="etmo"
            nombre={archivo?.name ?? ''}
            onArchivo={setArchivo}
            disabled={subiendo}
          />

          <div className="acciones-fila">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!archivo || subiendo}
              onClick={() => void cargar()}
            >
              {subiendo ? (
                <>
                  <i className="fas fa-circle-notch spin" /> Cargando…
                </>
              ) : (
                <>
                  <i className="fas fa-file-import" /> Cargar y leer documento
                </>
              )}
            </button>
          </div>

          {tieneEtmo ? (
            <>
              <div className="panel-sep" />
              <ListaArchivos
                archivos={etmoOrden}
                quitando={quitando}
                onQuitar={pedirQuitar}
              />
              {/* La columna del tablero admite varios archivos, pero el escenario lee UNO. Con más
                  de uno, cuál se lee deja de ser evidente. */}
              {etmoOrden.length > 1 && (
                <div style={{ marginTop: 12 }}>
                  <Aviso tono="warn">
                    Hay {etmoOrden.length} documentos adjuntos y la automatización lee uno
                    solo. Quitalos y dejá únicamente el que corresponde.
                  </Aviso>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="panel-sep" />
              <Aviso tono="warn">Sin Orden ETMO adjunta no se puede generar la OP final.</Aviso>
            </>
          )}

          {aviso && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>
            </div>
          )}
        </div>

        <div className="card">
          <div className="panel-t">
            <i className="fas fa-pen-to-square" /> Observaciones por aberturas
          </div>

          {tieneAberturas ? (
            <ObservacionesAberturas
              aberturas={aberturas}
              indice={indice}
              onIndice={setIndice}
              disabled={lectura.leyendo}
              onTexto={(i, valor) =>
                setAberturas((prev) => {
                  edito.current = true
                  return prev.map((a, n) => (n === i ? { ...a, texto: valor } : a))
                })
              }
            />
          ) : (
            /* Sin leer el documento no se sabe qué aberturas tiene, así que no hay dónde escribir.
               El vacío lo dice y ofrece la única acción que lo destraba. */
            <div className="obs-vacio">
              <i className="fas fa-wand-magic-sparkles" />
              <p>
                {tieneEtmo
                  ? 'Generá las observaciones y se arma una caja por cada abertura.'
                  : 'Primero cargá la Orden ETMO: las aberturas salen del documento.'}
              </p>
            </div>
          )}

          <div className="obs-pie">
            {/* Las observaciones se generan solas al cargar el ETMO. El botón queda sólo para el
                caso en que el documento está cargado y todavía no se generaron (se dijo que no al
                cargarlo, o la lectura falló). Sin documento no hay nada que leer, y con las cajas
                ya armadas su trabajo está hecho: en los dos casos no se muestra. */}
            {tieneEtmo && !tieneAberturas && (
              <button
                type="button"
                className="btn btn-out btn--sm"
                disabled={!!falta || lectura.leyendo}
                title={falta || undefined}
                onClick={() => void leerDocumento()}
              >
                {lectura.leyendo ? (
                  <>
                    <i className="fas fa-circle-notch spin" /> Leyendo el documento…
                  </>
                ) : (
                  <>
                    <i className="fas fa-wand-magic-sparkles" /> Generar observaciones
                  </>
                )}
              </button>
            )}

            {/* Que se guarda solo hay que decirlo: sin botón, el silencio se lee como "no se
                guardó". */}
            {tieneAberturas && guardado !== 'limpio' && (
              <span
                className={`obs-estado ${guardado === 'error' ? 'obs-estado--pend' : 'obs-estado--ok'}`}
              >
                {guardado === 'guardando' && (
                  <>
                    <i className="fas fa-circle-notch spin" /> Guardando…
                  </>
                )}
                {guardado === 'guardado' && (
                  <>
                    <i className="fas fa-circle-check" /> Guardado
                  </>
                )}
                {guardado === 'error' && (
                  <>
                    <i className="fas fa-triangle-exclamation" /> No se pudo guardar
                  </>
                )}
              </span>
            )}
          </div>

          {falta && tieneEtmo && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono="warn">{falta} El escenario los necesita para poder leer el documento.</Aviso>
            </div>
          )}

          {lectura.estado.fase === 'error' && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono="err">{lectura.estado.problema}</Aviso>
            </div>
          )}

          {/* Oculto por ahora: se muestra cuando exista el tablero donde se van a guardar. */}
          {MOSTRAR_MEDICION && (
            <DatosMedicion
              valor={medicion}
              onCambio={setMedicion}
              disabled={lectura.leyendo}
              numeroCargando={numeroCargando}
              numeroError={numeroError}
            />
          )}
        </div>
      </div>

      {/* Sin ubicación o sin celular a coordinar, la OP final no se puede generar: se piden acá,
          apenas se entra, y hasta cargarlos no se sigue en el paso. */}
      {faltanDatosObra && (
        <DatosObraFaltantes
          obra={obra}
          onGuardado={async () => {
            await refrescar()
          }}
          onSalir={() => dispatch({ type: 'goto', paso: 'obra' })}
        />
      )}

      <PasoNav
        siguiente="Generar la OP final"
        onSiguiente={alAvanzar}
        bloqueado={!tieneEtmo}
        nota={
          tieneEtmo ? undefined : 'Cargá la Orden ETMO para poder pedir la generación de la OP final.'
        }
      />

      {subiendo && (
        <ModalCargando
          titulo="Cargando la Orden ETMO"
          detalle="Subiendo el archivo a la columna de la obra…"
        />
      )}

      {lectura.leyendo && (
        <ModalCargando
          titulo="Leyendo el documento"
          detalle="Buscando las aberturas del ETMO…"
        />
      )}

      {/* El doble chequeo antes de generar. Lo primero que se lee es QUÉ va a pasar —en negro y
          grande, porque es lo que hay que decidir—, y recién debajo lo que falta, si falta algo. */}
      {confirmarGenerar && (
        <Modal
          title="Se generará la OP Final"
          icon={<i className="fas fa-file-circle-check modal-icon--info" />}
          onClose={() => setConfirmarGenerar(null)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-out"
                onClick={() => setConfirmarGenerar(null)}
              >
                Volver
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void generar()}>
                <i className="fas fa-wand-magic-sparkles" />{' '}
                Generar la OP final
              </button>
            </>
          }
        >
          <p className="modal-clave">Se genera el documento final de esta obra.</p>
          {confirmarGenerar.length > 0 && (
            <p className="modal-nota">
              {confirmarGenerar.length === aberturas.length
                ? `No escribiste ninguna de las ${aberturas.length} aberturas: la orden sale sin observaciones.`
                : `Quedan sin escribir ${confirmarGenerar.join(', ')}. No entran en el documento.`}
            </p>
          )}
        </Modal>
      )}

      {generacion.enCurso && (
        <ModalCargando
          titulo="Generando la Orden de Producción final"
          detalle="La automatización está armando el documento…"
        />
      )}

      {registrando && (
        <ModalCargando
          titulo="Guardando la orden"
          detalle="Adjuntando la OP al tablero de órdenes…"
        />
      )}

      {generacion.estado.fase === 'error' && (
        <div className="paso-aviso-flot">
          <Aviso tono="err">
            No se pudo generar la Orden de Producción final.{' '}
            {generacion.estado.problema ??
              'Revisá el update que dejó la automatización en la obra y volvé a intentar.'}
          </Aviso>
        </div>
      )}

      {confirmarQuitar && (
        <Modal
          title="¿Quitar el documento?"
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setConfirmarQuitar(false)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setConfirmarQuitar(false)}>
                Volver
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void quitar()}>
                Quitar igual
              </button>
            </>
          }
        >
          Se borran también las <strong>observaciones cargadas</strong>: son las de este documento.
          El que cargues después puede traer otras aberturas.
        </Modal>
      )}

      {proponerLectura && (
        <Modal
          title="¿Generar las observaciones?"
          icon={<i className="fas fa-wand-magic-sparkles modal-icon--info" />}
          onClose={() => setProponerLectura(false)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-out"
                onClick={() => setProponerLectura(false)}
              >
                No generar observaciones
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void leerDocumento()}
              >
                <i className="fas fa-wand-magic-sparkles" /> Generar observaciones
              </button>
            </>
          }
        />
      )}
    </section>
  )
}
