"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import RevealOnScroll from "../components/RevealOnScroll";
import BloqueAccesoRol from "../components/BloqueAccesoRol";
import { useWalletSesion } from "../lib/cliente/wallet";
import { solicitarLoteFirmadoDesdeBackpack } from "../lib/cliente/lotes_firmados";
import { urlVerificacionRegistro } from "../lib/cliente/verificacion_url";
import { obtenerBackpackProvider } from "../lib/cliente/wallet";
import * as anchor from "@coral-xyz/anchor";
import { formatearFechaHora } from "../lib/cliente/fechas";

export default function UniversidadPage() {
  const { wallet } = useWalletSesion();
  const [rolActual, setRolActual] = useState("");
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const MAX_CARRERA_LEN = 128;
  const [formSolicitud, setFormSolicitud] = useState({
    universidad: "",
    carrera: "",
    planEstudio: "",
    matricula: "",
    anio: "",
    cantidadEgresados: "",
  });
  const [errorCarrera, setErrorCarrera] = useState("");
  const [formAsignacion, setFormAsignacion] = useState({
    loteId: "",
    nombre: "",
    apellido: "",
    cuitCuil: "",
    promedio: "",
  });
  const [lotes, setLotes] = useState([]);
  const [solicitudesLote, setSolicitudesLote] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [vista, setVista] = useState("operaciones");
  const [operacionesVista, setOperacionesVista] = useState("lotes");
  const [universidadRegistrada, setUniversidadRegistrada] = useState("");
  const [filtroSeguimiento, setFiltroSeguimiento] = useState({ estado: "", q: "" });
  const [detalleSolicitud, setDetalleSolicitud] = useState(null);

  async function cargarEstado() {
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
    if (!roles.includes("UNIVERSIDAD")) return;

    const perfilResp = await fetch(`/api/roles/perfil?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" });
    const perfilPayload = await perfilResp.json();
    const entidad = String(perfilPayload?.data?.entidadRegistrada || "").trim();
    setUniversidadRegistrada(entidad);
    if (entidad) {
      setFormSolicitud((v) => ({ ...v, universidad: entidad }));
    }

    const [lotesResp, solicitudesResp] = await Promise.all([
      fetch(`/api/lotes/universidad?walletUniversidad=${encodeURIComponent(wallet)}`, {
        cache: "no-store",
      }),
      fetch(`/api/lotes/universidad/solicitudes?walletUniversidad=${encodeURIComponent(wallet)}`, {
        cache: "no-store",
      }),
    ]);
    const lotesPayload = await lotesResp.json();
    const solicitudesPayload = await solicitudesResp.json();
    const lotesData = lotesPayload.data || [];
    setLotes(lotesData);
    setSolicitudesLote(solicitudesPayload.data || []);
    if (lotesData.length > 0 && !formAsignacion.loteId) {
      setFormAsignacion((v) => ({ ...v, loteId: lotesData[0].id }));
    }
  }

  useEffect(() => {
    cargarEstado();
  }, [wallet]);

  const urlVerificacion = useMemo(() => {
    if (!resultado) return "";
    return urlVerificacionRegistro(resultado.codigoRegistro);
  }, [resultado]);

  const solicitudesFiltradas = useMemo(() => {
    const q = String(filtroSeguimiento.q || "").trim().toLowerCase();
    return solicitudesLote.filter((item) => {
      const okEstado = !filtroSeguimiento.estado || item.estado === filtroSeguimiento.estado;
      const okQ =
        !q ||
        item.id.toLowerCase().includes(q) ||
        String(item.carrera || "").toLowerCase().includes(q) ||
        String(item.universidad || "").toLowerCase().includes(q) ||
        String(item.walletUniversidad || "").toLowerCase().includes(q) ||
        String(item.solicitanteNombre || "").toLowerCase().includes(q);
      return okEstado && okQ;
    });
  }, [solicitudesLote, filtroSeguimiento]);

  const accesoUniversidad = rolesDisponibles.includes("UNIVERSIDAD") || rolActual === "UNIVERSIDAD";

  function idCorto(valor) {
    const raw = String(valor || "").trim();
    if (raw.length <= 7) return raw;
    return `${raw.slice(0, 3)}...${raw.slice(-3)}`;
  }

  async function solicitarLote(event) {
    event.preventDefault();
    setMensaje("");
    setError("");

    if (!universidadRegistrada) {
      setError("No se puede solicitar lote: la wallet no tiene una universidad registrada/aprobada.");
      return;
    }

    const payload = await solicitarLoteFirmadoDesdeBackpack({
      walletUniversidad: wallet,
      ...formSolicitud,
      universidad: universidadRegistrada || formSolicitud.universidad,
      anio: Number(formSolicitud.anio),
      cantidadEgresados: Number(formSolicitud.cantidadEgresados),
    });

    if (!payload.ok) {
      setError(payload.error || "No se pudo cursar la solicitud de lote.");
      return;
    }

    setMensaje("Solicitud enviada al ministerio para generación de lote.");
    await cargarEstado();
  }

  async function asignarToken(event) {
    event.preventDefault();
    setError("");
    setMensaje("");
    setResultado(null);

    // 1. Llamar al endpoint backend para obtener la transacción serializada
    const resp = await fetch("/api/certifications/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletUniversidad: wallet,
        ...formAsignacion,
        promedio: Number(formAsignacion.promedio),
      }),
    });
    const payload = await resp.json();
    if (!payload.ok || !payload.tx) {
      setError(payload.error || "No se pudo preparar la transacción de asignación.");
      return;
    }

    // 2. Deserializar y firmar con Backpack
    try {
      const provider = obtenerBackpackProvider();
      if (!provider) throw new Error("No se detectó Backpack en el navegador");
      await provider.connect({ onlyIfTrusted: false });
      const connection = new anchor.web3.Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "http://127.0.0.1:8899", "confirmed");
      const tx = anchor.web3.Transaction.from(Buffer.from(payload.tx, "base64"));
      tx.feePayer = provider.publicKey;
      // Firmar y enviar
      const signed = await provider.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      // 3. Mostrar resultado y QR
      const codigoRegistro = payload.codigoRegistro;
      const url = urlVerificacionRegistro(codigoRegistro);
      let qrDataUrl = "";
      try {
        qrDataUrl = await QRCode.toDataURL(url, {
          margin: 1,
          color: { dark: "#0F1D34", light: "#F2F7FF" },
          width: 220,
        });
      } catch {}

      setResultado({
        codigoRegistro,
        qrDataUrl,
        tokenCarreraId: payload.tokenCarreraId,
        txAssign: sig,
      });
      setMensaje("Token de carrera transferido al egresado correctamente.");
      await cargarEstado();
    } catch (e) {
      setError(e.message || "Error al firmar o enviar la transacción");
    }
  }

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48 }}>
      <RevealOnScroll className="panel" delay={40}>
        <h1>Portal de universidad</h1>
        <p style={{ color: "var(--texto-secundario)" }}>
          Solicita lotes al ministerio y asigna tokens de carrera a egresados con QR verificable.
        </p>
        <div className="tabs">
          <button
            className={`tab-btn ${vista === "operaciones" ? "activa" : ""}`}
            onClick={() => setVista("operaciones")}
            type="button"
          >
            Operaciones
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

      <BloqueAccesoRol wallet={wallet} rolEsperado="UNIVERSIDAD" rolActual={rolActual} rolesDisponibles={rolesDisponibles} />

      {mensaje ? (
        <section className="grilla" style={{ marginTop: 12 }}>
          <div className="panel">
            <span className="estado estado-ok">{mensaje}</span>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="grilla" style={{ marginTop: 12 }}>
          <div className="panel">
            <span className="estado" style={{ color: "var(--error)", borderColor: "rgba(255,138,128,0.5)" }}>
              {error}
            </span>
          </div>
        </section>
      ) : null}

      {wallet && accesoUniversidad && vista === "operaciones" ? (
        <section className="grilla" style={{ marginTop: 12 }}>
          <div className="panel">
            <div className="tabs" style={{ marginTop: 0, marginBottom: 0 }}>
              <button
                className={`tab-btn ${operacionesVista === "lotes" ? "activa" : ""}`}
                onClick={() => setOperacionesVista("lotes")}
                type="button"
              >
                Solicitud y lotes
              </button>
              <button
                className={`tab-btn ${operacionesVista === "transferencia" ? "activa" : ""}`}
                onClick={() => setOperacionesVista("transferencia")}
                type="button"
              >
                Transferencia al egresado
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {wallet && accesoUniversidad && vista === "operaciones" && operacionesVista === "lotes" ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <RevealOnScroll className="panel col-6" delay={90}>
            <h2>Solicitud de lote al ministerio</h2>
            <form onSubmit={solicitarLote}>
              <div className="campo">
                <label>Universidad (según registro de la wallet)</label>
                <input
                  required
                  value={formSolicitud.universidad}
                  readOnly
                  disabled
                />
              </div>
              {!universidadRegistrada ? (
                <p style={{ color: "var(--texto-secundario)" }}>
                  No se pudo derivar la universidad desde el registro aprobado de esta wallet.
                </p>
              ) : null}
              <div className="campo">
                <label>Carrera</label>
                <input
                  required
                  maxLength={MAX_CARRERA_LEN}
                  value={formSolicitud.carrera}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length > MAX_CARRERA_LEN) {
                      setErrorCarrera(`La carrera no puede superar ${MAX_CARRERA_LEN} caracteres.`);
                    } else {
                      setErrorCarrera("");
                    }
                    setFormSolicitud((v) => ({ ...v, carrera: value.slice(0, MAX_CARRERA_LEN) }));
                  }}
                />
                {errorCarrera && (
                  <span style={{ color: "var(--error)", fontSize: 13 }}>{errorCarrera}</span>
                )}
              </div>
              <div className="campo"><label>Plan de estudio</label><input required value={formSolicitud.planEstudio} onChange={(e) => setFormSolicitud((v) => ({ ...v, planEstudio: e.target.value }))} /></div>
              <div className="campo"><label>Resolución ministerial que avala la carrera</label><input required placeholder="Ej: Res. ME 1234/2022" value={formSolicitud.matricula} onChange={(e) => setFormSolicitud((v) => ({ ...v, matricula: e.target.value }))} /></div>
              <div className="campo"><label>Año</label><input required value={formSolicitud.anio} onChange={(e) => setFormSolicitud((v) => ({ ...v, anio: e.target.value }))} /></div>
              <div className="campo"><label>Cantidad de egresados</label><input required value={formSolicitud.cantidadEgresados} onChange={(e) => setFormSolicitud((v) => ({ ...v, cantidadEgresados: e.target.value }))} /></div>
              <button className="boton" type="submit">Solicitar lote</button>
            </form>
          </RevealOnScroll>

          <RevealOnScroll className="panel col-6" delay={120}>
            <h2>Lotes recibidos del ministerio</h2>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Carrera</th>
                  <th>Progreso</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((lote) => {
                  const total = Number(lote.cantidadTotal || 0);
                  const disponible = Number(lote.cantidadDisponible || 0);
                  const asignados = total - disponible;
                  const pct = total > 0 ? Math.round((asignados / total) * 100) : 0;
                  return (
                    <tr key={lote.id}>
                      <td>{lote.id}</td>
                      <td>{lote.carrera}</td>
                      <td>
                        <div style={{ minWidth: 140 }}>
                          <div style={{
                            height: 16,
                            borderRadius: 8,
                            background: "#e3eaf7",
                            overflow: "hidden",
                            border: "1px solid #b6c6e3",
                            position: "relative"
                          }}>
                            <div style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, #4f8cff 0%, #1e3a8a 100%)",
                              transition: "width 0.5s cubic-bezier(.4,2,.6,1)",
                              borderRadius: 8,
                            }} />
                            <span style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: 600,
                              color: pct > 60 ? "#fff" : "#1e3a8a",
                              textShadow: pct > 60 ? "0 1px 2px #1e3a8a55" : "none",
                              pointerEvents: "none"
                            }}>{disponible} / {total}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </RevealOnScroll>
        </section>
      ) : null}

      {wallet && accesoUniversidad && vista === "operaciones" && operacionesVista === "transferencia" ? (
      <section className="grilla" style={{ marginTop: 16 }}>
        <RevealOnScroll className="panel col-7" delay={90}>
          <h2>Transferir token de carrera al egresado</h2>
          <form onSubmit={asignarToken}>
            <div className="campo">
              <label>Lote</label>
              <select value={formAsignacion.loteId} onChange={(e) => setFormAsignacion((v) => ({ ...v, loteId: e.target.value }))}>
                {lotes.map((lote) => (
                  <option key={lote.id} value={lote.id}>{`${lote.id} - ${lote.carrera}`}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Nombre</label>
              <input required value={formAsignacion.nombre} onChange={(e) => setFormAsignacion((v) => ({ ...v, nombre: e.target.value }))} />
            </div>
            <div className="campo">
              <label>Apellido</label>
              <input required value={formAsignacion.apellido} onChange={(e) => setFormAsignacion((v) => ({ ...v, apellido: e.target.value }))} />
            </div>
            <div className="campo">
              <label>CUIT/CUIL</label>
              <input required value={formAsignacion.cuitCuil} onChange={(e) => setFormAsignacion((v) => ({ ...v, cuitCuil: e.target.value }))} />
            </div>
            <div className="campo"><label>Promedio de egreso (0 a 10)</label><input required value={formAsignacion.promedio} onChange={(e) => setFormAsignacion((v) => ({ ...v, promedio: e.target.value }))} /></div>
            <button className="boton" type="submit">
              Transferir token
            </button>
          </form>
        </RevealOnScroll>

        <RevealOnScroll className="panel col-5" delay={130}>
          <h2>Resultado de transferencia</h2>
          {!resultado ? (
            <p style={{ color: "var(--texto-secundario)" }}>
              Al transferir el token se mostrará código de registro y QR del proceso final.
            </p>
          ) : (
            <div>
              <p>
                <strong>Código de registro:</strong> {resultado.codigoRegistro}
              </p>
              <p><strong>Token:</strong> {resultado.tokenCarreraId}</p>
              {resultado.txAssign ? (
                <p style={{ color: "var(--texto-secundario)", wordBreak: "break-all" }}>
                  <strong>Tx asignación on-chain:</strong> {resultado.txAssign}
                </p>
              ) : null}
              <p style={{ color: "var(--texto-secundario)", wordBreak: "break-all" }}>
                <strong>URL de verificación:</strong> {urlVerificacion}
              </p>
              <img
                src={resultado.qrDataUrl}
                alt="Código QR de verificación"
                style={{ width: 220, borderRadius: 12, border: "1px solid #2a456f", background: "#fff" }}
              />
            </div>
          )}
        </RevealOnScroll>
      </section>
      ) : null}

      {wallet && accesoUniversidad && vista === "seguimiento" ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <RevealOnScroll className="panel col-12" delay={90}>
            <h2>Seguimiento de solicitudes al ministerio</h2>
            <div className="filtros-grid">
              <div className="filtro-item campo">
                <label>Estado</label>
                <select
                  value={filtroSeguimiento.estado}
                  onChange={(e) => setFiltroSeguimiento((v) => ({ ...v, estado: e.target.value }))}
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
                  value={filtroSeguimiento.q}
                  onChange={(e) => setFiltroSeguimiento((v) => ({ ...v, q: e.target.value }))}
                  placeholder="ID, universidad, carrera, wallet o solicitante"
                />
              </div>
            </div>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Solicitante</th>
                  <th>Carrera</th>
                  <th>Cantidad</th>
                  <th>Estado</th>
                  <th>Resuelto por</th>
                  <th>Motivo</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {solicitudesFiltradas.map((item) => (
                  <tr key={item.id}>
                    <td className="celda-id-larga" title={item.id}>{idCorto(item.id)}</td>
                    <td>{formatearFechaHora(item.fechaSolicitud)}</td>
                    <td>
                      {item.solicitanteNombre || "-"}
                    </td>
                    <td>{item.carrera}</td>
                    <td>{item.cantidadEgresados}</td>
                    <td>{item.estado}</td>
                    <td>{item.resueltoNombre || "-"}</td>
                    <td>{item.motivoResolucion || "-"}</td>
                    <td>
                      <button className="boton boton-xs" onClick={() => setDetalleSolicitud(item)}>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
                {solicitudesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ color: "var(--texto-secundario)" }}>
                      No hay resultados para los filtros indicados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </RevealOnScroll>
        </section>
      ) : null}

      {detalleSolicitud ? (
        <div className="modal-fondo" role="dialog" aria-modal="true">
          <div className="modal-panel">
            <h3>Detalle de solicitud al ministerio</h3>
            <div className="campo"><label>ID</label><div>{detalleSolicitud.id || "-"}</div></div>
            <div className="campo"><label>Universidad</label><div>{detalleSolicitud.universidad || "-"}</div></div>
            <div className="campo"><label>Solicitante</label><div>{detalleSolicitud.solicitanteNombre || "-"}</div></div>
            <div className="campo"><label>Email solicitante</label><div>{detalleSolicitud.solicitanteEmail || "-"}</div></div>
            <div className="campo"><label>Carrera/Título</label><div>{detalleSolicitud.carrera || "-"}</div></div>
            <div className="campo"><label>Plan de estudio</label><div>{detalleSolicitud.planEstudio || "-"}</div></div>
            <div className="campo"><label>Matrícula</label><div>{detalleSolicitud.matricula || "-"}</div></div>
            <div className="campo"><label>Año</label><div>{detalleSolicitud.anio || "-"}</div></div>
            <div className="campo"><label>Cantidad egresados</label><div>{detalleSolicitud.cantidadEgresados || "-"}</div></div>
            <div className="campo"><label>Estado</label><div>{detalleSolicitud.estado || "-"}</div></div>
            <div className="campo"><label>Resuelto por</label><div>{detalleSolicitud.resueltoNombre || "-"}</div></div>
            <div className="campo"><label>Observaciones</label><div>{detalleSolicitud.motivoResolucion || "-"}</div></div>
            <div className="campo"><label>Fecha solicitud</label><div>{formatearFechaHora(detalleSolicitud.fechaSolicitud)}</div></div>
            <div className="campo"><label>Fecha resolución</label><div>{formatearFechaHora(detalleSolicitud.fechaResolucion)}</div></div>
            <div className="modal-acciones">
              <button className="boton" type="button" onClick={() => setDetalleSolicitud(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
