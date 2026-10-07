import { useState, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Dropdown } from '@/components/ui/Dropdown'
import { LogoEmpresa } from '@/components/ui/LogoEmpresa'
import { Modal } from '@/components/ui/Modal'
import { Stepper } from '@/components/ui/Stepper'
import { PROCESOS, procesoDe } from '@/lib/procesos'
import { etiquetasPasos, tipoDe } from '@/lib/pasos'
import { comoUsuario } from '@/services/monday'
import { presupuestoEnCurso } from '@/features/presupuesto/borrador'
import { OPERACIONES, PASOS, areaVisible, conEtapas, indiceDe, operacionesDe } from '@/state/appState'
import { useApp, useDispatch } from '@/state/hooks'
import type { Operacion, Proceso, Rol } from '@/types'

/** Item de la barra: rótulo arriba, control abajo (mismo patrón que La Batea). */
/**
 * A nombre de quién se emite la OP: es el "Responsable" que queda en el tablero de órdenes.
 *
 * Un ADMIN —el admin de la cuenta de Monday o quien tenga Tipo = Admin en la lista blanca— puede
 * elegir a cualquier persona de la cuenta, como el selector de vendedor de La Batea. El resto ve su
 * propio nombre y no lo puede cambiar: emite siempre a su nombre.
 */
export function SelectorUsuario() {
  const { usuario, usuarios, responsableId } = useApp()
  const dispatch = useDispatch()
  const elegido =
    usuarios.find((u) => u.id === responsableId) ??
    (usuario ? comoUsuario(usuario.id, usuario.name) : null)

  const caja = (
    <span className="selbox-val">
      {elegido ? <Avatar ini={elegido.ini} color={elegido.color} size="sm" /> : <i className="fas fa-user" />}
      <span className="selbox-val-txt">{elegido?.name ?? 'Sin sesión'}</span>
    </span>
  )

  if (!usuario?.isAdmin) {
    return (
      <div className="selbox selbox--fix selbox--fijo" title={elegido ? `Emitís a tu nombre: ${elegido.name}` : undefined}>
        {caja}
      </div>
    )
  }

  return (
    <div className="sel-usuario">
      <Dropdown
        label={caja}
        items={usuarios}
        itemKey={(u) => u.id}
        esElegido={(u) => u.id === elegido?.id}
        disabled={usuarios.length === 0}
        onSelect={(u) => dispatch({ type: 'setResponsable', id: u.id })}
        renderItem={(u) => (
          /* Avatar y nombre van JUNTOS en un solo bloque: el ítem reparte el espacio para mandar el
             tilde a la derecha, y sueltos quedaban separados según el largo de cada nombre. */
          <span className="dd-usuario" title={u.name}>
            <Avatar ini={u.ini} color={u.color} size="sm" />
            <span className="dd-usuario-nombre">{u.name}</span>
          </span>
        )}
      />
    </div>
  )
}

export function TopSel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="topsel-item">
      <span className="topsel-lbl">{label}</span>
      {children}
    </div>
  )
}

/**
 * Selector de OPERACIÓN, el mismo control con el que La Batea elige el tipo de operación.
 *
 * Lista sólo las operaciones de la sección en la que se está (hoy, Producción). Con trabajo
 * cargado —una obra elegida— el cambio se intercepta con la misma advertencia de La Batea: cambiar
 * de operación descarta lo cargado.
 */
function OperacionSelector() {
  const { proceso, operacion, obra, turno, presupuesto, edicion, accionEnCurso, usuario } = useApp()
  const dispatch = useDispatch()
  const [pendiente, setPendiente] = useState<Operacion | null>(null)
  const actual = OPERACIONES.find((o) => o.id === operacion)
  /* Con trabajo cargado —una obra, el cliente de un turno o lo elegido de un presupuesto— cambiar de
     operación lo descarta. */
  const hayTrabajo = Boolean(obra || turno.cliente || presupuestoEnCurso(presupuesto) || edicion.orden)

  const elegir = (op: Operacion) => {
    if (op === operacion || accionEnCurso) return
    if (!hayTrabajo) {
      dispatch({ type: 'setOperacion', operacion: op })
      return
    }
    setPendiente(op)
  }

  return (
    <>
      <span className="topsel-op" title={accionEnCurso ?? undefined}>
        <Dropdown<Operacion>
          label={<span className={actual ? '' : 'selbox-ph'}>{actual?.titulo ?? 'Seleccionar...'}</span>}
          items={operacionesDe(proceso, usuario?.roles).map((o) => o.id)}
          itemKey={(op) => op}
          esElegido={(op) => op === operacion}
          renderItem={(op) => OPERACIONES.find((o) => o.id === op)?.titulo ?? op}
          itemClassName="dditem--strong"
          disabled={!!accionEnCurso}
          onSelect={elegir}
        />
      </span>

      {pendiente && (
        <Modal
          title="¿Cambiar de operación?"
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setPendiente(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setPendiente(null)}>
                Volver
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const op = pendiente
                  setPendiente(null)
                  dispatch({ type: 'setOperacion', operacion: op })
                }}
              >
                Aceptar
              </button>
            </>
          }
        >
          Al cambiar de operación, todos los datos ingresados actualmente se perderán. Lo que ya se
          guardó en el tablero queda como está. ¿Deseas continuar?
        </Modal>
      )}
    </>
  )
}

