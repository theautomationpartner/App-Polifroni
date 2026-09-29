/**
 * La Orden de Producción final, dibujada con @react-pdf/renderer.
 *
 * Es la plantilla HTML de PDF.co (`formularios/template-etmo/orden-produccion-final.html`) llevada
 * a los componentes de react-pdf, con la misma geometría:
 *  - cada hoja es una carilla A4 sin márgenes; el encabezado va de borde a borde;
 *  - el cuerpo reparte el alto entre 1, 2 o 3 renglones de 3 tarjetas;
 *  - todas las tarjetas tienen la MISMA geometría fija (código, descripción de alto fijo, color,
 *    medidas, cantidad, dibujo con lo que sobra, bloque de vidrios + tapajuntas de alto fijo y,
 *    en las hojas que tienen alguna, la observación): por eso "Color:", el dibujo y los "Tap:"
 *    caen a la misma altura en las tres columnas, tenga o no vidrio el modelo.
 *
 * Lo que cambia respecto del HTML: react-pdf no tiene grid ni `calc()`. Las columnas tienen ancho
 * fijo y el recorte del dibujo llega hecho (ver `hojas.ts`). Y el bloque de datos crece con la
 * cantidad de líneas "Vid:" del modelo que más tiene en la hoja, porque ahora se imprimen todas.
 *
 * La hoja es SIEMPRE una A4 vertical. Ojo con `wrap={false}` en el `Page`: en react-pdf eso no
 * significa "no cortar" sino "la hoja mide lo que su contenido" —con un renglón de tarjetas salía
 * una hoja de 210 × 158 mm, más ancha que alta, y la impresora la ponía apaisada—. Que todo entre
 * en la A4 lo resuelve `enPaginas` (datos.ts), que reparte los renglones con las mismas medidas.
 */
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import {
  ALTO_DATOS_MM,
  ALTO_OBS_MM,
  ALTO_VIDRIO_MM,
  LINEAS_OBS_OP,
  type DatosOp,
  type ModeloOp,
  type PaginaOp,
} from './datos'

/* Sin guiones de corte: un código o una medida partidos al final del renglón se leen mal. */
Font.registerHyphenationCallback((palabra) => [palabra])

const NARANJA = '#F1651C'
const LINEA = '#8c8c8c'
const RAYA = '—'

/** Ancho de cada columna: 210 mm − 2 × 5 mm de margen − 2 × 3 mm entre columnas, dividido 3. */
const ANCHO_TARJETA = '64.6mm'

