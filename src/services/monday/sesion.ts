/**
 * El usuario de la SESIÓN: quién abrió la app.
 *
 * ── Por qué en producción NO se usa `me` ──
 * `me` viaja por el proxy, y el proxy pone el token del SERVIDOR: contesta quién es el dueño de ese
 * token, no quién abrió la app. Con un solo token para todos, la app creería que todos son la misma
 * persona —y la OP diría que la emitió siempre el mismo—. En producción la identidad sale de
 * `/api/usuario`, que la lee del session token ya verificado (ver `api/usuario.ts`).
 *
 * Ese pedido es además el PASO 1 del arranque (ver `App.tsx`): si contesta, el usuario pasó la firma
 * y la lista blanca. Un rechazo se propaga como `AccesoDenegado`.
 *
 * En desarrollo no hay funciones serverless ni iframe: ahí se usa `me` con el token local, que es la
 * única identidad disponible en localhost.
 */
import type { UsuarioActual } from '@/types'
import { cabecerasPropias, mondayApi, verificarRespuesta } from './sdk'

export async function getUsuarioActual(): Promise<UsuarioActual | null> {
  if (!import.meta.env.DEV) {
    const res = await fetch('/api/usuario', {
      method: 'POST',
      headers: await cabecerasPropias({ 'Content-Type': 'application/json' }),
      body: '{}',
    })
    await verificarRespuesta(res, 'Sesión')
    return (await res.json()) as UsuarioActual
  }

  const d = await mondayApi<{
    me: { id: string; name: string; is_admin?: boolean; teams?: { id: string; name: string }[] } | null
  }>('query { me { id name is_admin teams { id name } } }')
  const me = d.me
  if (!me) return null
  return {
    id: String(me.id),
    name: me.name,
    isAdmin: Boolean(me.is_admin),
    equipos: (me.teams ?? []).map((t) => t.name),
    equipoIds: (me.teams ?? []).map((t) => String(t.id)),
  }
}
