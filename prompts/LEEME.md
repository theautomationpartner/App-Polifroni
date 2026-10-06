# Prompts de la IA

Acá están, en texto plano, las instrucciones que la app le manda a la IA (Claude). Se pueden leer y
editar con cualquier editor: la app las lee de estos archivos.

## Qué es cada archivo

Todos se usan para leer la **orden de HETMO** ("LISTADO DIBUJOS") de una OP de PVC.

| Archivo | Cuándo se usa | Qué es |
| --- | --- | --- |
| `hetmo-vidrios-observaciones.sistema.txt` | Al cargar el PDF de HETMO: lectura de vidrios y de observaciones | Las instrucciones generales: rol, reglas y formato de salida |
| `hetmo-vidrios.pedido.txt` | En la lectura de los **vidrios** | El pedido: en qué poner el foco |
| `hetmo-observaciones.pedido.txt` | En la lectura de las **observaciones** | El pedido: en qué poner el foco |
| `listado-hetmo.sistema.txt` | Al **generar la OP final**: lectura del listado completo | Las instrucciones generales: rol, reglas y formato de salida |
| `listado-hetmo.pedido.txt` | Al generar la OP final | El pedido |

- **Sistema:** dice *cómo* trabajar.
- **Pedido:** va junto al PDF y dice *qué* hacer en esa lectura.

## Cómo editar sin romper nada

- **No cambies el nombre de los archivos.** La app los busca por nombre. Si uno falta o queda vacío,
  la lectura falla con el código `ERROR_PROMPT_IA` y el nombre del archivo.
- **Los nombres de los campos son fijos.** La respuesta de la IA tiene una forma fija (los campos
  `vidrios`, `observaciones`, `modelo`, `ancho`, etc.), que está en el código y la app la exige. Podés
  cambiar las **reglas** y la **forma de leer**, pero si renombrás o agregás campos en el texto, la IA
  igual va a responder con los del código.
- **Guardá en UTF-8** (lo normal en cualquier editor), para no romper las tildes.
- **Probá el cambio con un PDF real de HETMO** antes de usarlo con clientes: un número mal leído es
  un vidrio que se corta mal.

## Cuándo se aplica un cambio

- **En tu computadora** (`npm run dev`): en la próxima lectura, sin reiniciar.
- **En producción:** con el próximo deploy. Hay que commitear el archivo y subirlo a `main`.