const s = StyleSheet.create({
  pagina: { fontFamily: 'Helvetica', fontSize: 8, color: '#000', flexDirection: 'column' },

  /* ── Encabezado ── */
  head: {
    flexDirection: 'row',
    minHeight: '23mm',
    borderWidth: 2.2,
    borderColor: NARANJA,
    borderStyle: 'solid',
  },
  logo: {
    width: '30mm',
    borderRightWidth: 2.2,
    borderRightColor: NARANJA,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5mm',
  },
  logoImg: { maxWidth: '100%', maxHeight: '20mm', objectFit: 'contain' },
  centro: { flex: 1, paddingVertical: '1.5mm', paddingHorizontal: '3mm' },
  titulo: {
    textAlign: 'center',
    color: NARANJA,
    fontFamily: 'Helvetica-Bold',
    fontSize: 12.5,
    marginBottom: '1mm',
  },
  obra: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, lineHeight: 1.15, marginBottom: '1mm' },
  dato: { fontSize: 8.5, lineHeight: 1.25 },
  nro: { width: '34mm', borderLeftWidth: 2.2, borderLeftColor: NARANJA },
  nroV: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nroVTexto: { fontFamily: 'Helvetica-Bold', fontSize: 22 },
  nroEtmo: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: NARANJA },
  nroCelda: { flex: 1, paddingTop: '0.7mm', paddingBottom: '0.9mm', paddingHorizontal: '1mm', alignItems: 'center' },
  nroCeldaDer: { borderLeftWidth: 1, borderLeftColor: NARANJA },
  nroL: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 5.6,
    color: NARANJA,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  nroN: { fontFamily: 'Helvetica-Bold', fontSize: 9, lineHeight: 1.25 },
  derecha: {
    width: '44mm',
    borderLeftWidth: 2.2,
    borderLeftColor: NARANJA,
    paddingVertical: '1.5mm',
    paddingHorizontal: '2mm',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meta: { fontSize: 8.5, lineHeight: 1.4, textAlign: 'center' },
  vista: { fontFamily: 'Helvetica-Bold', fontSize: 11.5 },

  /* ── Cuerpo ── */
  cuerpo: { flex: 1, paddingHorizontal: '5mm', flexDirection: 'column' },
  fila: { flex: 1, flexDirection: 'row', paddingTop: '1.5mm', paddingBottom: '2mm' },
  filaSiguiente: { borderTopWidth: 0.5, borderTopColor: LINEA },
  card: { width: ANCHO_TARJETA, paddingHorizontal: '1mm', flexDirection: 'column' },
  cardSiguiente: { marginLeft: '3mm' },
  /* Todo texto con `lineHeight` lleva su `fontSize`: si lo hereda, react-pdf calcula el
     interlineado sobre 18 pt y cada renglón queda del doble de alto. */
  cod: { fontFamily: 'Helvetica-Bold', fontSize: 8, lineHeight: 1.2 },
  desc: { height: '7mm', marginTop: '0.5mm', marginBottom: '0.8mm' },
  descTexto: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textTransform: 'uppercase',
    lineHeight: 1.12,
    maxLines: 2,
    textOverflow: 'ellipsis',
  },
  kv: { fontSize: 8, marginBottom: '0.5mm', lineHeight: 1.2 },
  negrita: { fontFamily: 'Helvetica-Bold' },
  cant: { fontFamily: 'Helvetica-Bold', fontSize: 8, marginTop: '0.5mm', lineHeight: 1.2 },
  dib: {
    flex: 1,
    minHeight: '12mm',
    maxHeight: '44mm',
    marginVertical: '1.5mm',
    overflow: 'hidden',
    position: 'relative',
  },
  dibRecorte: { width: '31mm' },
  dibEntero: { width: '100%' },
  /* El dibujo va FUERA del flujo (absoluto, ocupando su caja): así no empuja el renglón con su
     tamaño natural. La caja la mide el espacio que queda en la hoja, entre 12 y 44 mm, y el dibujo
     se acomoda adentro. Sin esto, una foto alta estiraba el renglón y la hoja no entraba en A4. */
  dibImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    objectPosition: 'left top',
  },
  datos: { overflow: 'hidden' },
  vid: { flexDirection: 'row', marginBottom: '1mm', paddingLeft: '3mm' },
  vidSep: { marginLeft: '2mm' },
  tap: { flexDirection: 'row', paddingVertical: '0.3mm' },
  tapL: { fontFamily: 'Helvetica-Bold', width: '9mm', paddingLeft: '3mm' },
  tapC: { width: '16mm' },
  obs: {
    height: `${ALTO_OBS_MM}mm`,
    overflow: 'hidden',
    marginTop: '0.6mm',
    paddingTop: '0.8mm',
    paddingRight: '1mm',
    paddingLeft: '3mm',
    borderTopWidth: 0.4,
    borderTopStyle: 'dashed',
    borderTopColor: LINEA,
  },
  obsVacia: { borderTopColor: '#ffffff' },
  obsEt: { fontFamily: 'Helvetica-Bold', color: NARANJA, fontSize: 6.4, letterSpacing: 0.2, marginBottom: '0.3mm' },
  obsTexto: { fontSize: 6.8, lineHeight: 1.18 },

  /* ── Pie ── */
  pie: { paddingTop: '1.5mm', paddingHorizontal: '5mm', paddingBottom: '2.5mm', alignItems: 'flex-end' },
  pieFila: { flexDirection: 'row', fontFamily: 'Helvetica-Bold', fontSize: 11, lineHeight: 1.25 },
  pieVal: { minWidth: '18mm', marginLeft: '1.5mm' },
  /* La observación de la OP: texto libre, puede ser largo. Va debajo de "Medido por", alineada con
     el resto del pie, y con un tope de renglones para que la hoja no se pase de la A4. */
  pieObs: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'flex-end', marginTop: '0.8mm' },
  pieObsL: { fontFamily: 'Helvetica-Bold', fontSize: 11, lineHeight: 1.25, flexShrink: 0 },
  pieObsV: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.3,
    marginLeft: '1.5mm',
    marginTop: '0.4mm',
    maxWidth: '125mm',
    flexShrink: 1,
    maxLines: LINEAS_OBS_OP,
    textOverflow: 'ellipsis',
  },
  sueltas: {
    paddingHorizontal: '5mm',
    paddingBottom: '5mm',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    lineHeight: 1.3,
    color: NARANJA,
  },
})

