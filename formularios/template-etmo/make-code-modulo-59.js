// =============================================================================
//  MODULO 59  ·  "armarTemplateData"
//  Escenario: [TAP] Cuando el estado 🤖Estado Orden de Prod Final cambia a Generar
// -----------------------------------------------------------------------------
//  QUE CAMBIO RESPECTO DE LA VERSION ANTERIOR
//  1) Se agrego parsearObservaciones()  -> parte el texto del webhook en
//     "codigo de modelo" -> "observacion".
//  2) Se le cuelga a cada modelo su m.observacion y su m.mostrarObs.
//  3) El templateData ahora manda "observacionesSueltas" (las que no
//     encontraron modelo) en lugar de "observaciones".
//  Todo lo demas quedo igual.
// =============================================================================

// -----------------------------------------------------------------------------
//  PARSEO DE LAS OBSERVACIONES
// -----------------------------------------------------------------------------
//  El texto llega asi (campo "observaciones" del webhook):
//
//      Modelo V1 DT 1: vkjhgveloajrvlieablñvk
//      Modelo V2 DT1: 2222222222
//      Modelo V24 DT 5: .ñlm
//      ñ{klm{lokno
//      Modelo V30 DT 6: hgouyougvout
//
//  Detalles que contempla:
//    - "DT 1" y "DT1" (con y sin espacio). El "DT n" es opcional.
//    - Observaciones de VARIAS lineas: todo lo que va despues de los dos
//      puntos y hasta el proximo "Modelo ...:" pertenece al mismo modelo.
//    - El codigo se compara sin distinguir mayusculas: la IA devuelve "v1"
//      y el operario escribe "V1".
//    - Si un mismo modelo aparece dos veces, se concatenan las dos.
// -----------------------------------------------------------------------------
function parsearObservaciones(texto) {
  const mapa = {};
  const lista = [];
  if (texto == null) return { mapa: mapa, lista: lista };

  let t = String(texto).replace(/\r\n/g, '\n').trim();

  // La app manda este literal cuando el operario no escribio nada.
  if (!t || /^sin observaciones$/i.test(t)) return { mapa: mapa, lista: lista };

  // Cabecera: "Modelo <codigo> [DT <n>] :"
  const re = /(?:^|\n)[ \t]*Modelo[ \t]*([^\s:]+)[ \t]*(?:DT[ \t]*(\d+))?[ \t]*:[ \t]*/gi;

  const marcas = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    marcas.push({
      cod: m[1],
      dt: m[2] || null,
      inicioTexto: m.index + m[0].length, // donde arranca la observacion
      inicioCabecera: m.index             // donde arranca "Modelo ..."
    });
  }

  for (let i = 0; i < marcas.length; i++) {
    const hasta = (i + 1 < marcas.length) ? marcas[i + 1].inicioCabecera : t.length;
    const obs = t.slice(marcas[i].inicioTexto, hasta).trim();
    if (!obs) continue;

    const clave = String(marcas[i].cod).trim().toUpperCase();
    mapa[clave] = mapa[clave] ? (mapa[clave] + '\n' + obs) : obs;
    lista.push({ cod: clave, dt: marcas[i].dt, obs: obs });
  }

  // Si el texto trae contenido pero NINGUNA cabecera "Modelo X:", lo guardamos
  // entero como suelto para que igual salga impreso al pie.
  if (marcas.length === 0) lista.push({ cod: null, dt: null, obs: t });

  return { mapa: mapa, lista: lista };
}

