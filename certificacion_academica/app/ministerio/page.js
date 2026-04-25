"use client";

import { useEffect, useMemo, useState } from "react";
import RevealOnScroll from "../components/RevealOnScroll";
import BloqueAccesoRol from "../components/BloqueAccesoRol";
import MotivoRechazoModal from "../components/MotivoRechazoModal";
import { useWalletSesion } from "../lib/cliente/wallet";
import { formatearFechaHora } from "../lib/cliente/fechas";
import {
  resolverLoteMinisterioOnchainDesdeBackpack,
  resolverTramiteMinisterioOnchainDesdeBackpack,
} from "../lib/cliente/tramites_onchain";

export default function MinisterioPage() {
  const { wallet } = useWalletSesion();
  const [rolActual, setRolActual] = useState("");
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [solicitudesLotes, setSolicitudesLotes] = useState([]);
  const [tramites, setTramites] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [vista, setVista] = useState("operaciones");
  const [seguimientoVista, setSeguimientoVista] = useState("lotes");
  const [filtroLotes, setFiltroLotes] = useState({ estado: "", q: "" });
  const [filtroTramites, setFiltroTramites] = useState({ estado: "", q: "" });
  const [detalle, setDetalle] = useState({ abierto: false, tipo: "", data: null });
  const [modalRechazo, setModalRechazo] = useState({
    abierto: false,
    tipo: "",
    id: "",
    titulo: "",
  });

  function normalizarTextoComparacion(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  async function cargar() {
    if (!wallet) return;
    const estadoResp = await fetch(`/api/roles/estado?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" });
    const estadoPayload = await estadoResp.json();
    const rol = estadoPayload?.data?.rolActivo || "";
    const roles = Array.isArray(estadoPayload?.data?.rolesDisponibles)
      ? estadoPayload.data.rolesDisponibles
      : rol
        ? [rol]
        : [];
    setRolActual(rol);
    setRolesDisponibles(roles);
    if (!roles.includes("MINISTERIO")) return;

    const [lotesResp, tramitesResp] = await Promise.all([
      fetch(`/api/lotes/solicitudes?walletMinisterio=${encodeURIComponent(wallet)}`, { cache: "no-store" }),
      fetch(`/api/tramites/ministerio?walletMinisterio=${encodeURIComponent(wallet)}`, { cache: "no-store" }),
    ]);
    const lotesPayload = await lotesResp.json();
    const tramitesPayload = await tramitesResp.json();
    setSolicitudesLotes(lotesPayload.data || []);
    setTramites(tramitesPayload.data || []);
  }

  useEffect(() => {
    cargar();
  }, [wallet]);

  async function resolverLote(solicitudId, accion, motivo = "") {
    const payload = await resolverLoteMinisterioOnchainDesdeBackpack({
      walletMinisterio: wallet,
      solicitudId,
      accion,
      motivo,
    });
    setMensaje(payload.ok ? `Solicitud de lote ${accion}da` : payload.error || "Error al resolver lote");
    await cargar();
  }

  async function resolverTramite(tramiteId, accion, motivo = "") {
    const payload = await resolverTramiteMinisterioOnchainDesdeBackpack({
      walletMinisterio: wallet,
      tramiteId,
      accion,
      motivo,
    });
    if (payload.ok) {
      const accionResuelta = payload?.data?.accion || String(accion || "").toLowerCase();
      const textoAccion =
        accionResuelta === "finalizada_argentina"
          ? "Trámite argentino certificado: registro on-chain generado y notificado al egresado"
          : accionResuelta === "enviar_cancilleria"
          ? "Trámite enviado a Cancillería"
          : accionResuelta === "rechazar"
            ? "Trámite rechazado en ministerio"
            : "Trámite resuelto en ministerio";
      setMensaje(textoAccion);
    } else {
      setMensaje(payload.error || "Error al resolver tramite");
    }
    await cargar();
  }

  function idCorto(valor) {
    const raw = String(valor || "").trim();
    if (raw.length <= 7) return raw;
    return `${raw.slice(0, 3)}...${raw.slice(-3)}`;
  }

  const lotesPendientes = useMemo(
    () => solicitudesLotes.filter((item) => item.estado === "pendiente"),
    [solicitudesLotes]
  );

  const tramitesPendientes = useMemo(
    () => tramites.filter((item) => item.estado === "pendiente"),
    [tramites]
  );

  const tramitesPendientesLocales = useMemo(
    () =>
      tramitesPendientes.filter(
        (item) => normalizarTextoComparacion(item.paisOrigen) === "argentina"
      ),
    [tramitesPendientes]
  );

  const tramitesPendientesExtranjeros = useMemo(
    () =>
      tramitesPendientes.filter(
        (item) => normalizarTextoComparacion(item.paisOrigen) !== "argentina"
      ),
    [tramitesPendientes]
  );

  const lotesFiltrados = useMemo(() => {
    const q = String(filtroLotes.q || "").trim().toLowerCase();
    return solicitudesLotes.filter((item) => {
      const okEstado = !filtroLotes.estado || item.estado === filtroLotes.estado;
      const okQ =
        !q ||
        item.id.toLowerCase().includes(q) ||
        String(item.universidad || "").toLowerCase().includes(q) ||
        String(item.carrera || "").toLowerCase().includes(q) ||
        String(item.walletUniversidad || "").toLowerCase().includes(q) ||
        String(item.solicitanteNombre || "").toLowerCase().includes(q);
      return okEstado && okQ;
    });
  }, [solicitudesLotes, filtroLotes]);

  const tramitesFiltrados = useMemo(() => {
    const q = String(filtroTramites.q || "").trim().toLowerCase();
    return tramites.filter((item) => {
      const okEstado = !filtroTramites.estado || item.estado === filtroTramites.estado;
      const titular = `${item?.titular?.nombre || ""} ${item?.titular?.apellido || ""}`.toLowerCase();
      const okQ =
        !q ||
        item.id.toLowerCase().includes(q) ||
        titular.includes(q) ||
        String(item.paisOrigen || "").toLowerCase().includes(q);
      return okEstado && okQ;
    });
  }, [tramites, filtroTramites]);

  const accesoMinisterio = rolesDisponibles.includes("MINISTERIO") || rolActual === "MINISTERIO";

  function abrirRechazo(tipo, id) {
    setModalRechazo({
      abierto: true,
      tipo,
      id,
      titulo:
        tipo === "lote"
          ? "Motivo del rechazo de la solicitud de lote"
          : "Motivo del rechazo del trámite extranjero",
    });
  }

  async function confirmarRechazo(motivo) {
    if (!motivo) {
      setMensaje("Debe ingresar un motivo para rechazar.");
      return;
    }

    const { tipo, id } = modalRechazo;
    setModalRechazo({ abierto: false, tipo: "", id: "", titulo: "" });

    if (tipo === "lote") {
      await resolverLote(id, "rechazar", motivo);
      return;
    }

    await resolverTramite(id, "rechazar", motivo);
  }

  function abrirDetalle(tipo, data) {
    setDetalle({ abierto: true, tipo, data });
  }

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48 }}>
      <RevealOnScroll className="panel" delay={40}>
        <h1>Panel del ministerio</h1>
        <p style={{ color: "var(--texto-secundario)" }}>
          Genera y transfiere lotes de tokens para universidades y resuelve validaciones de titulos extranjeros.
        </p>
        <div className="tabs">
          <button
            className={`tab-btn ${vista === "operaciones" ? "activa" : ""}`}
            onClick={() => setVista("operaciones")}
            type="button"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Operaciones
            {lotesPendientes.length > 0 ? (
              <span
                style={{
                  minWidth: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 6px",
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1,
                  background: "#ff8a80",
                  color: "#1a0b0b",
                  border: "1px solid rgba(255, 138, 128, 0.45)",
                }}
                aria-label={`${lotesPendientes.length} solicitudes de lote pendientes`}
                title={`${lotesPendientes.length} solicitudes de lote pendientes`}
              >
                {lotesPendientes.length}
              </span>
            ) : null}
          </button>
          <button
            className={`tab-btn ${vista === "seguimiento" ? "activa" : ""}`}
            onClick={() => setVista("seguimiento")}
            type="button"
          >
            Seguimiento
          </button>
          <button
            className={`tab-btn ${vista === "tramites" ? "activa" : ""}`}
            onClick={() => setVista("tramites")}
            type="button"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Trámites extranjeros
            {tramitesPendientesExtranjeros.length > 0 ? (
              <span
                style={{
                  minWidth: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 6px",
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1,
                  background: "#ff8a80",
                  color: "#1a0b0b",
                  border: "1px solid rgba(255, 138, 128, 0.45)",
                }}
                aria-label={`${tramitesPendientesExtranjeros.length} solicitudes pendientes`}
                title={`${tramitesPendientesExtranjeros.length} solicitudes pendientes`}
              >
                {tramitesPendientesExtranjeros.length}
              </span>
            ) : null}
          </button>
          <button
            className={`tab-btn ${vista === "tramites_locales" ? "activa" : ""}`}
            onClick={() => setVista("tramites_locales")}
            type="button"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Trámites locales
            {tramitesPendientesLocales.length > 0 ? (
              <span
                style={{
                  minWidth: 22,
                  height: 22,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 6px",
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1,
                  background: "#ff8a80",
                  color: "#1a0b0b",
                  border: "1px solid rgba(255, 138, 128, 0.45)",
                }}
                aria-label={`${tramitesPendientesLocales.length} trámites locales pendientes`}
                title={`${tramitesPendientesLocales.length} trámites locales pendientes`}
              >
                {tramitesPendientesLocales.length}
              </span>
            ) : null}
          </button>
        </div>
      </RevealOnScroll>

      <BloqueAccesoRol wallet={wallet} rolEsperado="MINISTERIO" rolActual={rolActual} rolesDisponibles={rolesDisponibles} />

      {mensaje ? (
        <section className="grilla" style={{ marginTop: 12 }}>
          <div className="panel"><span className="estado estado-proceso">{mensaje}</span></div>
        </section>
      ) : null}

      {wallet && accesoMinisterio && vista === "operaciones" ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <RevealOnScroll className="panel col-12" delay={90}>
            <h2>Solicitudes de lote pendientes</h2>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Universidad</th>
                  <th>Carrera</th>
                  <th>Cantidad</th>
                  <th>Detalle</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {lotesPendientes.map((item) => (
                  <tr key={item.id}>
                    <td className="celda-id-larga" title={item.id}>{idCorto(item.id)}</td>
                    <td>{item.universidad}</td>
                    <td>{item.carrera}</td>
                    <td>{item.cantidadEgresados}</td>
                    <td>
                      <button className="boton boton-xs" onClick={() => abrirDetalle("lote", item)}>
                        Ver detalle
                      </button>
                    </td>
                    <td className="celda-acciones">
                      <div className="acciones-tabla acciones-tabla-dobles">
                        <button className="boton boton-xs" onClick={() => resolverLote(item.id, "aprobar")}>Aprobar</button>
                        <button className="boton boton-xs" onClick={() => abrirRechazo("lote", item.id)}>Rechazar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {lotesPendientes.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--texto-secundario)" }}>
                      No hay solicitudes pendientes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </RevealOnScroll>
        </section>
      ) : null}

      {wallet && accesoMinisterio && vista === "tramites" ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <RevealOnScroll className="panel col-12" delay={90}>
            <h2>Trámites extranjeros pendientes</h2>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Titular</th>
                  <th>Pais</th>
                  <th>Analítico PDF</th>
                  <th>Detalle</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {tramitesPendientesExtranjeros.map((item) => (
                  <tr key={item.id}>
                    <td className="celda-id-larga" title={item.id}>{idCorto(item.id)}</td>
                    <td>{item.titular.nombre} {item.titular.apellido}</td>
                    <td>{item.paisOrigen}</td>
                    <td>
                      {item.analiticoPdfUrl ? (
                        <a className="boton boton-xs" href={item.analiticoPdfUrl} target="_blank" rel="noreferrer">
                          Ver PDF
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <button className="boton boton-xs" onClick={() => abrirDetalle("tramite", item)}>
                        Ver detalle
                      </button>
                    </td>
                    <td className="celda-acciones">
                      <div className="acciones-tabla acciones-tabla-dobles">
                        <button className="boton boton-xs" onClick={() => resolverTramite(item.id, "enviar_cancilleria")}>Enviar a Cancillería</button>
                        <button className="boton boton-xs" onClick={() => abrirRechazo("tramite", item.id)}>Rechazar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tramitesPendientesExtranjeros.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--texto-secundario)" }}>
                      No hay trámites pendientes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </RevealOnScroll>
        </section>
      ) : null}

      {wallet && accesoMinisterio && vista === "tramites_locales" ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <RevealOnScroll className="panel col-12" delay={90}>
            <h2>Trámites locales pendientes (Argentina)</h2>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Titular</th>
                  <th>Pais</th>
                  <th>Analítico PDF</th>
                  <th>Detalle</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {tramitesPendientesLocales.map((item) => (
                  <tr key={item.id}>
                    <td className="celda-id-larga" title={item.id}>{idCorto(item.id)}</td>
                    <td>{item.titular.nombre} {item.titular.apellido}</td>
                    <td>{item.paisOrigen}</td>
                    <td>
                      {item.analiticoPdfUrl ? (
                        <a className="boton boton-xs" href={item.analiticoPdfUrl} target="_blank" rel="noreferrer">
                          Ver PDF
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <button className="boton boton-xs" onClick={() => abrirDetalle("tramite", item)}>
                        Ver detalle
                      </button>
                    </td>
                    <td className="celda-acciones">
                      <div className="acciones-tabla acciones-tabla-dobles">
                        <button className="boton boton-xs" onClick={() => resolverTramite(item.id, "enviar_cancilleria")}>Certificar título</button>
                        <button className="boton boton-xs" onClick={() => abrirRechazo("tramite", item.id)}>Rechazar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tramitesPendientesLocales.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--texto-secundario)" }}>
                      No hay trámites locales pendientes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </RevealOnScroll>
        </section>
      ) : null}

      {wallet && accesoMinisterio && vista === "seguimiento" ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <RevealOnScroll className="panel col-12" delay={90}>
            <div className="tabs" style={{ marginTop: 0 }}>
              <button
                className={`tab-btn ${seguimientoVista === "lotes" ? "activa" : ""}`}
                onClick={() => setSeguimientoVista("lotes")}
                type="button"
              >
                Seguimiento de solicitudes de lote
              </button>
              <button
                className={`tab-btn ${seguimientoVista === "tramites" ? "activa" : ""}`}
                onClick={() => setSeguimientoVista("tramites")}
                type="button"
              >
                Seguimiento de trámites extranjeros
              </button>
            </div>
          </RevealOnScroll>

          {seguimientoVista === "lotes" ? (
          <RevealOnScroll className="panel col-12" delay={110}>
            <h2>Seguimiento de solicitudes de lote</h2>
            <div className="filtros-grid">
              <div className="filtro-item campo">
                <label>Estado</label>
                <select
                  value={filtroLotes.estado}
                  onChange={(e) => setFiltroLotes((v) => ({ ...v, estado: e.target.value }))}
                >
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="aprobada">Aprobada</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>
              <div className="filtro-item campo" style={{ gridColumn: "span 8" }}>
                <label>Busqueda</label>
                <input
                  value={filtroLotes.q}
                  onChange={(e) => setFiltroLotes((v) => ({ ...v, q: e.target.value }))}
                  placeholder="ID, universidad, carrera, wallet o solicitante"
                />
              </div>
            </div>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Universidad</th>
                  <th>Solicitante</th>
                  <th>Carrera</th>
                  <th>Cantidad</th>
                  <th>Estado</th>
                  <th>Resuelto por</th>
                  <th>Fecha</th>
                  <th>Motivo</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {lotesFiltrados.map((item) => (
                  <tr key={item.id}>
                    <td className="celda-id-larga" title={item.id}>{idCorto(item.id)}</td>
                    <td>{item.universidad}</td>
                    <td>
                      {item.solicitanteNombre || "-"}
                      <div style={{ color: "var(--texto-secundario)", fontSize: 12 }}>
                        {idCorto(item.walletUniversidad)}
                      </div>
                    </td>
                    <td>{item.carrera}</td>
                    <td>{item.cantidadEgresados}</td>
                    <td>{item.estado}</td>
                    <td>{item.resueltoNombre || "-"}</td>
                    <td>{formatearFechaHora(item.fechaResolucion || item.fechaSolicitud)}</td>
                    <td>{item.motivoResolucion || "-"}</td>
                    <td>
                      <button className="boton boton-xs" onClick={() => abrirDetalle("lote", item)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RevealOnScroll>
          ) : null}

          {seguimientoVista === "tramites" ? (
          <RevealOnScroll className="panel col-12" delay={110}>
            <h2>Seguimiento de trámites extranjeros</h2>
            <div className="filtros-grid">
              <div className="filtro-item campo">
                <label>Estado</label>
                <select
                  value={filtroTramites.estado}
                  onChange={(e) => setFiltroTramites((v) => ({ ...v, estado: e.target.value }))}
                >
                  <option value="">Todos</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="en_cancilleria">En cancillería</option>
                  <option value="finalizada">Finalizada</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>
              <div className="filtro-item campo" style={{ gridColumn: "span 8" }}>
                <label>Busqueda</label>
                <input
                  value={filtroTramites.q}
                  onChange={(e) => setFiltroTramites((v) => ({ ...v, q: e.target.value }))}
                  placeholder="ID, titular o país"
                />
              </div>
            </div>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Titular</th>
                  <th>Estado</th>
                  <th>Analítico PDF</th>
                  <th>Resuelto por</th>
                  <th>Fecha</th>
                  <th>Motivo</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {tramitesFiltrados.map((item) => (
                  <tr key={item.id}>
                    <td className="celda-id-larga" title={item.id}>{idCorto(item.id)}</td>
                    <td>{item.titular.nombre} {item.titular.apellido}</td>
                    <td>{item.estado}</td>
                    <td>
                      {item.analiticoPdfUrl ? (
                        <a className="boton boton-xs" href={item.analiticoPdfUrl} target="_blank" rel="noreferrer">
                          Ver PDF
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{item.resueltoNombre || "-"}</td>
                    <td>{formatearFechaHora(item.fechaResolucion || item.fechaSolicitud)}</td>
                    <td>{item.motivoResolucion || "-"}</td>
                    <td>
                      <button className="boton boton-xs" onClick={() => abrirDetalle("tramite", item)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RevealOnScroll>
          ) : null}
        </section>
      ) : null}

      {detalle.abierto ? (
        <div className="modal-fondo" role="dialog" aria-modal="true">
          <div className="modal-panel">
            {(() => {
              const esTramiteExtranjero = detalle.tipo === "tramite";
              return (
                <>
            <h3>
              {detalle.tipo === "lote"
                ? "Detalle de solicitud de lote"
                : "Detalle de trámite extranjero"}
            </h3>
            <div className="campo"><label>ID</label><div>{detalle.data?.id || "-"}</div></div>
            <div className="campo"><label>Solicitante</label><div>{detalle.data?.solicitanteNombre || "-"}</div></div>
            <div className="campo"><label>Email solicitante</label><div>{detalle.data?.solicitanteEmail || "-"}</div></div>
            {!esTramiteExtranjero ? (
              <>
                <div className="campo"><label>Universidad</label><div>{detalle.data?.universidad || "-"}</div></div>
                <div className="campo"><label>Carrera/Título</label><div>{detalle.data?.carrera || detalle.data?.tituloOriginal || "-"}</div></div>
                <div className="campo"><label>Plan de estudio</label><div>{detalle.data?.planEstudio || "-"}</div></div>
                <div className="campo"><label>Matrícula</label><div>{detalle.data?.matricula || "-"}</div></div>
                <div className="campo"><label>Año</label><div>{detalle.data?.anio || "-"}</div></div>
                <div className="campo"><label>Cantidad</label><div>{detalle.data?.cantidadEgresados || "-"}</div></div>
              </>
            ) : null}
            <div className="campo"><label>Fecha solicitud</label><div>{formatearFechaHora(detalle.data?.fechaSolicitud)}</div></div>
            {detalle.data?.fechaResolucion ? (
              <div className="campo"><label>Fecha resolución</label><div>{formatearFechaHora(detalle.data?.fechaResolucion)}</div></div>
            ) : null}
            {esTramiteExtranjero ? (
              <>
                <div className="campo"><label>País origen</label><div>{detalle.data?.paisOrigen || "-"}</div></div>
                <div className="campo"><label>Universidad origen</label><div>{detalle.data?.universidadOrigen || "-"}</div></div>
                <div className="campo"><label>Título original</label><div>{detalle.data?.tituloOriginal || "-"}</div></div>
                <div className="campo"><label>Analítico original</label><div>{detalle.data?.analiticoOriginal || "-"}</div></div>
              </>
            ) : null}
            <div className="campo"><label>Estado</label><div>{detalle.data?.estado || "-"}</div></div>
            <div className="campo"><label>Autorizado/Rechazado por</label><div>{detalle.data?.resueltoNombre || "-"}</div></div>
            <div className="campo"><label>Observaciones</label><div>{detalle.data?.motivoResolucion || "-"}</div></div>
            <div className="modal-acciones">
              {esTramiteExtranjero && detalle.data?.analiticoPdfUrl ? (
                <a
                  className="boton"
                  style={{ minWidth: 132, textAlign: "center" }}
                  href={detalle.data.analiticoPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir PDF
                </a>
              ) : null}
              <button
                className="boton"
                style={{ minWidth: 132, textAlign: "center" }}
                type="button"
                onClick={() => setDetalle({ abierto: false, tipo: "", data: null })}
              >
                Cerrar
              </button>
            </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      <MotivoRechazoModal
        abierto={modalRechazo.abierto}
        titulo={modalRechazo.titulo}
        etiqueta="Motivo"
        placeholder="Detalle el motivo para dejar trazabilidad del rechazo"
        onCancelar={() => setModalRechazo({ abierto: false, tipo: "", id: "", titulo: "" })}
        onConfirmar={confirmarRechazo}
      />
    </main>
  );
}
