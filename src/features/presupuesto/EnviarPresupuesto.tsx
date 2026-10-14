import { useApp, useDispatch } from '@/state/hooks'
import type { PresupuestoCargado } from './borrador'
import { EnvioPresupuestos } from './EnvioPresupuestos'

/**
 * Crear y Cargar Presupuestos · Etapa 3: el envío de los presupuestos de la lista. Es el bloque
 * `EnvioPresupuestos` sobre el borrador: las claves que genera quedan en cada presupuesto (un reintento
 * manda los mismos enlaces) y lo que salió queda en `envio`, para registrarlo al finalizar.
 *
 * Enviar no escribe nada en Monday: se registra al finalizar.
 */
export function EnviarPresupuesto({ onAConfirmar }: { onAConfirmar?: (ids: string[]) => void }) {
  const { presupuesto, enviado } = useApp()
  const dispatch = useDispatch()
  const { cliente, arquitecto, bolsa, presupuestos } = presupuesto

  return (
    <EnvioPresupuestos
      cliente={cliente}
      arquitecto={arquitecto}
      enviarA={bolsa?.enviarA ?? ''}
      presupuestos={presupuestos}
      enviado={enviado}
      onAConfirmar={onAConfirmar}
      onClaves={(lista) =>
        dispatch({
          type: 'setPresupuesto',
          cambios: {
            presupuestos: presupuestos.map((p) => ({ ...p, clave: lista.find((x) => x.id === p.id)?.clave ?? p.clave }) as PresupuestoCargado),
          },
        })
      }
      onEnviado={(e) => {
        dispatch({
          type: 'setPresupuesto',
          cambios: { envio: { roles: e.roles, confirmador: e.confirmador, aConfirmar: e.aConfirmar, cuando: e.cuando } },
        })
        dispatch({ type: 'setEnviado' })
      }}
      onCelular={(rol, celular) =>
        /* La app sigue con el número nuevo: es el de la ficha de la persona. */
        dispatch({
          type: 'setPresupuesto',
          cambios:
            rol === 'Cliente'
              ? { cliente: cliente ? { ...cliente, celular } : null }
              : { arquitecto: arquitecto ? { ...arquitecto, celular } : null },
        })
      }
    />
  )
}