// -----------------------------------------------------------------------------
//  ARMADO DEL templateData
// -----------------------------------------------------------------------------
function armarTemplateData(input) {
  // Los modelos, tal como los devolvió la IA.
  const data = typeof input.raw_json === 'string'
    ? JSON.parse(input.raw_json)
    : input.raw_json;

  const paginas = data.paginas || [];
  const modelos = paginas.flatMap(pagina => (pagina.filas || []).flat());

  // Los totales del pie.
  let aberturas = 0;
  let dvh = 0;
  let mosquiteros = 0;

  for (const m of modelos) {
    const cantidad = Number(m.cantidad) || 0;
    const vUd = Number(m.vUd) || 0;
    const vidrio = m.vidrio == null ? '' : String(m.vidrio);
    const descripcion = m.descripcion == null ? '' : String(m.descripcion);

    // Un mosquitero se reconoce por la descripción: "no tiene vidrio" también
    // lo cumpliría un paño ciego, que SÍ es una abertura.
    if (/mosquitero/i.test(descripcion)) {
      mosquiteros += cantidad;
    } else {
      aberturas += cantidad;
    }

    // DVH = doble vidriado hermético. Se reconoce por la cámara: "4/12/4".
    if (vidrio.includes('/')) {
      dvh += vUd * cantidad;
    }
  }

  // El logo: si viene el base64 pelado le ponemos el prefijo que necesita el
  // navegador. Si ya es un link o ya trae el prefijo, lo dejamos como está.
  let logoUrl = String(input.logoUrl || '').trim();
  if (logoUrl && !/^(https?:|data:)/i.test(logoUrl)) {
    logoUrl = 'data:image/jpeg;base64,' + logoUrl;
  }

  // Las URLs de las hojas vienen en 39.body (NO en 39.urls, que ese módulo
  // declara pero no llena). Juntamos todo lo que pueda traerlas y pescamos
  // los links con una expresión regular, venga como venga el texto.
  const pedazos = [input.urls_texto, input.urlsHojas, input.url_una];
  const texto = pedazos
    .filter(x => x != null)
    .map(x => Array.isArray(x) ? x.join(' ') : String(x))
    .join(' ');

  // Nos quedamos SOLO con las imágenes: el módulo también devuelve un .json
  // (el listado), y si se cuela intenta dibujarlo y no se ve nada.
  const hojasUrls = (texto.match(/https?:\/\/[^\s"'|,\]}<>]+/gi) || [])
    .filter(u => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u));

  // Le pegamos la URL A CADA MODELO. Así el template usa {{imgUrl}} a secas y
  // no depende de {{lookup}} ni de subir tres niveles con ../../../
  for (const m of modelos) {
    if (!m.imgUrl) {
      const i = Number(m.hojaIdx);
      m.imgUrl = (i >= 0 && hojasUrls[i]) ? hojasUrls[i] : '';
    }
  }

  // ===========================================================================
  //  NUEVO · OBSERVACIONES POR MODELO
  // ===========================================================================
  const parseo = parsearObservaciones(input.observaciones);
  const mapaObs = parseo.mapa;
  const usadas = {};

  // 1) A cada modelo, su observacion.
  for (const m of modelos) {
    const clave = String(m.codigo == null ? '' : m.codigo).trim().toUpperCase();
    const obs = clave && mapaObs[clave] ? mapaObs[clave] : null;
    m.observacion = obs;
    if (obs) usadas[clave] = true;
  }

  // 2) Por hoja: si ALGUN modelo tiene observacion, se reserva el bloque en
  //    TODAS las tarjetas de esa hoja. Asi las tres columnas quedan parejas.
  for (const pagina of paginas) {
    const delaPagina = (pagina.filas || []).flat();
    const hayAlguna = delaPagina.some(m => m.observacion);
    pagina.hayObs = hayAlguna;
    for (const m of delaPagina) m.mostrarObs = hayAlguna;
  }

  // 3) Las que no encontraron modelo: se imprimen al pie para no perderlas.
  const sueltas = parseo.lista
    .filter(o => !o.cod || !usadas[o.cod])
    .map(o => (o.cod ? ('Modelo ' + o.cod + (o.dt ? ' DT ' + o.dt : '') + ': ') : '') + o.obs);

  const obsAsignadas = Object.keys(usadas).length;
  const obsTotales = parseo.lista.length;
  // ===========================================================================

  const templateData = {
    logoUrl: logoUrl,
    obra: String(input.obra || ''),
    direccion: String(input.direccion || ''),
    celular: String(input.celular || ''),
    nroOrden: String(input.nroOrden || ''),
    fecha: String(input.fecha || ''),
    vista: String(input.vista || 'VISTA EXTERIOR'),
    medidoPor: String(input.medidoPor || ''),
    totalPaginas: paginas.length,
    mostrarTotales: true,
    totales: { aberturas: aberturas, dvh: dvh, mosquiteros: mosquiteros },
    hojasUrls: hojasUrls,
    paginas: paginas,

    // NUEVO: solo lo que no se pudo colgar de ningun modelo.
    observacionesSueltas: sueltas.length ? sueltas.join('\n') : null,

    // Diagnóstico impreso en el propio PDF. Poner true si algo deja de verse.
    debug: false,
    cantHojas: hojasUrls.length,
    primeraHoja: hojasUrls[0] || '(NINGUNA)',
    debugCrudo: (texto || '(VACIO)').slice(0, 300),
    obsAsignadas: obsAsignadas,
    obsTotales: obsTotales
  };

  return {
    // esto es lo único que se mapea en PDF.co:
    templateData: JSON.stringify(templateData),

    // ---- ESTO NO SE IMPRIME: se mira en el historial de Make --------------
    cantHojas: hojasUrls.length,
    cantModelos: modelos.length,
    debug_urls: texto.slice(0, 500),
    debug_logo: logoUrl.slice(0, 60),

    // NUEVO: para revisar de un vistazo si las observaciones cayeron bien
    obsTotales: obsTotales,
    obsAsignadas: obsAsignadas,
    obsSueltas: sueltas.length,
    obsCodigos: Object.keys(mapaObs).join(', '),
    modeloCodigos: modelos.map(m => m.codigo).join(', ')
  };
}

return armarTemplateData(input);
