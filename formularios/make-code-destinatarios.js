// =============================================================================
//  MODULO 71  ·  "Destinatarios del envío"
//  Escenario: [TAP] Enviar Orden De Produccion -> A Cliente/Arquitecto
// -----------------------------------------------------------------------------
//  OJO: en este editor NO se pueden escribir llaves dobles, ni en comentarios:
//  Make las toma como mapeos. Por eso acá los mapeos van sin llaves.
//
//  Devuelve SIEMPRE un array `destinos`, una entrada por persona:
//
//      { tipo, nombre_destinatario, whatsapp_destinatario, email_destinatario }
//
//    - destinatario "Cliente"      -> 1 entrada (el cliente)
//    - destinatario "Constructor"  -> 1 entrada (el constructor/arquitecto)
//    - destinatario "Ambos"        -> 2 entradas
//
//  Después de este módulo va un ITERATOR sobre 71.destinos: cada vuelta es una
//  persona, y los módulos de WhatsApp / Email usan del iterator:
//      nombre_destinatario, whatsapp_destinatario, email_destinatario, tipo
//
//  DE DÓNDE SALEN LOS DATOS (en este orden):
//    1) destinos_app: la app ya los manda armados en el webhook (67.destinos),
//       con el nombre de la Cta Cte y del Constructor. Sin consultas extra.
//    2) Respaldo, si el escenario se disparó desde el botón de Monday (sin la
//       app): los nombres salen de las columnas conectadas que ya trae el
//       módulo 69 (linked_items[1].name) y los celulares de los espejos.
//
//  INPUTS DEL MÓDULO (nombre -> valor a mapear, con sus llaves, en el campo):
//    destinatarios       67.destinatario
//    via                 67.via
//    destinos_app        67.destinos
//    nombre_cliente      69 -> board_relation_mkthtd70 -> linked_items[1].name
//    nombre_constructor  69 -> board_relation_mksz3v0h -> linked_items[1].name
//    email_clien         69 -> lookup_mktzkfn3
//    cel_cliente         69 -> lookup_mktz807f
//    cel_constructor     69 -> lookup_mkv0rg18
// =============================================================================

const texto = (v) => (v == null ? '' : String(v).trim());

// Un espejo de Monday puede traer varios valores ("549..., 549..."): se usa el primero.
const primero = (v) => {
  if (Array.isArray(v)) return texto(v[0]);
  return texto(v).split(',')[0].trim();
};

// "1111 - CLIENTE TEST" -> "CLIENTE TEST": el código de la cuenta no va en un saludo.
const sinCodigo = (n) => texto(n).replace(/^\d+\s*-\s*/, '');

const soloDigitos = (v) => texto(v).replace(/\D/g, '');

// Si no hay nombre, se saluda por el rol antes que dejar "Hola ** 👋".
const nombreOrol = (nombre, tipo) => sinCodigo(nombre) || tipo;

function armarDestinos(input) {
  const pedido = texto(input.destinatarios) || 'Cliente'; // Cliente | Constructor | Ambos

  // 1) Lo que ya manda la app.
  let deApp = input.destinos_app;
  if (typeof deApp === 'string') {
    try {
      deApp = JSON.parse(deApp);
    } catch (e) {
      deApp = null;
    }
  }

  let destinos = [];
  if (Array.isArray(deApp) && deApp.length > 0) {
    destinos = deApp.map((d) => {
      const tipo = texto(d && d.tipo) || 'Cliente';
      return {
        tipo,
        nombre_destinatario: nombreOrol(d && d.nombre, tipo),
        whatsapp_destinatario: soloDigitos(d && d.whatsapp),
        email_destinatario: texto(d && d.email),
      };
    });
  } else {
    // 2) Respaldo: disparado desde Monday, sin la app.
    if (pedido !== 'Constructor') {
      destinos.push({
        tipo: 'Cliente',
        nombre_destinatario: nombreOrol(primero(input.nombre_cliente), 'Cliente'),
        whatsapp_destinatario: soloDigitos(primero(input.cel_cliente)),
        email_destinatario: primero(input.email_clien),
      });
    }
    if (pedido !== 'Cliente') {
      destinos.push({
        tipo: 'Constructor',
        nombre_destinatario: nombreOrol(primero(input.nombre_constructor), 'Constructor'),
        whatsapp_destinatario: soloDigitos(primero(input.cel_constructor)),
        email_destinatario: '',
      });
    }
  }

  // Una persona sin ningún medio de contacto no tiene a dónde recibir nada.
  destinos = destinos.filter((d) => d.whatsapp_destinatario || d.email_destinatario);

  return {
    destinos,
    cantidad: destinos.length,
    // Para mirar en el historial de Make de dónde salieron los datos.
    origen: Array.isArray(deApp) && deApp.length > 0 ? 'app' : 'monday',
    via: texto(input.via),
  };
}

return armarDestinos(input);