const o = (v: string | number | null | undefined): string =>
  v == null || v === '' ? RAYA : String(v)

function Tarjeta({
  m,
  pagina,
  dibujo,
  primera,
}: {
  m: ModeloOp
  pagina: PaginaOp
  dibujo: string | null
  primera: boolean
}) {
  const altoDatos = `${ALTO_DATOS_MM + (pagina.maxVidrios - 1) * ALTO_VIDRIO_MM}mm`
  const recortado = m.slot === 'a' || m.slot === 'b'
  return (
    <View style={[s.card, primera ? {} : s.cardSiguiente]}>
      <Text style={s.cod}>Modelo:{o(m.codigo)}</Text>
      <View style={s.desc}>
        {/* Dos renglones: es el alto fijo que alinea las tres columnas. */}
        <Text style={s.descTexto}>
          {o(m.descripcion)}
        </Text>
      </View>
      <Text style={s.kv}>
        <Text style={s.negrita}>Color:</Text> {o(m.color)}
      </Text>
      <Text style={s.kv}>
        <Text style={s.negrita}>Medidas:</Text>
        {o(m.ancho)} mm ,{o(m.alto)} mm
      </Text>
      <Text style={s.cant}>CANTIDAD: {o(m.cantidad)}</Text>

      <View style={[s.dib, recortado ? s.dibRecorte : s.dibEntero]}>
        {dibujo ? <Image src={dibujo} style={s.dibImg} /> : null}
      </View>

      {/* Va SIEMPRE, aunque venga vacío: su alto fijo mantiene las tres columnas alineadas. */}
      <View style={[s.datos, { height: altoDatos }]}>
        {m.vidrios.map((v, i) => (
          <View key={`v${i}`} style={s.vid}>
            <Text style={s.negrita}>Vid:</Text>
            <Text style={s.vidSep}>{o(v.tipo)}</Text>
            <Text style={s.vidSep}>
              {o(v.ancho)} x {o(v.alto)}
            </Text>
            <Text style={s.vidSep}>ud:{o(v.ud)}</Text>
          </View>
        ))}
        {m.taps.map((t, i) => (
          <View key={`t${i}`} style={s.tap}>
            <Text style={s.tapL}>Tap:</Text>
            <Text style={s.tapC}>{o(t.cod)}</Text>
            <Text>{o(t.medida)} mm</Text>
          </View>
        ))}
      </View>

      {pagina.hayObs &&
        (m.observacion ? (
          <View style={s.obs}>
            <Text style={s.obsEt}>OBSERVACIÓN</Text>
            <Text style={s.obsTexto}>{m.observacion}</Text>
          </View>
        ) : (
          <View style={[s.obs, s.obsVacia]} />
        ))}
    </View>
  )
}