/** "Inicio" en el selector de área: vuelve a la pantalla de entrada. */
const INICIO = 'inicio'
/** Prefijo de las áreas que todavía no están: se listan apagadas. */
const PROXIMAMENTE = 'pronto:'
type OpcionArea = string
/**
 * Las opciones del selector de área: Inicio primero, después las áreas en su orden. Las que el team
 * del usuario no habilita no se listan; las que todavía no están, sólo al admin (apagadas).
 */
const opcionesArea = (roles: readonly Rol[] | undefined): OpcionArea[] => [
  INICIO,
  ...PROCESOS.filter((p) => areaVisible(p.id, roles)).map((p) => p.id ?? `${PROXIMAMENTE}${p.titulo}`),
]

/**
 * Operación y usuario: misma ubicación y diseño en todas las pantallas (el `SelectoresOperacion`
 * de La Batea). Antes del selector va la SECCIÓN en la que se está —"Producción →"—: es la
 * tarjeta que se eligió en la pantalla inicial, y tocarla vuelve ahí.
 */
export function SelectoresOperacion({ children }: { children?: ReactNode }) {
  const { proceso, obra, turno, presupuesto, accionEnCurso, usuario } = useApp()
  const dispatch = useDispatch()
  const seccion = procesoDe(proceso)
  /** Se eligió ir al inicio u otra área con una operación en curso: se pregunta antes. */
  const [salir, setSalir] = useState<OpcionArea | null>(null)

  /** Ir a lo elegido en el selector de área. */
  const ir = (destino: OpcionArea) =>
    destino === INICIO ? dispatch({ type: 'reset' }) : dispatch({ type: 'setProceso', proceso: destino as Proceso })

  /* Cambiar de área (o volver al inicio) descarta la operación en curso. Con trabajo cargado —una
     obra elegida— se pregunta antes, igual que al cambiar de operación. */
  const elegirArea = (destino: OpcionArea) => {
    if (accionEnCurso) return
    if (destino !== INICIO && destino === proceso) return
    if (obra || turno.cliente || presupuestoEnCurso(presupuesto)) setSalir(destino)
    else ir(destino)
  }

  return (
    <div className="topsel">
      {/* La marca abre la barra y es el camino de vuelta al inicio. */}
      <button
        type="button"
        className="marca-btn"
        title={accionEnCurso ?? 'Volver al inicio'}
        disabled={!!accionEnCurso}
        onClick={() => dispatch({ type: 'reset' })}
      >
        <LogoEmpresa />
      </button>
      {/* El ÁREA es un desplegable con "Inicio" primero y todas las áreas después; las que todavía no
          están se ven, apagadas. En el inicio —el estado inicial de la app— muestra "Inicio".
          Elegida un área, aparece su nombre, la flecha y el selector de sus operaciones. */}
      <TopSel label="Área:">
        <div className="topsel-ruta">
          <span className="topsel-area" title={accionEnCurso ?? undefined}>
            <Dropdown<OpcionArea>
              label={
                seccion ? (
                  <span className="selbox-val">
                    <i className={`fas ${seccion.icono} topsel-area-ic`} /> {seccion.titulo}
                  </span>
                ) : (
                  <span className="selbox-val">
                    <i className="fas fa-house topsel-area-ic" /> Inicio
                  </span>
                )
              }
              items={opcionesArea(usuario?.roles)}
              itemKey={(o) => o}
              esElegido={(o) => (o === INICIO ? proceso === null : o === proceso)}
              esInactivo={(o) => o.startsWith(PROXIMAMENTE)}
              renderItem={(o) => {
                if (o === INICIO) {
                  return (
                    <span className="dd-area">
                      <i className="fas fa-house" /> Inicio
                    </span>
                  )
                }
                const p = o.startsWith(PROXIMAMENTE)
                  ? PROCESOS.find((x) => `${PROXIMAMENTE}${x.titulo}` === o)
                  : procesoDe(o as Proceso)
                return (
                  <span className="dd-area">
                    <i className={`fas ${p?.icono ?? 'fa-circle'}`} /> {p?.titulo}
                  </span>
                )
              }}
              itemClassName="dditem--strong"
              disabled={!!accionEnCurso}
              onSelect={(o) => elegirArea(o)}
            />
          </span>
          {seccion && <i className="fas fa-chevron-right topsel-flecha" aria-hidden="true" />}
        </div>
      </TopSel>
      {seccion && (
        <TopSel label="Operación:">
          <OperacionSelector />
        </TopSel>
      )}
      <TopSel label="Usuario:">
        <SelectorUsuario />
      </TopSel>
      {children}

      {salir && (
        <Modal
          title={salir === INICIO ? '¿Estás seguro que deseas volver al inicio?' : '¿Estás seguro que deseas cambiar de área?'}
          icon={<i className="fas fa-triangle-exclamation modal-icon--warn" />}
          onClose={() => setSalir(null)}
          actions={
            <>
              <button type="button" className="btn btn-out" onClick={() => setSalir(null)}>
                Volver
              </button>
              <button
                type="button"
                className="btn btn-primary btn-marca"
                onClick={() => {
                  const destino = salir
                  setSalir(null)
                  ir(destino)
                }}
              >
                Aceptar
              </button>
            </>
          }
        >
          {salir === INICIO
            ? 'Al volver al inicio, todos los datos ingresados en la operación en curso se perderán.'
            : 'Al cambiar de área, todos los datos ingresados en la operación en curso se perderán.'}
        </Modal>
      )}
    </div>
  )
}

