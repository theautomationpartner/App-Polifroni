/**
 * `POST /api/usuario` — quién abrió la app, ya verificado.
 *
 * Es el pedido del PASO 1 de la secuencia: contesta de una sola vez si el usuario pasa la firma y
 * la lista blanca, y devuelve los datos con los que la app arma su estado (PASO 2).
 *
 * ── Por qué no alcanza con la query `me` ──
 * La app resolvía la sesión con `me` a través del proxy, y el proxy inyecta el token del SERVIDOR:
 * `me` contesta quién es el dueño de ESE token, no quién abrió la app. Con una sola cuenta de
 * servicio para todos, la app creía que todos eran esa persona —y le daba su rol—. Acá el id sale
 * del session token ya verificado, que es un dato firmado por Monday sobre este usuario y no se
 * puede falsear.
 *
 * ── Por qué NO exige el segundo factor ──
 * Es el paso 1, y el segundo factor es el paso 3. Exigirlo acá invertiría el orden y haría
 * imposible llegar al muro de MFA: nadie puede enrolarse en una app a la que no puede entrar. Lo
 * que sí se exige es todo lo anterior —firma y lista blanca—, así que esto sólo lo contesta alguien
 * que ya está habilitado. Los datos de verdad viven detrás de `/api/monday`, que sí lo exige.
 */
import type { ServerResponse } from 'node:http'
import { endpointMfa, type Pedido } from './_http.js'
import { perfilDe, tipoEnListaBlanca } from './_whitelist.js'

export default async function handler(req: Pedido, res: ServerResponse): Promise<void> {
  await endpointMfa(req, res, async ({ sesion }) => {
    const [perfil, tipo] = await Promise.all([perfilDe(sesion.userId), tipoEnListaBlanca(sesion.userId)])

    return {
      id: sesion.userId,
      /* Sin perfil se manda el id como nombre: es feo pero identifica, y es preferible a un
         encabezado vacío. El acceso ya se decidió arriba; esto es presentación. */
      name: perfil?.nombre || `Usuario ${sesion.userId}`,
      /* Admin de la APP: el admin de la cuenta de Monday —del token firmado o del perfil— o quien
         tenga Tipo = "Admin" en la lista blanca. Es lo que habilita elegir a nombre de quién se
         emite la OP; el resto de la app es igual para todos. */
      isAdmin:
        sesion.isAdmin || (perfil?.esAdminDeCuenta ?? false) || (tipo ?? '').toLowerCase() === 'admin',
      /* Los equipos de Monday. Hoy la app no restringe nada por equipo —todos los habilitados pueden
         hacer todo—; viajan para cuando haga falta. */
      equipos: perfil?.equipos ?? [],
      /* Los IDS de esos equipos, como texto. */
      equipoIds: perfil?.equipoIds ?? [],
    }
  })
}
