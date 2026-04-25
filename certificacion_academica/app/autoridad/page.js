
"use client";

// Habilitar rol inactivo
async function habilitar(walletObjetivo, rol) {
  setMensaje("Procesando habilitación...");
  const { deshabilitarRolOnchainDesdeBackpack } = await import("../lib/cliente/roles_onchain");
  try {
    const payload = {
      walletAdmin: wallet,
      walletObjetivo,
      motivo: "Habilitacion administrativa",
      rol,
      habilitar: true,
    };
    const ctx = await deshabilitarRolOnchainDesdeBackpack(payload);
    setMensaje(
      ctx.ok
        ? `Rol habilitado (tx: ${String(ctx?.data?.signature || "").slice(0, 16)}...)`
        : ctx.error || "No se pudo habilitar el rol"
    );
    await cargarPanel();
  } catch (e) {
    setMensaje("Error inesperado al habilitar el rol");
  }
}

import { useEffect, useMemo, useState } from "react";
import RevealOnScroll from "../components/RevealOnScroll";
import BloqueAccesoRol from "../components/BloqueAccesoRol";
import { useWalletSesion } from "../lib/cliente/wallet";
import {
  deshabilitarRolOnchainDesdeBackpack,
  otorgarRolAdminOnchainDesdeBackpack,
  resolverSolicitudRolOnchainDesdeBackpack,
  recordAuditEntryOnchain,
} from "../lib/cliente/roles_onchain";
import { obtenerRolesOnchain } from "../lib/cliente/obtener_roles_onchain";
import { obtenerTodosLosRolesOnchain } from "../lib/cliente/obtener_todos_roles_onchain";
// Utilidad para obtener el perfil de un rol dado su wallet
async function obtenerPerfil(wallet) {
  if (!wallet) return null;
  try {
    const resp = await fetch(`/api/roles/perfil?wallet=${encodeURIComponent(wallet)}`);
    const data = await resp.json();
    if (data.ok) return data.data;
    return null;
  } catch {
    return null;
  }
}
// ...existing code...
import { WALLET_ADMIN_SISTEMA } from "../lib/config/sistema";
import { formatearFechaHora } from "../lib/cliente/fechas";

function abreviarWallet(wallet = "") {
  const limpia = String(wallet || "").trim();
  if (limpia.length <= 14) return limpia;
  return `${limpia.slice(0, 6)}...${limpia.slice(-6)}`;
}

function parseDocumentoRegistro(documentoRaw = "") {
  const raw = String(documentoRaw || "").trim();
  const dniTagged = raw.match(/DNI\s*:\s*(\d{7,8})/i);
  const cuitTagged = raw.match(/(?:CUIT|CUIL)\s*:\s*(\d{11})/i);

  if (dniTagged || cuitTagged) {
    return {
      dni: dniTagged?.[1] || "",
      cuitCuil: cuitTagged?.[1] || "",
    };
  }

  const digits = raw.replace(/[^0-9]/g, "");
  if (/^\d{11}$/.test(digits)) {
    return { dni: digits.slice(2, 10), cuitCuil: digits };
  }

  if (/^\d{7,8}$/.test(digits)) {
    return { dni: digits, cuitCuil: "" };
  }

  return { dni: "", cuitCuil: "" };
}

