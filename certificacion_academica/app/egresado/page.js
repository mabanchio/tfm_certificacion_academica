"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import RevealOnScroll from "../components/RevealOnScroll";
import BloqueAccesoRol from "../components/BloqueAccesoRol";
import { useWalletSesion } from "../lib/cliente/wallet";
import { solicitarTramiteExtranjeroOnchainDesdeBackpack } from "../lib/cliente/tramites_onchain";
import { urlVerificacionRegistro } from "../lib/cliente/verificacion_url";
import { formatearFechaHora } from "../lib/cliente/fechas";

export default function EgresadoPage() {
  const { wallet } = useWalletSesion();
  const [rolActual, setRolActual] = useState("");
  const [rolesDisponibles, setRolesDisponibles] = useState([]);
  const [filtro, setFiltro] = useState({ nombre: "", apellido: "", cuitCuil: "" });
  const [formExtranjero, setFormExtranjero] = useState({
    nombre: "",
    apellido: "",
    cuitCuil: "",
    tituloOriginal: "",
    analiticoOriginal: "",
    paisOrigen: "",
    universidadOrigen: "",
  });
  const [archivoAnalitico, setArchivoAnalitico] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [tramitesPropios, setTramitesPropios] = useState([]);
  const [qrPorRegistro, setQrPorRegistro] = useState({});
  const [qrPorTramite, setQrPorTramite] = useState({});
  const [resumen, setResumen] = useState({ total: 0, enProceso: 0, certificados: 0 });
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [vista, setVista] = useState("operaciones");
  const [filtroPropios, setFiltroPropios] = useState({ estado: "", q: "" });
  const [datosTitular, setDatosTitular] = useState({ nombre: "", apellido: "", cuitCuil: "" });
  const [detalleSolicitud, setDetalleSolicitud] = useState(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filtro.nombre.trim()) params.set("nombre", filtro.nombre.trim());
    if (filtro.apellido.trim()) params.set("apellido", filtro.apellido.trim());
    if (filtro.cuitCuil.trim()) params.set("cuitCuil", filtro.cuitCuil.trim());
    return params.toString();
  }, [filtro]);

  useEffect(() => {
    async function cargarEstadoRol() {
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
      if (!roles.includes("EGRESADO")) return;

      const perfilResp = await fetch(`/api/roles/perfil?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" });
      const perfilPayload = await perfilResp.json();
      if (perfilPayload.ok && perfilPayload.data) {
        const p = perfilPayload.data;
        const nombrePlano = String(p.nombre || p.nombreRegistrado || "").trim();
        const [apellidoDesdePerfil = "", nombreDesdePerfil = ""] = nombrePlano.includes(",")
          ? nombrePlano.split(",").map((v) => String(v || "").trim())
          : ["", nombrePlano];
        const titular = {
          nombre: nombreDesdePerfil,
          apellido: String(p.apellido || apellidoDesdePerfil || "").trim(),
          cuitCuil: String(p.cuitCuil || p.cuitCuilRegistrado || "").trim(),
        };
        setDatosTitular(titular);
        setFormExtranjero((v) => ({ ...v, nombre: titular.nombre, apellido: titular.apellido, cuitCuil: titular.cuitCuil }));
      }

      const tramitesResp = await fetch(`/api/tramites/egresado?walletEgresado=${encodeURIComponent(wallet)}`, {
        cache: "no-store",
      });
      const tramitesPayload = await tramitesResp.json();
      setTramitesPropios(tramitesPayload.data || []);
    }
    cargarEstadoRol();
  }, [wallet]);

  function idCorto(valor) {
    const raw = String(valor || "").trim();
    if (raw.length <= 7) return raw;
    return `${raw.slice(0, 3)}...${raw.slice(-3)}`;
  }

  const tramitesPropiosFiltrados = useMemo(() => {
    const q = String(filtroPropios.q || "").trim().toLowerCase();
    return tramitesPropios.filter((item) => {
      const okEstado = !filtroPropios.estado || item.estado === filtroPropios.estado;
      const nombreTitular = String(item?.titular?.nombre || "").toLowerCase();
      const apellidoTitular = String(item?.titular?.apellido || "").toLowerCase();
      const cuitTitular = String(item?.titular?.cuitCuil || "").toLowerCase();
      const okQ =
        !q ||
        item.id.toLowerCase().includes(q) ||
        nombreTitular.includes(q) ||
        apellidoTitular.includes(q) ||
        `${nombreTitular} ${apellidoTitular}`.trim().includes(q) ||
        cuitTitular.includes(q) ||
        String(item.paisOrigen || "").toLowerCase().includes(q) ||
        String(item.universidadOrigen || "").toLowerCase().includes(q);
      return okEstado && okQ;
    });
  }, [tramitesPropios, filtroPropios]);

  const accesoEgresado = rolesDisponibles.includes("EGRESADO") || rolActual === "EGRESADO";

  useEffect(() => {
    let cancelado = false;

    async function generarQrs() {
      if (!resultados.length) {
        setQrPorRegistro({});
        return;
      }

      const pares = await Promise.all(
        resultados.map(async (item) => {
          const url = urlVerificacionRegistro(item.codigoRegistro);
          const qr = await QRCode.toDataURL(url, {
            margin: 1,
            color: { dark: "#0F1D34", light: "#F2F7FF" },
            width: 140,
          });
          return [item.codigoRegistro, qr];
        })
      );

      if (!cancelado) {
        setQrPorRegistro(Object.fromEntries(pares));
      }
    }

    generarQrs();

    return () => {
      cancelado = true;
    };
  }, [resultados]);

  useEffect(() => {
    let cancelado = false;

    async function generarQrTramites() {
      const tramitesConRegistro = (tramitesPropios || []).filter((item) => item.codigoRegistro);
      if (!tramitesConRegistro.length) {
        setQrPorTramite({});
        return;
      }

      const pares = await Promise.all(
        tramitesConRegistro.map(async (item) => {
          const url = item.urlVerificacion || `/verificar?registro=${encodeURIComponent(item.codigoRegistro)}`;
          const qr = await QRCode.toDataURL(url, {
            margin: 1,
            color: { dark: "#0F1D34", light: "#F2F7FF" },
            width: 120,
          });
          return [item.id, qr];
        })
      );

      if (!cancelado) {
        setQrPorTramite(Object.fromEntries(pares));
      }
    }

    generarQrTramites();

    return () => {
      cancelado = true;
    };
  }, [tramitesPropios]);

  useEffect(() => {
    let cancelado = false;

    if (!query) {
      setResultados([]);
      setQrPorRegistro({});
      setResumen({ total: 0, enProceso: 0, certificados: 0 });
      setCargando(false);
      return () => {
        cancelado = true;
      };
    }

    async function ejecutarBusqueda() {
      setCargando(true);
      try {
        const response = await fetch(`/api/egresados?${query}`);
        const payload = await response.json();
        if (cancelado || !response.ok || !payload.ok) return;
        setResultados(payload.data || []);
        setResumen(payload.resumen || { total: 0, enProceso: 0, certificados: 0 });
      } catch (e) {
        if (cancelado) return;
        setResultados([]);
        setQrPorRegistro({});
        setResumen({ total: 0, enProceso: 0, certificados: 0 });
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    ejecutarBusqueda();
    return () => {
      cancelado = true;
    };
  }, [query]);

  async function solicitarValidacionExtranjera(event) {
    event.preventDefault();
    setMensaje("");

    if (!archivoAnalitico) {
      setMensaje("Debe adjuntar el PDF del analítico certificado.");
      return;
    }

    let adjunto = null;
    try {
      const formData = new FormData();
      formData.append("archivo", archivoAnalitico);
      const uploadResp = await fetch("/api/tramites/documentos", {
        method: "POST",
        body: formData,
      });
      const uploadPayload = await uploadResp.json();
      if (!uploadResp.ok || !uploadPayload.ok) {
        setMensaje(uploadPayload.error || "No se pudo adjuntar el PDF del analítico.");
        return;
      }
      adjunto = uploadPayload.data;
    } catch (_e) {
      setMensaje("Error al subir el PDF del analítico.");
      return;
    }

    const payload = await solicitarTramiteExtranjeroOnchainDesdeBackpack({
      walletEgresado: wallet,
      ...formExtranjero,
      analiticoOriginal: adjunto?.nombreOriginal || formExtranjero.analiticoOriginal,
      analiticoPdfUrl: adjunto?.url || "",
      analiticoPdfNombre: adjunto?.nombreOriginal || "",
      analiticoPdfSha256: adjunto?.sha256 || "",
      analiticoPdfId: adjunto?.documentoId || "",
    });

    setMensaje(payload.ok ? "Solicitud enviada al ministerio y en espera de evaluacion." : payload.error || "No se pudo enviar la solicitud.");

    if (payload.ok) {
      const tramitesResp = await fetch(`/api/tramites/egresado?walletEgresado=${encodeURIComponent(wallet)}`, {
        cache: "no-store",
      });
      const tramitesPayload = await tramitesResp.json();
      setTramitesPropios(tramitesPayload.data || []);
    }
  }

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48 }}>
      <RevealOnScroll className="panel" delay={40}>
        <h1>Portal de egresado</h1>
        <p style={{ color: "var(--texto-secundario)" }}>
          Busqueda por nombre, apellido y CUIT/CUIL para consultar certificaciones en proceso y certificadas.
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
            className={`tab-btn ${vista === "consulta" ? "activa" : ""}`}
            onClick={() => setVista("consulta")}
            type="button"
          >
            Consulta pública
          </button>
        </div>
      </RevealOnScroll>

      {wallet ? <BloqueAccesoRol wallet={wallet} rolEsperado="EGRESADO" rolActual={rolActual} rolesDisponibles={rolesDisponibles} /> : null}

      {mensaje ? (
        <section className="grilla" style={{ marginTop: 12 }}>
          <div className="panel"><span className="estado estado-proceso">{mensaje}</span></div>
        </section>
      ) : null}

      {wallet && accesoEgresado && vista === "operaciones" ? (
        <section className="grilla" style={{ marginTop: 16 }}>
          <RevealOnScroll className="panel" delay={70}>
            <h2>Solicitud de validacion de titulo extranjero</h2>
            <form onSubmit={solicitarValidacionExtranjera}>
              <p style={{ color: "var(--texto-secundario)", fontSize: "0.88rem", marginBottom: 10 }}>
                Los datos del titular se completan automáticamente según su registro. Puede modificarlos si gestiona la solicitud en nombre de otro egresado.
              </p>
              <div className="campo"><label>Nombre del egresado</label><input required value={formExtranjero.nombre} onChange={(e) => setFormExtranjero((v) => ({ ...v, nombre: e.target.value }))} /></div>
              <div className="campo"><label>Apellido del egresado</label><input required value={formExtranjero.apellido} onChange={(e) => setFormExtranjero((v) => ({ ...v, apellido: e.target.value }))} /></div>
              <div className="campo">
                <label>CUIT/CUIL del egresado</label>
                <input required value={formExtranjero.cuitCuil} onChange={(e) => setFormExtranjero((v) => ({ ...v, cuitCuil: e.target.value }))} />
                {datosTitular.cuitCuil && formExtranjero.cuitCuil !== datosTitular.cuitCuil ? (
                  <span style={{ color: "var(--advertencia)", fontSize: "0.82rem" }}>Gestionando en nombre de otro egresado</span>
                ) : null}
              </div>
              <div className="campo"><label>Titulo original certificado</label><input required value={formExtranjero.tituloOriginal} onChange={(e) => setFormExtranjero((v) => ({ ...v, tituloOriginal: e.target.value }))} /></div>
              <div className="campo">
                <label>Analítico original certificado (PDF)</label>
                <input
                  className="input-file-pdf"
                  required
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    const archivo = e.target.files?.[0] || null;
                    setArchivoAnalitico(archivo);
                    setFormExtranjero((v) => ({ ...v, analiticoOriginal: archivo?.name || "" }));
                  }}
                />
                <span className="file-selected-name">
                  {archivoAnalitico?.name || "Ningún archivo seleccionado"}
                </span>
              </div>
              <div className="campo"><label>Pais de origen</label><input required value={formExtranjero.paisOrigen} onChange={(e) => setFormExtranjero((v) => ({ ...v, paisOrigen: e.target.value }))} /></div>
              <div className="campo"><label>Universidad de origen</label><input value={formExtranjero.universidadOrigen} onChange={(e) => setFormExtranjero((v) => ({ ...v, universidadOrigen: e.target.value }))} /></div>
              <button className="boton" type="submit">Solicitar validación</button>
            </form>
          </RevealOnScroll>

          <RevealOnScroll className="panel" delay={100}>
            <h2>Seguimiento de tus solicitudes</h2>
            <div className="filtros-grid">
              <div className="filtro-item campo">
                <label>Estado</label>
                <select
                  value={filtroPropios.estado}
                  onChange={(e) => setFiltroPropios((v) => ({ ...v, estado: e.target.value }))}
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
                  value={filtroPropios.q}
                  onChange={(e) => setFiltroPropios((v) => ({ ...v, q: e.target.value }))}
                  placeholder="ID, nombre, apellido, CUIT/CUIL, país o universidad"
                />
              </div>
            </div>
            <table className="tabla">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Fecha solicitud</th>
                  <th>Estado</th>
                  <th>Fecha resolución</th>
                  <th>Motivo</th>
                  <th>Detalle</th>
                  <th>QR verificación</th>
                </tr>
              </thead>
              <tbody>
                {tramitesPropiosFiltrados.map((item) => (
                  <tr key={item.id}>
                    <td className="celda-id-larga" title={item.id}>{idCorto(item.id)}</td>
                    <td>{formatearFechaHora(item.fechaSolicitud)}</td>
                    <td>{item.estado}</td>
                    <td>{formatearFechaHora(item.fechaResolucion)}</td>
                    <td>{item.motivoResolucion || "-"}</td>
                    <td>
                      <button className="boton boton-xs" type="button" onClick={() => setDetalleSolicitud(item)}>
                        Ver detalle
                      </button>
                    </td>
                    <td>
                      {item.codigoRegistro ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          {item.notificacionEgresado ? (
                            <span style={{ color: "var(--exito)", fontSize: "0.82rem" }}>{item.notificacionEgresado}</span>
                          ) : null}
                          <a
                            className="boton boton-xs"
                            href={item.urlVerificacion || `/verificar?registro=${encodeURIComponent(item.codigoRegistro)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Verificar {item.codigoRegistro}
                          </a>
                          {qrPorTramite[item.id] ? (
                            <img
                              src={qrPorTramite[item.id]}
                              alt={`QR ${item.codigoRegistro}`}
                              style={{ width: 92, borderRadius: 8, border: "1px solid #2a456f", background: "#fff" }}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <span style={{ color: "var(--texto-secundario)" }}>Pendiente</span>
                      )}
                    </td>
                  </tr>
                ))}
                {tramitesPropiosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ color: "var(--texto-secundario)" }}>
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
        <div className="modal-fondo" onClick={() => setDetalleSolicitud(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Detalle de solicitud</h3>
            <div className="campo"><label>ID</label><div>{detalleSolicitud.id || "-"}</div></div>
            <div className="campo"><label>Estado</label><div>{detalleSolicitud.estado || "-"}</div></div>
            <div className="campo"><label>Fecha solicitud</label><div>{formatearFechaHora(detalleSolicitud.fechaSolicitud) || "-"}</div></div>
            <div className="campo"><label>Fecha resolución</label><div>{formatearFechaHora(detalleSolicitud.fechaResolucion) || "-"}</div></div>
            <div className="campo"><label>Motivo</label><div>{detalleSolicitud.motivoResolucion || "-"}</div></div>

            <div className="campo"><label>Nombre titular</label><div>{`${detalleSolicitud?.titular?.nombre || ""} ${detalleSolicitud?.titular?.apellido || ""}`.trim() || "-"}</div></div>
            <div className="campo"><label>CUIT/CUIL titular</label><div>{detalleSolicitud?.titular?.cuitCuil || "-"}</div></div>
            <div className="campo"><label>Título original</label><div>{detalleSolicitud.tituloOriginal || "-"}</div></div>
            <div className="campo"><label>País origen</label><div>{detalleSolicitud.paisOrigen || "-"}</div></div>
            <div className="campo"><label>Universidad origen</label><div>{detalleSolicitud.universidadOrigen || "-"}</div></div>
            <div className="campo"><label>Analítico original</label><div>{detalleSolicitud.analiticoOriginal || "-"}</div></div>
            <div className="campo"><label>Token ministerio</label><div>{detalleSolicitud.tokenMinisterioId || "-"}</div></div>
            <div className="campo"><label>Token cancillería</label><div>{detalleSolicitud.tokenCancilleriaId || "-"}</div></div>
            <div className="campo"><label>Código registro</label><div>{detalleSolicitud.codigoRegistro || "-"}</div></div>

            {detalleSolicitud.analiticoPdfUrl ? (
              <div className="campo">
                <label>PDF adjunto</label>
                <a className="boton boton-xs" href={detalleSolicitud.analiticoPdfUrl} target="_blank" rel="noreferrer">
                  Abrir PDF
                </a>
              </div>
            ) : null}

            <div className="modal-acciones">
              <button className="boton" type="button" onClick={() => setDetalleSolicitud(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {vista === "consulta" ? (
      <section className="grilla" style={{ marginTop: 16 }}>
        <RevealOnScroll className="panel col-5" delay={80}>
          <h2>Filtro de consulta pública</h2>
          <div className="campo">
            <label>Nombre</label>
            <input value={filtro.nombre} onChange={(e) => setFiltro((v) => ({ ...v, nombre: e.target.value }))} />
          </div>
          <div className="campo">
            <label>Apellido</label>
            <input value={filtro.apellido} onChange={(e) => setFiltro((v) => ({ ...v, apellido: e.target.value }))} />
          </div>
          <div className="campo">
            <label>CUIT/CUIL</label>
            <input
              value={filtro.cuitCuil}
              onChange={(e) => setFiltro((v) => ({ ...v, cuitCuil: e.target.value }))}
              placeholder="Solo números o formato con guiones"
            />
          </div>
        </RevealOnScroll>

        <RevealOnScroll className="panel col-7" delay={120}>
          <h2>Resultado de consulta</h2>
          {!query ? (
            <p style={{ color: "var(--texto-secundario)" }}>
              Ingrese al menos un criterio de búsqueda para consultar títulos verificados.
            </p>
          ) : null}
          <p style={{ color: "var(--texto-secundario)" }}>
            Coincidencias totales: {resumen.total}. En proceso: {resumen.enProceso}. Certificadas: {resumen.certificados}.
          </p>
          {cargando ? <p style={{ color: "var(--texto-secundario)" }}>Actualizando resultados...</p> : null}
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Programa</th>
                <th>Estado</th>
                <th>QR/Verificación</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((item) => (
                <tr key={item.codigoRegistro}>
                  <td>{item.codigoRegistro}</td>
                  <td>{item.programa}</td>
                  <td>
                    <span className={`estado ${item.estado === "En proceso" ? "estado-proceso" : "estado-ok"}`}>
                      {item.estado}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "grid", gap: 8 }}>
                      <a className="boton" href={`/verificar?registro=${encodeURIComponent(item.codigoRegistro)}`}>
                        Abrir verificación
                      </a>
                      {qrPorRegistro[item.codigoRegistro] ? (
                        <img
                          src={qrPorRegistro[item.codigoRegistro]}
                          alt={`QR ${item.codigoRegistro}`}
                          style={{ width: 110, borderRadius: 8, border: "1px solid #2a456f", background: "#fff" }}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </RevealOnScroll>
      </section>
      ) : null}

    </main>
  );
}