/**
 * Barra de contexto (la de La Batea): a la izquierda la sección, la operación y el usuario; a la
 * derecha, el avance por etapas.
 *
 * La barra de etapas ocupa su lugar SIEMPRE, aunque la operación no tenga etapas (o todavía no se
 * haya elegido): va en fantasma, invisible y fuera del árbol de accesibilidad. Así la banda mide
 * lo mismo en todas las pantallas y nada salta al elegir la operación.
 *
 * Los círculos navegan entre etapas YA alcanzadas: se puede volver a revisar y saltar de nuevo
 * hacia adelante sin perder lo cargado. Las futuras quedan bloqueadas.
 */
export function PasoHeader({ children }: { children?: ReactNode }) {
  const { operacion, destino, obra, paso, pasoMax, accionEnCurso, presupuesto } = useApp()
  const dispatch = useDispatch()
  const conPasos = conEtapas(operacion)
  const etapas = etiquetasPasos(destino, tipoDe(obra), operacion, presupuesto.modo)

  return (
    <header className="paso-header">
      <div className="paso-header-in">
        <div className="paso-header-sel">
          <SelectoresOperacion>{children}</SelectoresOperacion>
        </div>

        <div className="paso-header-steps" aria-hidden={!conPasos || undefined}>
          <Stepper
            steps={etapas}
            current={conPasos ? indiceDe(paso) : 0}
            className={`stepper--tight ${conPasos ? '' : 'stepper--fantasma'}`}
            maxReached={conPasos ? pasoMax : 0}
            onStep={conPasos && !accionEnCurso ? (i) => PASOS[i] && dispatch({ type: 'goto', paso: PASOS[i] }) : undefined}
          />
        </div>
      </div>
    </header>
  )
}

interface PasoTituloProps {
  titulo: string
  /** Bajada. Opcional: cuando el título ya se explica solo, sobra. */
  descripcion?: ReactNode
  /** Sin el número de etapa: para las operaciones que no tienen etapas (la consulta). */
  sinNumero?: boolean
}

/**
 * Encabezado de la etapa: número, título y —si hace falta— una línea de bajada. El número sale del
 * paso, el mismo que marca el círculo del stepper.
 */
export function PasoTitulo({ titulo, descripcion, sinNumero = false }: PasoTituloProps) {
  const { paso } = useApp()
  return (
    <header className={`header-section header-section--${paso}`}>
      <div className="step-indicator-main">
        {!sinNumero && <div className="step-badge-main">{indiceDe(paso) + 1}</div>}
        <div className="step-details-main">
          <h1 className="step-title-main">{titulo}</h1>
          {descripcion && <p className="step-desc-main">{descripcion}</p>}
        </div>
      </div>
    </header>
  )
}