export default function AutoridadPage() {
  const { wallet } = useWalletSesion();
  const [rolActual, setRolActual] = useState("");
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [vista, setVista] = useState("solicitudes");
  const [solicitudes, setSolicitudes] = useState([]);
  const [rolesActivos, setRolesActivos] = useState([]);
  const [rolesInactivos, setRolesInactivos] = useState([]);
  const [emisiones, setEmisiones] = useState([]);
  const [todosRoles, setTodosRoles] = useState([]);
  const [errorRoles, setErrorRoles] = useState("");
  const [filtro, setFiltro] = useState({ desde: "", hasta: "", anio: "", universidad: "", carrera: "" });
  const [filtroSolicitudesBusqueda, setFiltroSolicitudesBusqueda] = useState("");
  const [filtroRolesBusqueda, setFiltroRolesBusqueda] = useState("");
  const [walletAdminObjetivo, setWalletAdminObjetivo] = useState("");
  const [modalAdminAbierto, setModalAdminAbierto] = useState(false);
  const [detalleSolicitudActiva, setDetalleSolicitudActiva] = useState(null);
  const [detalleRolActivo, setDetalleRolActivo] = useState(null);
  const [registroEditando, setRegistroEditando] = useState(false);
  const [registroForm, setRegistroForm] = useState({
    nombres: "",
    apellidos: "",
    dni: "",
    cuitCuil: "",
    email: "",
    entidad: "",
    rolAsignado: "",
    universidad: "",
    paises: "",
  });
  const [mensaje, setMensaje] = useState("");
  const [perfilesRoles, setPerfilesRoles] = useState({});

  // Cargar perfiles de todos los roles activos del sistema
  async function cargarPerfilesRoles(roles) {
    const wallets = Array.from(new Set((roles || []).map(r => r.wallet).filter(Boolean)));
    const perfiles = {};
    await Promise.all(wallets.map(async (wallet) => {
      const perfil = await obtenerPerfil(wallet);
      if (perfil) perfiles[wallet] = perfil;
    }));
    setPerfilesRoles(perfiles);
  }

  const accesoAdmin = useMemo(
    () => rolesDisponibles.includes("ADMIN") || rolActual === "ADMIN",
    [rolesDisponibles, rolActual]
  );

  const bloqueo = useMemo(() => {
    if (!wallet || !accesoAdmin) {
      return <BloqueAccesoRol wallet={wallet} rolEsperado="ADMIN" rolActual={rolActual} rolesDisponibles={rolesDisponibles} />;
    }
    return null;
  }, [wallet, rolActual, rolesDisponibles, accesoAdmin]);

  async function cargarPanel() {
    if (!wallet) return;

    // Leer roles activos/inactivos de la wallet actual
    const rolesOnchain = await obtenerRolesOnchain(wallet);
    if (rolesOnchain.ok) {
      const activos = rolesOnchain.roles.filter(r => r.activo);
      const inactivos = rolesOnchain.roles.filter(r => !r.activo);
      setRolesActivos(activos);
      setRolesInactivos(inactivos);
      setRolActual(activos[0]?.rol || "");
      setRolesDisponibles(activos.map(r => r.rol));
    } else {
      setRolesActivos([]);
      setRolesInactivos([]);
      setRolActual("");
      setRolesDisponibles([]);
    }

    // Si es admin, obtener todos los roles del sistema
    const rolesAdmin = rolesOnchain.ok && rolesOnchain.roles.some(r => r.rol === "ADMIN" && r.activo);

    if (rolesAdmin) {
      const todos = await obtenerTodosLosRolesOnchain();
      if (todos.ok) {
        setTodosRoles(todos.roles);
        setErrorRoles("");
        // Cargar perfiles de los roles activos
        cargarPerfilesRoles(todos.roles);
      } else {
        setTodosRoles([]);
        setErrorRoles(todos.error || "No se pudieron obtener los roles on-chain");
        setPerfilesRoles({});
      }
    } else {
      setTodosRoles([]);
      setErrorRoles("");
      setPerfilesRoles({});
    }

    // Mantener solicitudes para el panel
    if (!rolesAdmin) return;
    const [sResp] = await Promise.all([
      fetch(`/api/roles/solicitudes?walletAdmin=${encodeURIComponent(wallet)}&estado=pendiente`, { cache: "no-store" })
    ]);
    const sPayload = await sResp.json();
    setSolicitudes(sPayload.data || []);
  }
      {/* Visualización de todos los roles y su estado (solo admin) */}
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Todos los roles del sistema (on-chain)</h2>
        {errorRoles && (
          <div style={{ color: "red", marginBottom: 8 }}>Error: {errorRoles}</div>
        )}
        {todosRoles.length === 0 && !errorRoles && (
          <div style={{ color: "#888", marginBottom: 8 }}>No hay roles registrados en la blockchain.</div>
        )}
        {todosRoles.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Wallet</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Última actualización</th>
              </tr>
            </thead>
            <tbody>
              {todosRoles
                .filter(rol => rol.wallet !== "11111111111111111111111111111111")
                .map((rol, idx) => (
                  <tr key={rol.wallet + rol.rol + idx}>
                    <td style={{ fontFamily: "monospace" }}>{rol.wallet}</td>
                    <td>{rol.rol}</td>
                    <td>{rol.activo ? "Activo" : "Inactivo"}</td>
                    <td>{rol.updated_at ? new Date(rol.updated_at * 1000).toLocaleString() : "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

  useEffect(() => {
    cargarPanel();
  }, [wallet]);

  useEffect(() => {
    if (!wallet || !accesoAdmin) return;
    const timer = setInterval(() => {
      cargarPanel();
    }, 5000);
    return () => clearInterval(timer);
  }, [wallet, accesoAdmin]);

  async function resolverSolicitud(solicitudId, accion) {
    const payload = await resolverSolicitudRolOnchainDesdeBackpack({ walletAdmin: wallet, solicitudId, accion });
    setMensaje(
      payload.ok
        ? `Solicitud ${accion}da correctamente (tx: ${String(payload?.data?.signature || "").slice(0, 16)}...)`
        : payload.error || "Error al resolver solicitud"
    );
    setDetalleSolicitudActiva(null);
    await cargarPanel();
  }

  async function deshabilitar(walletObjetivo) {
    const payload = await deshabilitarRolOnchainDesdeBackpack({
      walletAdmin: wallet,
      walletObjetivo,
      motivo: "Deshabilitacion administrativa",
    });
    setMensaje(
      payload.ok
        ? `Rol deshabilitado (tx: ${String(payload?.data?.signature || "").slice(0, 16)}...)`
        : payload.error || "No se pudo deshabilitar el rol"
    );
    await cargarPanel();
  }

  async function otorgarAdmin() {
    if (wallet !== WALLET_ADMIN_SISTEMA) {
      setMensaje("Solo el administrador principal puede otorgar rol ADMIN.");
      return;
    }

    const walletObjetivo = String(walletAdminObjetivo || "").trim();
    if (!walletObjetivo) {
      setMensaje("Debe ingresar una wallet objetivo para otorgar ADMIN.");
      return;
    }

    const payload = await otorgarRolAdminOnchainDesdeBackpack({
      walletAdmin: wallet,
      walletObjetivo,
    });
    setMensaje(payload.ok ? "Rol ADMIN otorgado correctamente" : payload.error || "No se pudo otorgar rol ADMIN");
    if (payload.ok) {
      setWalletAdminObjetivo("");
      setModalAdminAbierto(false);
      await cargarPanel();
    }
  }

  function parsearNombresApellidos(registroRol) {
    // Si el override ya trae nombres/apellidos separados los usamos directamente
    if (registroRol?.nombres || registroRol?.apellidos) {
      return {
        nombres: String(registroRol.nombres || "").trim(),
        apellidos: String(registroRol.apellidos || "").trim(),
      };
    }
    const full = String(registroRol?.nombre || "").trim();
    if (full.includes(",")) {
      const parts = full.split(",");
      return { apellidos: parts[0].trim(), nombres: parts.slice(1).join(",").trim() };
    }
    const words = full.split(/\s+/);
    if (words.length >= 2) {
      return { apellidos: words.slice(1).join(" "), nombres: words[0] };
    }
    return { apellidos: full, nombres: "" };
  }

  function abrirDetalleRol(item) {
    setDetalleRolActivo(item);
    setRegistroEditando(false);
    const { nombres, apellidos } = parsearNombresApellidos(item?.registroRol);
    const doc = parseDocumentoRegistro(item?.registroRol?.documento || "");
    const paisesVal = Array.isArray(item?.registroRol?.paises)
      ? item.registroRol.paises.join(", ")
      : String(item?.registroRol?.paises || "");
    setRegistroForm({
      nombres,
      apellidos,
      dni: doc.dni || "",
      cuitCuil: doc.cuitCuil || "",
      email: String(item?.registroRol?.email || "").trim(),
      entidad: String(item?.registroRol?.entidad || "").trim(),
      rolAsignado: String(item?.rol || "").trim(),
      universidad: String(item?.registroRol?.universidad || "").trim(),
      paises: paisesVal,
    });
  }

  async function guardarEdicionRegistro() {
    if (!detalleRolActivo) return;

    const nombres = String(registroForm.nombres || "").trim();
    const apellidos = String(registroForm.apellidos || "").trim();
    const dni = String(registroForm.dni || "").replace(/[^0-9]/g, "");
    const cuitCuil = String(registroForm.cuitCuil || "").replace(/[^0-9]/g, "");
    const documento = `DNI:${dni}|CUIT:${cuitCuil}`;
    const rolAsignado = String(registroForm.rolAsignado || detalleRolActivo.rol || "").trim().toUpperCase();
    const paisesArray = String(registroForm.paises || "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    // Datos antes de cambios (para auditoría)
    const registroAnterior = detalleRolActivo.registroRol || {};
    const datosAntes = {
      nombres: registroAnterior.nombres || "",
      apellidos: registroAnterior.apellidos || "",
      rol: detalleRolActivo.rol,
      universidad: registroAnterior.universidad || "",
      paises: registroAnterior.paises || [],
    };

    // Datos después de cambios
    const datosDespues = {
      nombres,
      apellidos,
      rol: rolAsignado,
      universidad: String(registroForm.universidad || "").trim(),
      paises: paisesArray,
    };

    const payload = {
      walletAdmin: wallet,
      walletObjetivo: detalleRolActivo.wallet,
      rol: detalleRolActivo.rol,
      rolAsignado,
      nombres,
      apellidos,
      entidad: String(registroForm.entidad || "").trim(),
      documento,
      email: String(registroForm.email || "").trim(),
      universidad: String(registroForm.universidad || "").trim(),
      paises: paisesArray,
    };

    const response = await fetch("/api/roles/activos/registro", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      setMensaje(result.error || "No se pudo actualizar el registro del rol");
      return;
    }

    // Registrar auditoría on-chain
    const auditPayload = {
      walletObjetivo: detalleRolActivo.wallet,
      operationType: 1, // UpdateRegistro
      dataHashBefore: datosAntes,
      dataHashAfter: datosDespues,
    };

    const auditResult = await recordAuditEntryOnchain(auditPayload);
    const txAudit = auditResult?.data?.txHash ? ` [auditoría: ${auditResult.data.txHash}...]` : "";

    const tx = String(result?.data?.txSignature || "").slice(0, 16);
    setMensaje(`Registro actualizado y auditado en blockchain${tx ? ` (tx: ${tx}...)` : ""}${txAudit}`);
    setRegistroEditando(false);
    await cargarPanel();
    const rolFinal = result?.data?.rol || rolAsignado;
    setDetalleRolActivo((prev) =>
      prev
        ? {
            ...prev,
            rol: rolFinal,
            registroRol: {
              ...(prev.registroRol || {}),
              ...(result?.data?.registroRol || {}),
            },
          }
        : prev
    );
  }

  async function buscarEmisiones(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    params.set("wallet", wallet);
    if (filtro.desde) params.set("desde", filtro.desde);
    if (filtro.hasta) params.set("hasta", filtro.hasta);
    if (filtro.anio) params.set("anio", filtro.anio);
    if (filtro.universidad) params.set("universidad", filtro.universidad);
    if (filtro.carrera) params.set("carrera", filtro.carrera);

    const response = await fetch(`/api/emisiones?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setMensaje(payload.error || "No se pudo filtrar emisiones");
      return;
    }
    setEmisiones(payload.data || []);
  }

  function obtenerDatosSolicitud(item) {
    const identificacion = String(item?.identificacion?.nombre || "").trim();
    const entidad = String(item?.identificacion?.entidad || "").trim();
    const documento = parseDocumentoRegistro(item?.identificacion?.documento || "");

    return {
      identificacion,
      institucion: entidad,
      dni: documento.dni || "-",
    };
  }

  const solicitudesPendientes = useMemo(() => solicitudes.filter((item) => item.estado === "pendiente"), [solicitudes]);

  const solicitudesPendientesFiltradas = useMemo(() => {
    const q = String(filtroSolicitudesBusqueda || "").trim().toLowerCase();
    if (!q) return solicitudesPendientes;

    return solicitudesPendientes.filter((item) => {
      const datos = obtenerDatosSolicitud(item);
      const texto = [
        datos.identificacion,
        datos.dni,
        datos.institucion,
      ]
        .join(" ")
        .toLowerCase();

      return texto.includes(q);
    });
  }, [solicitudesPendientes, filtroSolicitudesBusqueda]);

  function obtenerDatosPersonaRegistro(item) {
    const nombreCompleto = String(item?.registroRol?.nombre || "").trim();
    const tieneSeparador = nombreCompleto.includes(",");
    const apellido = tieneSeparador
      ? String(nombreCompleto.split(",")[0] || "").trim() || "-"
      : String(nombreCompleto.split(/\s+/).slice(1).join(" ") || "").trim() || "-";
    const nombre = tieneSeparador
      ? String(nombreCompleto.split(",").slice(1).join(",") || "").trim() || "-"
      : String(nombreCompleto.split(/\s+/)[0] || "").trim() || "-";
    const doc = parseDocumentoRegistro(item?.registroRol?.documento || "");
    const dni = doc.dni || "-";

    return {
      nombre,
      apellido,
      dni,
      cuitCuil: doc.cuitCuil || "",
      nombreCompleto,
      entidad: String(item?.registroRol?.entidad || "").trim(),
      email: String(item?.registroRol?.email || "").trim(),
    };
  }

  // Mostrar todos los roles activos del sistema (no solo los de la wallet actual)
  const rolesActivosFiltrados = useMemo(() => {
    const activosSistema = todosRoles.filter(r => r.activo);
    const q = String(filtroRolesBusqueda || "").trim().toLowerCase();
    if (!q) return activosSistema;

    return activosSistema.filter((item) => {
      // Si tienes datos extendidos de registro, puedes agregarlos aquí
      const texto = [
        String(item.wallet || ""),
        String(item.rol || ""),
        item.updated_at ? new Date(item.updated_at * 1000).toLocaleString() : "-"
      ]
        .join(" ")
        .toLowerCase();
      return texto.includes(q);
    });
  }, [todosRoles, filtroRolesBusqueda]);

  function mostrarEntidadDetalle(item) {
    const valor = String(item?.registroRol?.entidad || "").trim();
    if (!valor) return "-";
    if (item?.rol === "EGRESADO" && valor === "NO_APLICA_EGRESADO") {
      return "No aplica (egresado)";
    }
    return valor;
  }

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48 }}>
      <RevealOnScroll className="panel" delay={40}>
        <h1>Panel de administrador</h1>
        <p style={{ color: "var(--texto-secundario)" }}>
          Alta y control de roles, seguimiento de emisiones y acceso exclusivo a metricas operativas.
        </p>
        <p style={{ color: "var(--texto-secundario)", marginTop: 10, display: "none" }}>
          Wallet administradora principal: <strong>{WALLET_ADMIN_SISTEMA}</strong>
        </p>
        <p style={{ color: "var(--texto-secundario)", marginTop: 10, display: "none" }}>
          Wallet en sesion: <strong>{wallet || "sin definir"}</strong>
        </p>
        <div className="tabs" style={{ marginTop: 12 }}>
          <button
            className={`tab-btn ${vista === "solicitudes" ? "activa" : ""}`}
            onClick={() => setVista("solicitudes")}
            type="button"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 184, height: 40 }}
          >
            Solicitudes de rol
            {solicitudesPendientes.length > 0 ? (
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
                aria-label={`${solicitudesPendientes.length} solicitudes de rol pendientes`}
                title={`${solicitudesPendientes.length} solicitudes de rol pendientes`}
              >
                {solicitudesPendientes.length}
              </span>
            ) : null}
          </button>
          <button
            className={`tab-btn ${vista === "roles" ? "activa" : ""}`}
            onClick={() => setVista("roles")}
            type="button"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 184, height: 40 }}
          >
            Roles del sistema
          </button>
          <button
            className={`tab-btn ${vista === "emisiones" ? "activa" : ""}`}
            onClick={() => setVista("emisiones")}
            type="button"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 184, height: 40 }}
          >
            Emisiones
          </button>
          <button
            className="tab-btn"
            type="button"
            onClick={() => setModalAdminAbierto(true)}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 184, height: 40 }}
          >
            Otorgar rol ADMIN
          </button>
        </div>
      </RevealOnScroll>

      {bloqueo}

      {wallet && accesoAdmin ? (
        <>
          {mensaje ? (
            <section className="grilla" style={{ marginTop: 12 }}>
              <div className="panel">
                <span className="estado estado-proceso">{mensaje}</span>
              </div>
            </section>
          ) : null}

          {vista === "solicitudes" ? (
            <section className="grilla" style={{ marginTop: 16 }}>
              <RevealOnScroll className="panel col-12" delay={80}>
              <h2>Solicitudes de rol pendientes</h2>
              <p style={{ color: "var(--texto-secundario)", marginBottom: 12 }}>
                Pendientes actuales: {solicitudesPendientes.length}
              </p>
              <div className="buscador-roles" style={{ marginBottom: 10 }}>
                <input
                  className="input-buscador-roles"
                  value={filtroSolicitudesBusqueda}
                  onChange={(e) => setFiltroSolicitudesBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, apellido, DNI o institucion"
                />
              </div>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Rol</th>
                    <th>Identificacion</th>
                    <th>DNI</th>
                    <th>Institucion</th>
                    <th>Estado</th>
                    <th>Detalle</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudesPendientesFiltradas.map((item) => {
                    const datosSolicitud = obtenerDatosSolicitud(item);
                    return (
                    <tr key={item.id}>
                      <td>{item.rolSolicitado}</td>
                      <td>{datosSolicitud.identificacion || "-"}</td>
                      <td>{datosSolicitud.dni}</td>
                      <td>{datosSolicitud.institucion || "-"}</td>
                      <td>{item.estado}</td>
                      <td>
                        <button className="boton boton-xs" type="button" onClick={() => setDetalleSolicitudActiva(item)}>
                          Ver detalle
                        </button>
                      </td>
                      <td className="celda-acciones">
                        {item.estado === "pendiente" ? (
                          <div className="acciones-tabla">
                            <button className="boton boton-xs" onClick={() => resolverSolicitud(item.id, "aprobar")}>Aprobar</button>
                            <button className="boton boton-xs" onClick={() => resolverSolicitud(item.id, "rechazar")}>Rechazar</button>
                          </div>
                        ) : (
                          "Resuelto"
                        )}
                      </td>
                    </tr>
                  )})}
                  {solicitudesPendientesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ color: "var(--texto-secundario)" }}>
                        {solicitudesPendientes.length === 0
                          ? "No hay solicitudes pendientes."
                          : "No hay solicitudes que coincidan con el filtro."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              </RevealOnScroll>
            </section>
          ) : null}

          {vista === "roles" ? (
            <section className="grilla" style={{ marginTop: 16 }}>
              <RevealOnScroll className="panel col-12" delay={80}>
                <h2>Roles del sistema</h2>
                <p style={{ color: "var(--texto-secundario)", marginBottom: 12 }}>
                  Total de roles registrados: {todosRoles.length}
                </p>
                <div className="buscador-roles" style={{ marginBottom: 10 }}>
                  <input
                    className="input-buscador-roles"
                    value={filtroRolesBusqueda}
                    onChange={(e) => setFiltroRolesBusqueda(e.target.value)}
                    placeholder="Buscar por rol, nombre, apellido, DNI, email, entidad o wallet"
                  />
                  <button className="boton" type="button" onClick={() => setFiltroRolesBusqueda("")}>
                    Limpiar
                  </button>
                </div>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Apellido</th>
                      <th>DNI</th>
                      <th>Rol asignado</th>
                      <th>Wallet</th>
                      <th>Estado</th>
                      <th>Detalle</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todosRoles
                      .filter((item) => {
                        const q = String(filtroRolesBusqueda || "").trim().toLowerCase();
                        if (!q) return true;
                        // Buscar también en los datos del perfil si existen
                        const perfil = perfilesRoles[item.wallet] || {};
                        const texto = [
                          String(item.wallet || ""),
                          String(item.rol || ""),
                          perfil.nombreRegistrado || "",
                          perfil.emailRegistrado || "",
                          perfil.entidadRegistrada || "",
                          perfil.dniRegistrado || "",
                        ].join(" ").toLowerCase();
                        return texto.includes(q);
                      })
                      .map((item) => {
                        const perfil = perfilesRoles[item.wallet] || {};
                        // Separar nombre y apellido si viene en formato "Apellido, Nombre"
                        let nombre = "-";
                        let apellido = "-";
                        if (perfil.nombreRegistrado) {
                          const partes = perfil.nombreRegistrado.split(",");
                          if (partes.length === 2) {
                            apellido = partes[0].trim();
                            nombre = partes[1].trim();
                          } else {
                            // Si no hay coma, intentar separar por espacio
                            const palabras = perfil.nombreRegistrado.trim().split(/\s+/);
                            if (palabras.length > 1) {
                              nombre = palabras.slice(1).join(" ");
                              apellido = palabras[0];
                            } else {
                              nombre = perfil.nombreRegistrado.trim();
                            }
                          }
                        }
                        return (
                          <tr key={`${item.wallet}-${item.rol}`}>
                            <td>{nombre}</td>
                            <td>{apellido}</td>
                            <td>{perfil.dniRegistrado || "-"}</td>
                            <td>{item.rol}</td>
                            <td title={item.wallet}>{abreviarWallet(item.wallet)}</td>
                            <td>{item.activo ? "Activo" : "Inactivo"}</td>
                            <td>
                              <button className="boton boton-xs" type="button" onClick={() => abrirDetalleRol(item)}>
                                Ver detalle alta
                              </button>
                            </td>
                            <td>
                              {item.wallet !== WALLET_ADMIN_SISTEMA ? (
                                item.activo ? (
                                  <button className="boton" style={{ minWidth: 110 }} onClick={() => deshabilitar(item.wallet, item.rol)}>
                                    Deshabilitar
                                  </button>
                                ) : (
                                  <button className="boton" style={{ minWidth: 110 }} onClick={() => habilitar(item.wallet, item.rol)}>
                                    Habilitar
                                  </button>
                                )
                              ) : (
                                "Protegido"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    {todosRoles.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ color: "var(--texto-secundario)" }}>
                          No hay roles registrados en el sistema.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </RevealOnScroll>
            </section>
          ) : null}

          {vista === "emisiones" ? (
            <section className="grilla" style={{ marginTop: 16 }}>
            <RevealOnScroll className="panel col-5" delay={90}>
              <h2>Filtro de emisiones</h2>
              <form onSubmit={buscarEmisiones}>
                <div className="campo"><label>Desde</label><input type="date" value={filtro.desde} onChange={(e) => setFiltro((v) => ({ ...v, desde: e.target.value }))} /></div>
                <div className="campo"><label>Hasta</label><input type="date" value={filtro.hasta} onChange={(e) => setFiltro((v) => ({ ...v, hasta: e.target.value }))} /></div>
                <div className="campo"><label>Anio</label><input value={filtro.anio} onChange={(e) => setFiltro((v) => ({ ...v, anio: e.target.value }))} placeholder="2026" /></div>
                <div className="campo"><label>Universidad</label><input value={filtro.universidad} onChange={(e) => setFiltro((v) => ({ ...v, universidad: e.target.value }))} /></div>
                <div className="campo"><label>Carrera</label><input value={filtro.carrera} onChange={(e) => setFiltro((v) => ({ ...v, carrera: e.target.value }))} /></div>
                <button className="boton" type="submit">Buscar emisiones</button>
              </form>
            </RevealOnScroll>

            <RevealOnScroll className="panel col-7" delay={140}>
              <h2>Resultados de emisiones</h2>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Registro</th>
                    <th>Fecha</th>
                    <th>Universidad</th>
                    <th>Carrera</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {emisiones.map((item) => (
                    <tr key={item.codigoRegistro}>
                      <td>{item.codigoRegistro}</td>
                      <td>{formatearFechaHora(item.fechaEmision || item.flujo?.[0]?.fecha)}</td>
                      <td>{item.institucion}</td>
                      <td>{item.carrera || item.programa}</td>
                      <td>{item.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12 }}>
                <a href="/observabilidad" className="boton" style={{ display: "inline-block" }}>
                  Ver metricas del sistema
                </a>
              </div>
            </RevealOnScroll>
            </section>
          ) : null}

          {detalleSolicitudActiva ? (
            <div className="modal-fondo" role="dialog" aria-modal="true">
              <div className="modal-panel" style={{ maxWidth: 580, width: "100%" }}>
                <h3 style={{ marginTop: 0 }}>Detalle de la solicitud de rol</h3>

                <div style={{ marginBottom: 10, color: "var(--texto-secundario)", fontSize: 13 }}>
                  <span>ID solicitud: </span>
                  <strong>{detalleSolicitudActiva.requestId || detalleSolicitudActiva.id || "-"}</strong>
                </div>
                <div style={{ marginBottom: 16, color: "var(--texto-secundario)", fontSize: 13 }}>
                  <span>Fecha de solicitud: </span>
                  <strong>{formatearFechaHora(detalleSolicitudActiva.fechaSolicitud) || "-"}</strong>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                  {[
                    ["Rol solicitado", detalleSolicitudActiva.rolSolicitado],
                    ["Estado", detalleSolicitudActiva.estado],
                    ["Nombre declarado", detalleSolicitudActiva?.identificacion?.nombre || "-"],
                    ["Entidad", detalleSolicitudActiva?.identificacion?.entidad || "-"],
                    ["Documento", detalleSolicitudActiva?.identificacion?.documento || "-"],
                    ["Email", detalleSolicitudActiva?.identificacion?.email || "-"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: "var(--texto-secundario)", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontWeight: 600, color: "var(--texto-primario)", wordBreak: "break-word" }}>
                        {value || "-"}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, gap: 8 }}>
                  {detalleSolicitudActiva.estado === "pendiente" ? (
                    <>
                      <button className="boton boton-xs" type="button" onClick={() => resolverSolicitud(detalleSolicitudActiva.id, "aprobar")}>
                        Aprobar
                      </button>
                      <button className="boton boton-xs" type="button" onClick={() => resolverSolicitud(detalleSolicitudActiva.id, "rechazar")}>
                        Rechazar
                      </button>
                    </>
                  ) : null}
                  <button className="boton" type="button" onClick={() => setDetalleSolicitudActiva(null)}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {detalleRolActivo ? (
            <div className="modal-fondo" role="dialog" aria-modal="true">
              <div className="modal-panel" style={{ maxWidth: 580, width: "100%" }}>
                <h3 style={{ marginTop: 0 }}>
                  {registroEditando ? "Editar registro del rol" : "Detalle de alta del rol"}
                </h3>

                {/* Info de solo lectura siempre visible */}
                <div style={{ marginBottom: 10, color: "var(--texto-secundario)", fontSize: 13 }}>
                  <span>Wallet: </span>
                  <strong style={{ wordBreak: "break-all" }}>{detalleRolActivo.wallet}</strong>
                </div>
                <div style={{ marginBottom: 10, color: "var(--texto-secundario)", fontSize: 13 }}>
                  <span>Solicitud origen: </span>
                  <strong>{detalleRolActivo?.registroRol?.solicitudId || "No disponible"}</strong>
                </div>
                <div style={{ marginBottom: 10, color: "var(--texto-secundario)", fontSize: 13 }}>
                  <span>Fecha solicitud: </span>
                  <strong>{formatearFechaHora(detalleRolActivo?.registroRol?.fechaSolicitud) || "-"}</strong>
                </div>
                <div style={{ marginBottom: 16, color: "var(--texto-secundario)", fontSize: 13 }}>
                  <span>Fecha aprobacion: </span>
                  <strong>{formatearFechaHora(detalleRolActivo?.registroRol?.fechaResolucion) || "-"}</strong>
                </div>

                {!registroEditando ? (
                  /* Vista de solo lectura */
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
                    {[
                      ["Apellidos", detalleRolActivo?.registroRol?.apellidos || obtenerDatosPersonaRegistro(detalleRolActivo).apellido],
                      ["Nombres", detalleRolActivo?.registroRol?.nombres || obtenerDatosPersonaRegistro(detalleRolActivo).nombre],
                      ["DNI", obtenerDatosPersonaRegistro(detalleRolActivo).dni || "-"],
                      ["CUIT/CUIL", obtenerDatosPersonaRegistro(detalleRolActivo).cuitCuil || "-"],
                      ["Email", detalleRolActivo?.registroRol?.email || "-"],
                      ["Entidad", mostrarEntidadDetalle(detalleRolActivo)],
                      ["Rol asignado", detalleRolActivo.rol],
                      detalleRolActivo.rol === "UNIVERSIDAD"
                        ? ["Universidad", detalleRolActivo?.registroRol?.universidad || "-"]
                        : null,
                      detalleRolActivo.rol === "CANCILLERIA"
                        ? ["Paises atendidos", Array.isArray(detalleRolActivo?.registroRol?.paises) && detalleRolActivo.registroRol.paises.length > 0 ? detalleRolActivo.registroRol.paises.join(", ") : "-"]
                        : null,
                    ]
                      .filter(Boolean)
                      .map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontSize: 11, color: "var(--texto-secundario)", marginBottom: 2 }}>{label}</div>
                          <div style={{ fontWeight: 600, color: "var(--texto-primario)", wordBreak: "break-word" }}>{value || "-"}</div>
                        </div>
                      ))}
                    {detalleRolActivo?.registroRol?.actualizadoEn ? (
                      <div style={{ gridColumn: "1 / -1", marginTop: 4, fontSize: 11, color: "var(--texto-secundario)" }}>
                        Ultima edicion: {formatearFechaHora(detalleRolActivo.registroRol.actualizadoEn)}
                        {detalleRolActivo.registroRol.actualizadoPorNombre
                          ? ` — ${detalleRolActivo.registroRol.actualizadoPorNombre}`
                          : ""}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  /* Formulario de edicion */
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                      <div className="campo">
                        <label>Apellidos</label>
                        <input
                          value={registroForm.apellidos}
                          onChange={(e) => setRegistroForm((v) => ({ ...v, apellidos: e.target.value }))}
                          placeholder="Apellidos"
                        />
                      </div>
                      <div className="campo">
                        <label>Nombres</label>
                        <input
                          value={registroForm.nombres}
                          onChange={(e) => setRegistroForm((v) => ({ ...v, nombres: e.target.value }))}
                          placeholder="Nombres"
                        />
                      </div>
                      <div className="campo">
                        <label>DNI</label>
                        <input
                          value={registroForm.dni}
                          onChange={(e) => setRegistroForm((v) => ({ ...v, dni: e.target.value.replace(/[^0-9]/g, "").slice(0, 8) }))}
                          placeholder="Sin puntos ni espacios"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="campo">
                        <label>CUIT / CUIL</label>
                        <input
                          value={registroForm.cuitCuil}
                          onChange={(e) => setRegistroForm((v) => ({ ...v, cuitCuil: e.target.value.replace(/[^0-9]/g, "").slice(0, 11) }))}
                          placeholder="11 digitos sin guiones"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="campo" style={{ gridColumn: "1 / -1" }}>
                        <label>Email</label>
                        <input
                          type="email"
                          value={registroForm.email}
                          onChange={(e) => setRegistroForm((v) => ({ ...v, email: e.target.value }))}
                          placeholder="correo@ejemplo.com"
                        />
                      </div>
                      <div className="campo" style={{ gridColumn: "1 / -1" }}>
                        <label>Entidad / Organismo</label>
                        <input
                          value={registroForm.entidad}
                          onChange={(e) => setRegistroForm((v) => ({ ...v, entidad: e.target.value }))}
                          placeholder="Nombre del organismo o institución (dejar vacío si no aplica)"
                        />
                      </div>
                      <div className="campo" style={{ gridColumn: "1 / -1" }}>
                        <label>Rol asignado</label>
                        <select
                          value={registroForm.rolAsignado}
                          onChange={(e) => setRegistroForm((v) => ({ ...v, rolAsignado: e.target.value }))}
                        >
                          {["ADMIN", "UNIVERSIDAD", "MINISTERIO", "CANCILLERIA", "EGRESADO"].map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        {registroForm.rolAsignado !== detalleRolActivo.rol ? (
                          <p style={{ fontSize: 12, color: "#ff8a80", marginTop: 4 }}>
                            Cambiar el rol requiere firma on-chain. El rol anterior sera desvinculado.
                          </p>
                        ) : null}
                      </div>
                      {registroForm.rolAsignado === "UNIVERSIDAD" ? (
                        <div className="campo" style={{ gridColumn: "1 / -1" }}>
                          <label>Universidad</label>
                          <input
                            value={registroForm.universidad}
                            onChange={(e) => setRegistroForm((v) => ({ ...v, universidad: e.target.value }))}
                            placeholder="Nombre de la universidad para la que opera"
                          />
                        </div>
                      ) : null}
                      {registroForm.rolAsignado === "CANCILLERIA" ? (
                        <div className="campo" style={{ gridColumn: "1 / -1" }}>
                          <label>Paises atendidos</label>
                          <input
                            value={registroForm.paises}
                            onChange={(e) => setRegistroForm((v) => ({ ...v, paises: e.target.value }))}
                            placeholder="Argentina, Brasil, Chile (separar con coma)"
                          />
                          <p style={{ fontSize: 11, color: "var(--texto-secundario)", marginTop: 4 }}>
                            Solo vera tramites cuyo pais de origen coincida con esta lista.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, gap: 8 }}>
                  {!registroEditando ? (
                    <button className="boton" type="button" onClick={() => setRegistroEditando(true)}>
                      Editar registro
                    </button>
                  ) : (
                    <button className="boton" type="button" onClick={guardarEdicionRegistro}>
                      Guardar cambios
                    </button>
                  )}
                  <button className="boton" type="button" onClick={() => { setDetalleRolActivo(null); setRegistroEditando(false); }}>
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {modalAdminAbierto ? (
            <div className="modal-fondo" role="dialog" aria-modal="true">
              <div className="modal-panel">
                <h3 style={{ marginTop: 0 }}>Otorgar rol ADMIN</h3>
                <p style={{ color: "var(--texto-secundario)", marginBottom: 12 }}>
                  Ingrese la wallet a la que desea asignar rol ADMIN. Solo el administrador principal puede delegar ADMIN.
                </p>
                <div className="campo">
                  <label>Wallet objetivo</label>
                  <input
                    value={walletAdminObjetivo}
                    onChange={(e) => setWalletAdminObjetivo(e.target.value)}
                    placeholder="Wallet Solana"
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                  <button className="boton" type="button" onClick={() => setModalAdminAbierto(false)}>
                    Cancelar
                  </button>
                  <button className="boton" type="button" onClick={otorgarAdmin} disabled={wallet !== WALLET_ADMIN_SISTEMA}>
                    Aceptar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