export interface PropsDocumentoOp {
  datos: DatosOp
  /** El logo, como URL o data URL. */
  logo: string
  /** El dibujo de cada modelo, en el mismo orden que `datos.paginas → filas → modelos`. */
  dibujos: (string | null)[]
}

export function DocumentoOp({ datos, logo, dibujos }: PropsDocumentoOp) {
  let n = 0
  return (
    <Document title={`Orden de Produccion ${datos.nroOrden} - ${datos.obra}`} author="Polifroni">
      {datos.paginas.map((pagina) => (
        <Page key={pagina.nro} size="A4" orientation="portrait" style={s.pagina}>
          <View style={s.head}>
            <View style={s.logo}>
              <Image src={logo} style={s.logoImg} />
            </View>
            <View style={s.centro}>
              <Text style={s.titulo}>ORDEN DE PRODUCCION</Text>
              <Text style={s.obra}>OBRA:{datos.obra}</Text>
              <Text style={s.dato}>DIRECCION DE OBRA: {datos.direccion}</Text>
              <Text style={s.dato}>CELULAR: {datos.celular}</Text>
            </View>
            <View style={s.nro}>
              <View style={s.nroV}>
                <Text style={s.nroVTexto}>{datos.nroOrden}</Text>
              </View>
              <View style={s.nroEtmo}>
                <View style={s.nroCelda}>
                  <Text style={s.nroL}>N° Listado</Text>
                  <Text style={s.nroN}>{o(datos.numeroListado)}</Text>
                </View>
                <View style={[s.nroCelda, s.nroCeldaDer]}>
                  <Text style={s.nroL}>Versión</Text>
                  <Text style={s.nroN}>{o(datos.version)}</Text>
                </View>
              </View>
            </View>
            <View style={s.derecha}>
              <Text style={s.meta}>
                {datos.fecha}
                {'\n'}Página {pagina.nro} de {datos.totalPaginas}
              </Text>
              <Text style={s.vista}>{datos.vista}</Text>
            </View>
          </View>

          <View style={s.cuerpo}>
            {pagina.filas.map((fila, i) => (
              <View key={i} style={[s.fila, i > 0 ? s.filaSiguiente : {}]}>
                {fila.map((m, j) => (
                  <Tarjeta key={j} m={m} pagina={pagina} dibujo={dibujos[n++] ?? null} primera={j === 0} />
                ))}
              </View>
            ))}
          </View>

          {pagina.esUltima && (
            <>
              <View style={s.pie}>
                <View style={s.pieFila}>
                  <Text>CANT. DE ABERTURAS:</Text>
                  <Text style={s.pieVal}>{datos.totales.aberturas}</Text>
                </View>
                <View style={s.pieFila}>
                  <Text>CANT. DVH :</Text>
                  <Text style={s.pieVal}>{datos.totales.dvh}</Text>
                </View>
                <View style={s.pieFila}>
                  <Text>CANT. MOSQUITEROS:</Text>
                  <Text style={s.pieVal}>{datos.totales.mosquiteros}</Text>
                </View>
                <View style={s.pieFila}>
                  <Text>MEDIDO POR:</Text>
                  <Text style={s.pieVal}>{o(datos.medidoPor)}</Text>
                </View>
                {/* Va siempre: sin observación, con una raya. */}
                <View style={s.pieObs}>
                  <Text style={s.pieObsL}>OBSERVACIÓN OP:</Text>
                  <Text style={s.pieObsV}>{o(datos.observacionOp)}</Text>
                </View>
              </View>
              {/* Sólo lo que NO se pudo asignar a ningún modelo. */}
              {datos.observacionesSueltas && (
                <Text style={s.sueltas}>
                  OBSERVACIONES:{'\n'}
                  {datos.observacionesSueltas}
                </Text>
              )}
            </>
          )}
        </Page>
      ))}
    </Document>
  )
}
