import { useEffect, useMemo, useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { AvisoModal } from "@/components/ui/AvisoModal";
import { ModalCargando } from "@/components/ui/ModalCargando";
import { hoyLocal } from "@/features/op/DatosMedicion";
import { PasoHeader, PasoTitulo } from "@/features/shared/PasoHeader";
import { useAccionEnCurso } from "@/features/shared/useAccionEnCurso";
import {
  FILTROS_GESTION,
  INDICES_GESTION,
  ganable,
  gestionable,
  pasaFiltro,
  type FiltroGestion,
} from "@/lib/presupuesto";
import { normalizar } from "@/lib/texto";
import {
  leerPresupuestoGestion,
  listarPresupuestosGestion,
  mondayHabilitado,
  perderPresupuesto,
  type DatosClienteObra,
  type PresupuestoGestion,
} from "@/services/monday";
import { useApp, useDispatch } from "@/state/hooks";
import { ganarPresupuesto, type DatosGanar, type ProgresoGanar } from "./ganar";
import {
  ModalGanarPresupuesto,
  ModalPerderPresupuesto,
} from "./ModalesPresupuesto";

/** Presupuestos por página de la tabla. */
const POR_PAGINA = 8;

/** "2026-10-05" → "05/10/2026". */
const fechaCorta = (iso: string) =>
  iso ? iso.split("-").reverse().join("/") : "";

/** La fecha del último presupuesto enviado de la bolsa (o vacío). */
const ultimoEnvio = (p: PresupuestoGestion) =>
  p.presupuestos.reduce((m, s) => (s.fechaEnvio > m ? s.fechaEnvio : m), "");

/** La pastilla del estado, con el color de la etiqueta en el tablero (la misma `op-estado` de la OP). */
function EstadoChip({ texto, color }: { texto: string; color: string }) {
  return (
    <span
      className="op-estado op-estado--sm"
      style={{ ["--op-c" as string]: color || "#c4c4c4" }}
    >
      {texto || "Sin estado"}
    </span>
  );
}

type Abierta = { accion: "ganar" | "perder"; p: PresupuestoGestion };
/** Cómo terminó un presupuesto en esta visita: sigue a la vista, con su resultado. */
type Resuelto = { como: "ganado"; idObra: string } | { como: "perdido" };

/**
 * Consultar y Gestionar Presupuestos.
 *
 * Al entrar se traen del tablero SÓLO los presupuestos que todavía se gestionan: los pendientes de
 * confirmar (enviados o en solicitud), en negociación y vencidos. Los ganados y los perdidos no. El
 * campo filtra en vivo por presupuesto, cliente o constructor; las pestañas, por estado.
 *
 *  - GANAR (no para los vencidos): pide qué presupuesto se ganó, el total pactado y el plano, y crea la obra con su registro
 *    en la cuenta corriente (ver `ganarPresupuesto`).
 *  - PERDIDO: lo pasa a "Perdido".
 *
 * Antes de cada acción se relee el presupuesto: otra persona pudo haberlo movido. Uno resuelto en esta
 * visita sigue en la tabla, con su resultado y sin acciones, hasta la próxima consulta.
 */
export function GestionarPresupuestosView() {
  const dispatch = useDispatch();
  const { usuario, usuarios, responsableId, accionEnCurso } = useApp();

  const [lista, setLista] = useState<PresupuestoGestion[] | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroGestion>("todos");
  const [pagina, setPagina] = useState(0);
  const [resueltos, setResueltos] = useState<Record<string, Resuelto>>({});
  /** Lo que un "Ganar" a medias ya dejó en Monday, por presupuesto: el reintento sigue desde ahí. */
  const [progresos, setProgresos] = useState<
    Record<
      string,
      { progreso: ProgresoGanar; datos: DatosGanar; cliente: DatosClienteObra }
    >
  >({});

  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const [trabajando, setTrabajando] = useState<{
    id: string;
    titulo: string;
    detalle: string;
  } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [bloqueo, setBloqueo] = useState<{
    titulo: string;
    texto: string;
  } | null>(null);

  useAccionEnCurso(
    "Esperá a que termine de actualizarse el presupuesto.",
    trabajando !== null,
  );

  useEffect(() => {
    let vivo = true;
    listarPresupuestosGestion(INDICES_GESTION)
      .then((l) => {
        if (!vivo) return;
        setLista(l);
        setResueltos({});
        setError(false);
      })
      .catch(() => {
        if (!vivo) return;
        setLista([]);
        setError(true);
      });
    return () => {
      vivo = false;
    };
  }, [intento]);

  /** Uno resuelto en esta visita se ve en "Todos" y en la pestaña de la que salió. */
  const pasa = (f: FiltroGestion, p: PresupuestoGestion) =>
    pasaFiltro(f, p.estado) || (!!resueltos[p.id] && f === "todos");

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return (
      (lista ?? [])
        .filter(
          (p) =>
            pasa(filtro, p) &&
            (!q ||
              [
                p.nombre,
                p.idPresupuesto,
                p.cliente?.nombre ?? "",
                p.arquitecto?.nombre ?? "",
                p.id,
              ].some((v) => normalizar(v).includes(q))),
        )
        /* Del envío más reciente al más viejo; los que no tienen fecha, al final. */
        .sort(
          (a, b) =>
            ultimoEnvio(b).localeCompare(ultimoEnvio(a)) ||
            b.id.localeCompare(a.id),
        )
    );
    // `pasa` depende de `resueltos`, que ya está en la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, busqueda, filtro, resueltos]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const enPagina = Math.min(pagina, paginas - 1);
  const visibles = filtrados.slice(
    enPagina * POR_PAGINA,
    (enPagina + 1) * POR_PAGINA,
  );
  useEffect(() => setPagina(0), [busqueda, filtro, intento]);

  const cuenta = (f: FiltroGestion) =>
    (lista ?? []).filter((p) => pasa(f, p)).length;
  const reemplazar = (p: PresupuestoGestion) =>
    setLista((l) => (l ?? []).map((x) => (x.id === p.id ? p : x)));

  /** A quién se asigna la obra: el responsable del encabezado (el admin puede elegirlo). */
  const responsable =
    usuarios.find((u) => u.id === responsableId)?.name ?? usuario?.name ?? "";

  /**
   * Relee antes de tocar. Si ya no se gestiona —o, para ganarlo, si está vencido—, se dice por qué y
   * no se escribe nada.
   */
  const fresco = async (
    p: PresupuestoGestion,
    accion: "ganar" | "perder",
  ): Promise<PresupuestoGestion | null> => {
    const f = await leerPresupuestoGestion(p.id);
    if (!f) {
      setBloqueo({
        titulo: "No se puede hacer",
        texto: "El presupuesto ya no está en el tablero.",
      });
      setLista((l) => (l ?? []).filter((x) => x.id !== p.id));
      return null;
    }
    /* Un "Ganar" a medias ya lo pudo haber dejado Ganado: el reintento sólo termina lo que falta. */
    if (!gestionable(f.estado) && !progresos[p.id]) {
      reemplazar(f);
      setBloqueo({
        titulo: "No se puede hacer",
        texto: `El presupuesto ahora está «${f.estado}» y ya no se gestiona.`,
      });
      return null;
    }
    if (accion === "ganar" && !ganable(f.estado) && !progresos[p.id]) {
      reemplazar(f);
      setBloqueo({
        titulo: "No se puede ganar",
        texto:
          "El presupuesto está vencido: un presupuesto vencido no se puede ganar.",
      });
      return null;
    }
    return f;
  };

  const ganar = async (
    p: PresupuestoGestion,
    datos: DatosGanar,
    cliente: DatosClienteObra,
  ) => {
    setAbierta(null);
    setTrabajando({
      id: p.id,
      titulo: "Confirmando el presupuesto y creando la obra...",
      detalle:
        "Se crea la obra, se registra la venta en la cuenta corriente y el presupuesto pasa a Ganado. Esperá unos segundos.",
    });
    const previo = progresos[p.id]?.progreso ?? {};
    let progreso: ProgresoGanar = { ...previo };
    try {
      const f = await fresco(p, "ganar");
      if (!f) return;
      const r = await ganarPresupuesto({
        presupuesto: f,
        datos,
        cliente,
        responsableId: responsableId ?? usuario?.id ?? null,
        hoy: hoyLocal(),
        progreso,
        avance: (c) => {
          progreso = { ...progreso, ...c };
        },
      });
      setProgresos((m) => {
        const { [p.id]: _, ...resto } = m;
        return resto;
      });
      setResueltos((m) => ({
        ...m,
        [p.id]: { como: "ganado", idObra: r.idObra },
      }));
      reemplazar({ ...f, estado: "Ganado", colorEstado: "#00c875" });
      setAviso(
        `${f.nombre} quedó Ganado: se creó la obra${r.idObra ? ` ${r.idObra}` : ""} y se registró la venta en la cuenta corriente.`,
      );
    } catch (e) {
      console.warn("[presupuesto] no se pudo ganar", e);
      /* Lo que ya quedó escrito se guarda: el reintento no crea otra obra ni otro movimiento. */
      if (progreso.obraId)
        setProgresos((m) => ({ ...m, [p.id]: { progreso, datos, cliente } }));
      setBloqueo({
        titulo: "No se pudo terminar de registrar el presupuesto",
        texto: progreso.obraId
          ? "Monday no respondió a mitad de camino: la obra ya se creó, pero falta completar el registro. Tocá «Reintentar» en la fila para terminarlo con los mismos datos; no se crea otra obra."
          : "Monday no respondió al intentar crear la obra. No se registró nada: reintentá en unos segundos. Si la falla persiste, contactate con el soporte de TAP.",
      });
    } finally {
      setTrabajando(null);
    }
  };

  const perder = async (p: PresupuestoGestion) => {
    setAbierta(null);
    setTrabajando({
      id: p.id,
      titulo: "Dando el presupuesto por perdido...",
      detalle: "Se está pasando el presupuesto a Perdido.",
    });
    try {
      const f = await fresco(p, "perder");
      if (!f) return;
      await perderPresupuesto(f.id);
      setResueltos((m) => ({ ...m, [p.id]: { como: "perdido" } }));
      reemplazar({ ...f, estado: "Perdido", colorEstado: "#df2f4a" });
      setAviso(`${f.nombre} quedó Perdido.`);
    } catch {
      dispatch({
        type: "errorMonday",
        accion: "dar el presupuesto por perdido",
      });
    } finally {
      setTrabajando(null);
    }
  };

  const total = lista?.length ?? 0;
  const ocupado = trabajando !== null || !!accionEnCurso;

  return (
    <section className="view paso-layout obras-v2 anticipos-v2 agenda-v2 presupuesto-v2">
      <PasoHeader />
      <PasoTitulo
        titulo="Consultar y Gestionar Presupuestos"
        descripcion="Los presupuestos pendientes de confirmar, en negociación y vencidos. Ganá uno para crear su obra, o dalo por perdido."
        sinNumero
      />

      {!mondayHabilitado() && (
        <Aviso tono="err">
          Falta el token de Monday para desarrollo. Cargalo en{" "}
          <strong>.env.local</strong> como <strong>VITE_MONDAY_TOKEN</strong> y
          reiniciá <strong>npm run dev</strong>.
        </Aviso>
      )}

      <div className="card unified-toolbar consulta-buscador">
        <div className="search-container">
          <div className="search-wrapper">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="search"
              className="search-input"
              placeholder="Buscar por presupuesto, cliente o constructor"
              aria-label="Buscar presupuestos"
              autoComplete="off"
              value={busqueda}
              disabled={lista === null}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <span className="search-helper" role="status" aria-live="polite">
            {lista === null
              ? "Leyendo los presupuestos..."
              : `${filtrados.length} de ${total} ${total === 1 ? "presupuesto" : "presupuestos"}`}
          </span>
        </div>
      </div>

      <div className="cobro-static">
        <div className="cobro-card">
          <div className="ag-filtros">
            <div
              className="ag-tabs"
              role="tablist"
              aria-label="Filtrar por estado"
            >
              {FILTROS_GESTION.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.id}
                  className={`ag-tab ${filtro === f.id ? "ag-tab--on" : ""}`}
                  onClick={() => setFiltro(f.id)}
                >
                  {f.titulo}
                  {lista !== null && (
                    <span className="ag-tab-n">{cuenta(f.id)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="ant-tabla-wrap">
            <table className="ant-tabla ant-tabla--fija ag-tabla pres-tabla">
              <colgroup>
                <col className="pres-w-fecha" />
                <col className="pres-w-pres" />
                <col className="pres-w-n" />
                <col className="pres-w-estado" />
                <col className="pres-w-acc" />
              </colgroup>
              <thead>
                <tr>
                  <th>Último envío</th>
                  <th>Presupuesto</th>
                  <th className="ant-col-cen">Enviados</th>
                  <th className="ant-col-cen">Estado</th>
                  <th className="ant-col-cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {lista === null ? (
                  <tr>
                    <td colSpan={5} className="ant-aviso">
                      <i className="fas fa-spinner fa-spin" /> Leyendo los
                      presupuestos...
                    </td>
                  </tr>
                ) : visibles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="ant-aviso">
                      <i className="fas fa-circle-info" />{" "}
                      {error
                        ? "No se pudieron leer los presupuestos desde Monday."
                        : busqueda.trim()
                          ? `Ningún presupuesto coincide con «${busqueda.trim()}».`
                          : "No hay presupuestos con estos filtros."}{" "}
                      {error && (
                        <button
                          type="button"
                          className="cobro-reintentar"
                          onClick={() => {
                            setLista(null);
                            setIntento((n) => n + 1);
                          }}
                        >
                          Volver a intentar
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  visibles.map((p) => {
                    const enCurso = trabajando?.id === p.id;
                    const r = resueltos[p.id];
                    const fecha = ultimoEnvio(p);
                    const quien = [p.cliente?.nombre, p.arquitecto?.nombre]
                      .filter(Boolean)
                      .join(" · ");
                    const aMedias = !!progresos[p.id];
                    return (
                      <tr
                        key={p.id}
                        className={[
                          "ant-row",
                          enCurso ? "ant-row--cancelando" : "",
                          r?.como === "ganado" ? "ag-row--cumplida" : "",
                          r?.como === "perdido" ? "ag-row--cancelada" : "",
                        ].join(" ")}
                      >
                        <td>
                          {fecha ? (
                            <span className="ant-nro">{fechaCorta(fecha)}</span>
                          ) : (
                            <span className="ant-sd">Sin fecha</span>
                          )}
                        </td>
                        <td className="ag-turno" title={p.nombre}>
                          <span className="ag-turno-cli">{p.nombre}</span>
                          <span className="ant-detalle">
                            {[p.idPresupuesto, quien]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </td>
                        <td className="ant-col-cen">{p.presupuestos.length}</td>
                        <td className="ant-col-cen">
                          <EstadoChip texto={p.estado} color={p.colorEstado} />
                        </td>
                        <td className="ant-col-cen ag-col-acc">
                          {enCurso ? (
                            <span className="ag-trabajando">
                              <i className="fas fa-circle-notch spin" />{" "}
                              Actualizando…
                            </span>
                          ) : r?.como === "ganado" ? (
                            <span className="ag-resuelto ag-resuelto--ok">
                              <i className="fas fa-circle-check" /> Obra creada
                              {r.idObra ? ` · ${r.idObra}` : ""}
                            </span>
                          ) : r?.como === "perdido" ? null : (
                            <div className="ag-acciones">
                              {/* Un vencido no se gana: sólo se puede dar por perdido. */}
                              {(ganable(p.estado) || aMedias) && (
                                <button
                                  type="button"
                                  className="ag-acc ag-acc--ok"
                                  disabled={ocupado}
                                  onClick={() => {
                                    setAviso(null);
                                    setAbierta({ accion: "ganar", p });
                                  }}
                                >
                                  <i
                                    className={`fas ${aMedias ? "fa-rotate-right" : "fa-trophy"}`}
                                  />{" "}
                                  {aMedias ? "Reintentar" : "Ganar"}
                                </button>
                              )}
                              {!aMedias && (
                                <button
                                  type="button"
                                  className="ag-acc ag-acc--cancel"
                                  disabled={ocupado}
                                  onClick={() => {
                                    setAviso(null);
                                    setAbierta({ accion: "perder", p });
                                  }}
                                >
                                  <i className="fas fa-thumbs-down" /> Perdido
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {lista !== null && (
            <div className="obras-pager">
              <button
                type="button"
                className="obras-pager-btn"
                disabled={enPagina === 0}
                onClick={() => setPagina(enPagina - 1)}
              >
                <i className="fas fa-chevron-left" /> Anterior
              </button>
              <span className="obras-pager-info">
                Página {enPagina + 1} de {paginas} · {filtrados.length}{" "}
                {filtrados.length === 1 ? "presupuesto" : "presupuestos"}
              </span>
              <button
                type="button"
                className="obras-pager-btn"
                disabled={enPagina >= paginas - 1}
                onClick={() => setPagina(enPagina + 1)}
              >
                Siguiente <i className="fas fa-chevron-right" />
              </button>
            </div>
          )}

          <div className="cobro-card-acts">
            {aviso && (
              <span className="cobro-bloqueo-inline cobro-bloqueo-inline--ok">
                <i className="fas fa-circle-check" /> {aviso}
              </span>
            )}
          </div>
        </div>
      </div>

      {abierta?.accion === "ganar" && (
        <ModalGanarPresupuesto
          presupuesto={abierta.p}
          responsable={responsable}
          previo={
            progresos[abierta.p.id]
              ? {
                  datos: progresos[abierta.p.id].datos,
                  cliente: progresos[abierta.p.id].cliente,
                }
              : null
          }
          onClose={() => setAbierta(null)}
          onConfirmar={(datos, cliente) =>
            void ganar(abierta.p, datos, cliente)
          }
        />
      )}
      {abierta?.accion === "perder" && (
        <ModalPerderPresupuesto
          presupuesto={abierta.p}
          onClose={() => setAbierta(null)}
          onConfirmar={() => void perder(abierta.p)}
        />
      )}

      {trabajando && (
        <ModalCargando
          titulo={trabajando.titulo}
          detalle={trabajando.detalle}
        />
      )}

      {bloqueo && (
        <AvisoModal titulo={bloqueo.titulo} onClose={() => setBloqueo(null)}>
          {bloqueo.texto}
        </AvisoModal>
      )}
    </section>
  );
}
