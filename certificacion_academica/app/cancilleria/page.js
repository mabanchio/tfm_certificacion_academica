"use client";

import { useEffect, useMemo, useState } from "react";
import RevealOnScroll from "../components/RevealOnScroll";
import BloqueAccesoRol from "../components/BloqueAccesoRol";
import MotivoRechazoModal from "../components/MotivoRechazoModal";
import { useWalletSesion } from "../lib/cliente/wallet";
import { formatearFechaHora } from "../lib/cliente/fechas";
import { resolverTramiteCancilleriaOnchainDesdeBackpack } from "../lib/cliente/tramites_onchain";

export default function CancilleriaPage() {
  const { wallet } = useWalletSesion();
  const [rolActual, setRolActual] = useState("");
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [tramites, setTramites] = useState([]);
  const [paisesAsignados, setPaisesAsignados] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [vista, setVista] = useState("operaciones");
  const [filtro, setFiltro] = useState({ estado: "", q: "" });
  const [modal, setModal] = useState({ abierto: false, id: "" });
  const [detalle, setDetalle] = useState({ abierto: false, data: null });

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
    if (!roles.includes("CANCILLERIA")) return;

    const response = await fetch(`/api/tramites/cancilleria?walletCancilleria=${encodeURIComponent(wallet)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    setTramites(payload.data || []);
    setPaisesAsignados(Array.isArray(payload.paisesAsignados) ? payload.paisesAsignados : []);
  }

  useEffect(() => {
    cargar();
  }, [wallet]);

  async function resolver(tramiteId, accion, motivo = "") {
    const payload = await resolverTramiteCancilleriaOnchainDesdeBackpack({
      walletCancilleria: wallet,
      tramiteId,
      accion,
      motivo,
    });
    setMensaje(payload.ok ? `Tramite ${accion}do en cancilleria` : payload.error || "No se pudo resolver tramite");
    await cargar();
  }

  function idCorto(valor) {
    const raw = String(valor || "").trim();
    if (raw.length <= 7) return raw;
    return `${raw.slice(0, 3)}...${raw.slice(-3)}`;
  }

  const pendientes = useMemo(
    () => tramites.filter((item) => item.estado === "en_cancilleria"),
    [tramites]
  );

  const filtrados = useMemo(() => {
    const q = String(filtro.q || "").trim().toLowerCase();
    return tramites.filter((item) => {
      const okEstado = !filtro.estado || item.estado === filtro.estado;
      const titular = `${item?.titular?.nombre || ""} ${item?.titular?.apellido || ""}`.toLowerCase();
      const okQ =
        !q ||
        item.id.toLowerCase().includes(q) ||
        titular.includes(q) ||
        String(item.paisOrigen || "").toLowerCase().includes(q);
      return okEstado && okQ;
    });
  }, [tramites, filtro]);

  const accesoCancilleria = rolesDisponibles.includes("CANCILLERIA") || rolActual === "CANCILLERIA";

  async function confirmarRechazo(motivo) {
    if (!motivo) {
      setMensaje("Debe ingresar un motivo para rechazar el trámite.");
      return;
    }
    const id = modal.id;
    setModal({ abierto: false, id: "" });
    await resolver(id, "rechazar", motivo);
  }

  function abrirDetalle(data) {
    setDetalle({ abierto: true, data });
  }

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48 }}>
      <RevealOnScroll className="panel" delay={40}>
        <h1>Panel de cancilleria</h1>
        <p style={{ color: "var(--texto-secundario)" }}>
          Recibe token ministerial, evalua apostillado por pais y fusiona token final para certificacion.
        </p>
        {paisesAsignados.length > 0 ? (
          <p style={{ color: "var(--texto-secundario)", marginTop: 4 }}>
            Paises asignados: <strong>{paisesAsignados.join(" · ")}</strong>
          </p>
        ) : (
          <p style={{ color: "#ff8a80", marginTop: 4, fontSize: 13 }}>
            Sin paises asignados — se muestran todos los tramites en cancilleria.
          </p>
        )}
        <div className="tabs">
          <button
            className={`tab-btn ${vista === "operaciones" ? "activa" : ""}`}
            onClick={() => setVista("operaciones")}
            type="button"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Operaciones
            {pendientes.length > 0 ? (
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
                aria-label={`${pendientes.length} solicitudes de apostilla pendientes`}
                title={`${pendientes.length} solicitudes de apostilla pendientes`}
              >
                {pendientes.length}
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
        </div>
      </RevealOnScroll>

      <BloqueAccesoRol wallet={wallet} rolEsperado="CANCILLERIA" rolActual={rolActual} rolesDisponibles={rolesDisponibles} />

      {mensaje ? (
        <section className="grilla" style={{ marginTop: 12 }}>
          <div className="panel"><span className="estado estado-proceso">{mensaje}</span></div>
        </section>
      ) : null}

      {wallet && accesoCancilleria && vista === "operaciones" ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <RevealOnScroll className="panel" delay={90}>
            <h2>Solicitudes de apostilla pendientes</h2>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Titular</th>
                  <th>Pais origen</th>
                  <th>Token ministerio</th>
                  <th>Detalle</th>
                  <th>Accion</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((item) => (
                  <tr key={item.id}>
                    <td className="celda-id-larga" title={item.id}>{idCorto(item.id)}</td>
                    <td>{item.titular.nombre} {item.titular.apellido}</td>
                    <td>{item.paisOrigen}</td>
                    <td>{item.tokenMinisterioId}</td>
                    <td>
                      <button className="boton boton-xs" onClick={() => abrirDetalle(item)}>
                        Ver detalle
                      </button>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="boton" onClick={() => resolver(item.id, "aprobar")}>Aprobar</button>
                        <button className="boton" onClick={() => setModal({ abierto: true, id: item.id })}>Rechazar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pendientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--texto-secundario)" }}>
                      No hay solicitudes pendientes.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </RevealOnScroll>
        </section>
      ) : null}

      {wallet && accesoCancilleria && vista === "seguimiento" ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <RevealOnScroll className="panel" delay={90}>
            <h2>Seguimiento de apostillas</h2>
            <div className="filtros-grid">
              <div className="filtro-item campo">
                <label>Estado</label>
                <select
                  value={filtro.estado}
                  onChange={(e) => setFiltro((v) => ({ ...v, estado: e.target.value }))}
                >
                  <option value="">Todos</option>
                  <option value="en_cancilleria">En cancillería</option>
                  <option value="finalizada">Finalizada</option>
                  <option value="rechazada">Rechazada</option>
                </select>
              </div>
              <div className="filtro-item campo" style={{ gridColumn: "span 8" }}>
                <label>Busqueda</label>
                <input
                  value={filtro.q}
                  onChange={(e) => setFiltro((v) => ({ ...v, q: e.target.value }))}
                  placeholder="ID, titular o país"
                />
              </div>
            </div>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Titular</th>
                  <th>Pais origen</th>
                  <th>Analítico PDF</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((item) => (
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
                    <td>{item.estado}</td>
                    <td>
                      <button className="boton boton-xs" onClick={() => abrirDetalle(item)}>
                        Ver detalle
                      </button>
                    </td>
                    <td>{item.motivoResolucion || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RevealOnScroll>
        </section>
      ) : null}

      <MotivoRechazoModal
        abierto={modal.abierto}
        titulo="Motivo del rechazo en cancillería"
        etiqueta="Motivo"
        placeholder="Detalle por qué no procede la apostilla"
        onCancelar={() => setModal({ abierto: false, id: "" })}
        onConfirmar={confirmarRechazo}
      />

      {detalle.abierto ? (
        <div className="modal-fondo" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <h3>Detalle del trámite en cancillería</h3>
            <div className="campo">
              <label>ID</label>
              <div>{detalle.data?.id || "-"}</div>
            </div>
            <div className="campo">
              <label>Titular</label>
              <div>{detalle.data?.titular?.nombre || ""} {detalle.data?.titular?.apellido || ""}</div>
            </div>
            <div className="campo">
              <label>País de origen</label>
              <div>{detalle.data?.paisOrigen || "-"}</div>
            </div>
            <div className="campo">
              <label>Enviado por Ministerio</label>
              <div>{detalle.data?.resueltoNombre || "-"}</div>
            </div>
            <div className="campo">
              <label>Fecha y hora de envío</label>
              <div>{formatearFechaHora(detalle.data?.fechaResolucion)}</div>
            </div>
            <div className="campo">
              <label>Estado actual</label>
              <div>{detalle.data?.estado || "-"}</div>
            </div>
            <div className="modal-acciones">
              {detalle.data?.analiticoPdfUrl ? (
                <a className="boton" href={detalle.data.analiticoPdfUrl} target="_blank" rel="noreferrer">
                  Abrir PDF
                </a>
              ) : null}
              <button className="boton" type="button" onClick={() => setDetalle({ abierto: false, data: null })}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
