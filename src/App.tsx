import { useEffect, useRef } from 'react'
import { ModalErrorMonday } from '@/components/ui/ModalErrorMonday'
import { ConfirmacionView } from '@/features/envio/ConfirmacionView'
import { EnvioClienteView } from '@/features/envio/EnvioClienteView'
import { InicioView } from '@/features/inicio/InicioView'
import { ObrasView } from '@/features/obras/ObrasView'
import { EtmoView } from '@/features/op/EtmoView'
import { OpFinalView } from '@/features/op/OpFinalView'
import { useApp } from '@/state/hooks'
import type { Paso } from '@/types'

/** Una vista por etapa. El orden de las etapas vive en `appState`, no acá. */
const VISTAS: Record<Paso, () => JSX.Element> = {
  obra: ObrasView,
  etmo: EtmoView,
  'op-final': OpFinalView,
  envio: EnvioClienteView,
  confirmacion: ConfirmacionView,
}

export function App() {
  const { proceso, paso, obra } = useApp()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Cada etapa arranca desde arriba, como en una navegación real.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [paso, proceso])

  /* Sin obra elegida no hay ninguna etapa que dibujar: cualquier paso cae en la lista. Es una
     salvaguarda, no un camino: el estado ya vuelve solo a `obra` cuando se sale de una. */
  const Vista = proceso === null ? InicioView : !obra && paso !== 'obra' ? ObrasView : VISTAS[paso]

  return (
    <div className="scroll" ref={scrollRef}>
      <Vista />
      <ModalErrorMonday />
    </div>
  )
}
