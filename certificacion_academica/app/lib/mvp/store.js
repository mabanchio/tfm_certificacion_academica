import crypto from "crypto";
import fs from "fs";
import path from "path";
import { certificaciones as seedCertificaciones } from "../../data/demo";
import { WALLET_ADMIN_SISTEMA } from "../config/sistema";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "mvp-store.json");

function estadoBase() {
  return {
    certificaciones: [...seedCertificaciones],
    solicitudesRol: [],
    rolesActivos: [
      {
        wallet: WALLET_ADMIN_SISTEMA,
        rol: "ADMIN",
        estado: "activo",
        fechaAlta: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
      },
    ],
    solicitudesLotes: [],
    lotesTokens: [],
    tramitesExtranjero: [],
  };
}

function garantizarAdmin(estado) {
  const admin = estado.rolesActivos.find((r) => r.wallet === WALLET_ADMIN_SISTEMA && r.estado === "activo");
  if (!admin) {
    estado.rolesActivos.unshift({
      wallet: WALLET_ADMIN_SISTEMA,
      rol: "ADMIN",
      estado: "activo",
      fechaAlta: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    });
  }
}

function cargarEstado() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return estadoBase();
    }

    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const data = JSON.parse(raw);
    const merged = {
      ...estadoBase(),
      ...data,
      certificaciones: Array.isArray(data?.certificaciones) ? data.certificaciones : [...seedCertificaciones],
      solicitudesRol: Array.isArray(data?.solicitudesRol) ? data.solicitudesRol : [],
      rolesActivos: Array.isArray(data?.rolesActivos) ? data.rolesActivos : [],
      solicitudesLotes: Array.isArray(data?.solicitudesLotes) ? data.solicitudesLotes : [],
      lotesTokens: Array.isArray(data?.lotesTokens) ? data.lotesTokens : [],
      tramitesExtranjero: Array.isArray(data?.tramitesExtranjero) ? data.tramitesExtranjero : [],
    };
    garantizarAdmin(merged);
    return merged;
  } catch (_e) {
    return estadoBase();
  }
}

function persistirEstado() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(estado, null, 2), "utf8");
  } catch (_e) {
    // Evita romper operación por error de E/S.
  }
}

const estado = cargarEstado();

const ROLES_PERMITIDOS = ["ADMIN", "UNIVERSIDAD", "MINISTERIO", "CANCILLERIA", "EGRESADO"];

function normalizarTexto(v, max = 128) {
  return String(v || "").trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizarCuit(v) {
  return String(v || "").replace(/[^0-9]/g, "").slice(0, 11);
}

function normalizarWallet(v) {
  return String(v || "").trim();
}

function walletValida(v) {
  const wallet = normalizarWallet(v);
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet);
}

function hoyIso() {
  return new Date().toISOString();
}

function fechaDia() {
  return new Date().toISOString().slice(0, 10);
}

function generarCodigoRegistro() {
  const prefijo = crypto.randomBytes(5).toString("hex").toUpperCase();
  const sufijo = Date.now().toString(16).toUpperCase();
  return `${prefijo}${sufijo}`.slice(0, 20);
}

function generarFlujoInicial() {
  const hoy = fechaDia();
  return [
    { actor: "Universidad", paso: "Emision", fecha: hoy, estado: "Completado" },
    { actor: "Universidad", paso: "Legalizacion interna", fecha: "", estado: "Pendiente" },
    { actor: "Ministerio", paso: "Validacion ministerial", fecha: "", estado: "Pendiente" },
    { actor: "Cancilleria", paso: "Apostilla", fecha: "", estado: "Pendiente" },
  ];
}

function buscarRolActivo(wallet) {
  const walletNorm = normalizarWallet(wallet);
  return estado.rolesActivos.find((item) => item.wallet === walletNorm && item.estado === "activo") || null;
}

function esAdmin(wallet) {
  const rol = buscarRolActivo(wallet);
  return rol?.rol === "ADMIN";
}

function respuestaError(error) {
  return { ok: false, error };
}

export function obtenerEstadoWallet(walletEntrada) {
  const wallet = normalizarWallet(walletEntrada);
  if (!walletValida(wallet)) {
    return {
      ok: true,
      data: {
        wallet,
        walletValida: false,
        estadoSolicitud: "sin_solicitud",
        rolActivo: null,
      },
    };
  }

  const rolActivo = buscarRolActivo(wallet);
  if (rolActivo) {
    return {
      ok: true,
      data: {
        wallet,
        walletValida: true,
        estadoSolicitud: "aprobada",
        rolActivo: rolActivo.rol,
      },
    };
  }

  const ultimaSolicitud = [...estado.solicitudesRol]
    .reverse()
    .find((sol) => sol.wallet === wallet);

  if (!ultimaSolicitud) {
    return {
      ok: true,
      data: {
        wallet,
        walletValida: true,
        estadoSolicitud: "sin_solicitud",
        rolActivo: null,
      },
    };
  }

  return {
    ok: true,
    data: {
      wallet,
      walletValida: true,
      estadoSolicitud: ultimaSolicitud.estado,
      rolActivo: null,
      solicitud: ultimaSolicitud,
    },
  };
}

export function crearSolicitudRol(payload) {
  const wallet = normalizarWallet(payload.wallet);
  const rolSolicitado = normalizarTexto(payload.rolSolicitado, 24).toUpperCase();
  const identificacion = {
    nombre: normalizarTexto(payload.nombre, 120),
    entidad: normalizarTexto(payload.entidad, 160),
    documento: normalizarTexto(payload.documento, 40),
    email: normalizarTexto(payload.email, 120),
  };

  if (!walletValida(wallet)) return respuestaError("Wallet invalida");
  if (!ROLES_PERMITIDOS.includes(rolSolicitado) || rolSolicitado === "ADMIN") {
    return respuestaError("Rol solicitado invalido");
  }
  if (!identificacion.nombre || !identificacion.entidad || !identificacion.documento || !identificacion.email) {
    return respuestaError("Complete todos los datos de identificacion del rol");
  }
  if (buscarRolActivo(wallet)) {
    return respuestaError("La wallet ya tiene un rol activo");
  }

  const pendiente = estado.solicitudesRol.find((s) => s.wallet === wallet && s.estado === "pendiente");
  if (pendiente) {
    return respuestaError("Ya existe una solicitud pendiente para esta wallet");
  }

  const solicitud = {
    id: `ROL-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${Date.now().toString(16).toUpperCase()}`,
    wallet,
    rolSolicitado,
    identificacion,
    estado: "pendiente",
    fechaSolicitud: hoyIso(),
    fechaResolucion: "",
    resueltoPor: "",
    motivoResolucion: "",
  };

  estado.solicitudesRol.unshift(solicitud);
  persistirEstado();
  return { ok: true, data: solicitud };
}

export function listarSolicitudesRol({ walletAdmin, estadoFiltro }) {
  if (!esAdmin(walletAdmin)) return respuestaError("Solo el administrador puede ver solicitudes");
  const filtro = normalizarTexto(estadoFiltro, 20).toLowerCase();
  const data = estado.solicitudesRol.filter((item) => !filtro || item.estado === filtro);
  return { ok: true, data };
}

export function resolverSolicitudRol(payload) {
  const walletAdmin = normalizarWallet(payload.walletAdmin);
  if (!esAdmin(walletAdmin)) return respuestaError("Solo el administrador puede resolver solicitudes");

  const solicitudId = normalizarTexto(payload.solicitudId, 64);
  const accion = normalizarTexto(payload.accion, 20).toLowerCase();
  const motivo = normalizarTexto(payload.motivo, 180);
  const solicitud = estado.solicitudesRol.find((item) => item.id === solicitudId);

  if (!solicitud) return respuestaError("Solicitud de rol inexistente");
  if (solicitud.estado !== "pendiente") return respuestaError("La solicitud ya fue resuelta");
  if (!["aprobar", "rechazar"].includes(accion)) return respuestaError("Accion invalida");

  solicitud.estado = accion === "aprobar" ? "aprobada" : "rechazada";
  solicitud.fechaResolucion = hoyIso();
  solicitud.resueltoPor = walletAdmin;
  solicitud.motivoResolucion = motivo;

  if (accion === "aprobar") {
    const existente = estado.rolesActivos.find((r) => r.wallet === solicitud.wallet);
    if (existente) {
      existente.rol = solicitud.rolSolicitado;
      existente.estado = "activo";
      existente.fechaActualizacion = hoyIso();
    } else {
      estado.rolesActivos.unshift({
        wallet: solicitud.wallet,
        rol: solicitud.rolSolicitado,
        estado: "activo",
        fechaAlta: hoyIso(),
        fechaActualizacion: hoyIso(),
      });
    }
  }

  persistirEstado();

  return { ok: true, data: solicitud };
}

export function listarRolesActivos(walletAdmin) {
  if (!esAdmin(walletAdmin)) return respuestaError("Solo el administrador puede ver roles activos");
  return {
    ok: true,
    data: estado.rolesActivos.filter((r) => r.estado === "activo"),
  };
}

export function otorgarRolAdmin(payload) {
  const walletAdmin = normalizarWallet(payload.walletAdmin);
  if (!esAdmin(walletAdmin)) return respuestaError("Solo el administrador puede otorgar rol ADMIN");

  const walletObjetivo = normalizarWallet(payload.walletObjetivo);
  if (!walletValida(walletObjetivo)) return respuestaError("Wallet objetivo invalida");

  const existente = estado.rolesActivos.find((r) => r.wallet === walletObjetivo);
  if (existente) {
    existente.rol = "ADMIN";
    existente.estado = "activo";
    existente.fechaActualizacion = hoyIso();
    persistirEstado();
    return { ok: true, data: existente };
  }

  const nuevo = {
    wallet: walletObjetivo,
    rol: "ADMIN",
    estado: "activo",
    fechaAlta: hoyIso(),
    fechaActualizacion: hoyIso(),
  };

  estado.rolesActivos.unshift(nuevo);
  persistirEstado();
  return { ok: true, data: nuevo };
}

export function deshabilitarRol(payload) {
  const walletAdmin = normalizarWallet(payload.walletAdmin);
  if (!esAdmin(walletAdmin)) return respuestaError("Solo el administrador puede deshabilitar roles");

  const walletObjetivo = normalizarWallet(payload.walletObjetivo);
  if (walletObjetivo === WALLET_ADMIN_SISTEMA) {
    return respuestaError("No es posible deshabilitar el administrador principal");
  }

  const encontrado = estado.rolesActivos.find((r) => r.wallet === walletObjetivo && r.estado === "activo");
  if (!encontrado) return respuestaError("No existe rol activo para la wallet indicada");

  encontrado.estado = "deshabilitado";
  encontrado.fechaActualizacion = hoyIso();
  encontrado.motivo = normalizarTexto(payload.motivo, 180);

  persistirEstado();

  return { ok: true, data: encontrado };
}

export function solicitarLoteUniversidad(payload) {
  const walletUniversidad = normalizarWallet(payload.walletUniversidad);
  const omitirValidacionRol = Boolean(payload.omitirValidacionRol);
  if (!omitirValidacionRol) {
    const rol = buscarRolActivo(walletUniversidad);
    if (!rol || rol.rol !== "UNIVERSIDAD") {
      return respuestaError("Solo una universidad activa puede solicitar lotes");
    }
  }

  const universidad = normalizarTexto(payload.universidad, 160);
  const carrera = normalizarTexto(payload.carrera, 160);
  const planEstudio = normalizarTexto(payload.planEstudio, 160);
  const matricula = normalizarTexto(payload.matricula, 60);
  const anio = Number(payload.anio || 0);
  const cantidadEgresados = Number(payload.cantidadEgresados || 0);

  if (!universidad || !carrera || !planEstudio || !matricula || !anio || cantidadEgresados < 1) {
    return respuestaError("Datos incompletos para solicitar lote");
  }

  const solicitud = {
    id: `LOT-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${Date.now().toString(16).toUpperCase()}`,
    walletUniversidad,
    universidad,
    carrera,
    planEstudio,
    matricula,
    anio,
    cantidadEgresados,
    estado: "pendiente",
    fechaSolicitud: hoyIso(),
    fechaResolucion: "",
    motivoResolucion: "",
    loteId: "",
  };

  estado.solicitudesLotes.unshift(solicitud);
  persistirEstado();
  return { ok: true, data: solicitud };
}

export function listarSolicitudesLotesMinisterio(walletMinisterio) {
  const rol = buscarRolActivo(walletMinisterio);
  if (!rol || rol.rol !== "MINISTERIO") return respuestaError("Solo el ministerio puede ver solicitudes de lotes");
  return {
    ok: true,
    data: estado.solicitudesLotes,
  };
}

export function resolverSolicitudLoteMinisterio(payload) {
  const walletMinisterio = normalizarWallet(payload.walletMinisterio);
  const rol = buscarRolActivo(walletMinisterio);
  if (!rol || rol.rol !== "MINISTERIO") return respuestaError("Solo el ministerio puede resolver lotes");

  const solicitud = estado.solicitudesLotes.find((s) => s.id === normalizarTexto(payload.solicitudId, 64));
  const accion = normalizarTexto(payload.accion, 20).toLowerCase();
  const motivo = normalizarTexto(payload.motivo, 180);

  if (!solicitud) return respuestaError("Solicitud de lote inexistente");
  if (solicitud.estado !== "pendiente") return respuestaError("La solicitud de lote ya fue resuelta");
  if (!["aprobar", "rechazar"].includes(accion)) return respuestaError("Accion invalida");

  solicitud.estado = accion === "aprobar" ? "aprobada" : "rechazada";
  solicitud.fechaResolucion = hoyIso();
  solicitud.motivoResolucion = motivo;

  if (accion === "aprobar") {
    const lote = {
      id: `TKN-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      solicitudId: solicitud.id,
      walletUniversidad: solicitud.walletUniversidad,
      universidad: solicitud.universidad,
      carrera: solicitud.carrera,
      planEstudio: solicitud.planEstudio,
      matricula: solicitud.matricula,
      anio: solicitud.anio,
      cantidadTotal: solicitud.cantidadEgresados,
      cantidadDisponible: solicitud.cantidadEgresados,
      estado: "activo",
      fechaEmision: hoyIso(),
      transferidoPor: walletMinisterio,
      transferidoA: solicitud.walletUniversidad,
    };
    solicitud.loteId = lote.id;
    estado.lotesTokens.unshift(lote);
  }

  persistirEstado();

  return { ok: true, data: solicitud };
}

export function listarLotesUniversidad(walletUniversidad) {
  const rol = buscarRolActivo(walletUniversidad);
  if (!rol || rol.rol !== "UNIVERSIDAD") return respuestaError("Solo una universidad activa puede ver sus lotes");
  return {
    ok: true,
    data: estado.lotesTokens.filter((l) => l.walletUniversidad === walletUniversidad && l.estado === "activo"),
  };
}

export function asignarTokenUniversidad(payload) {
  const walletUniversidad = normalizarWallet(payload.walletUniversidad);
  const rol = buscarRolActivo(walletUniversidad);
  if (!rol || rol.rol !== "UNIVERSIDAD") return respuestaError("Solo una universidad activa puede asignar tokens");

  const loteId = normalizarTexto(payload.loteId, 60);
  const lote = estado.lotesTokens.find((l) => l.id === loteId && l.walletUniversidad === walletUniversidad);
  if (!lote) return respuestaError("Lote de tokens inexistente");
  if (lote.cantidadDisponible < 1) return respuestaError("El lote seleccionado no tiene disponibilidad");

  const nombre = normalizarTexto(payload.nombre, 80);
  const apellido = normalizarTexto(payload.apellido, 80);
  const cuitCuil = normalizarCuit(payload.cuitCuil);
  const promedio = Number(payload.promedio || 0);
  if (!nombre || !apellido || !/^\d{11}$/.test(cuitCuil) || promedio < 0 || promedio > 10) {
    return respuestaError("Datos invalidos para asignacion de token al egresado");
  }

  const codigoRegistro = generarCodigoRegistro();
  const tokenCarreraId = `CAR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const hoy = fechaDia();

  const credencial = {
    codigoRegistro,
    tokenCarreraId,
    titular: { nombre, apellido, cuitCuil },
    tipoCredencial: "Token de carrera",
    programa: lote.carrera,
    carrera: lote.carrera,
    planEstudio: lote.planEstudio,
    matricula: lote.matricula,
    promedioEgreso: promedio,
    anio: lote.anio,
    institucion: lote.universidad,
    estado: "Pendiente ministerio",
    fechaEmision: hoy,
    flujo: [
      { actor: "Universidad", paso: "Solicitud de lote", fecha: hoy, estado: "Completado" },
      { actor: "Ministerio", paso: "Generacion y transferencia de lote", fecha: lote.fechaEmision.slice(0, 10), estado: "Completado" },
      { actor: "Universidad", paso: "Asignacion de token al egresado", fecha: hoy, estado: "Completado" },
      { actor: "Ministerio", paso: "Validacion final", fecha: "", estado: "Pendiente" },
    ],
  };

  lote.cantidadDisponible -= 1;
  estado.certificaciones.unshift(credencial);

  persistirEstado();

  return { ok: true, data: credencial };
}

export function solicitarValidacionExtranjera(payload) {
  const walletEgresado = normalizarWallet(payload.walletEgresado);
  const rol = buscarRolActivo(walletEgresado);
  if (!rol || rol.rol !== "EGRESADO") return respuestaError("Solo un egresado activo puede iniciar este tramite");

  const nombre = normalizarTexto(payload.nombre, 80);
  const apellido = normalizarTexto(payload.apellido, 80);
  const cuitCuil = normalizarCuit(payload.cuitCuil);
  const tituloOriginal = normalizarTexto(payload.tituloOriginal, 180);
  const analiticoOriginal = normalizarTexto(payload.analiticoOriginal, 180);
  const paisOrigen = normalizarTexto(payload.paisOrigen, 80);
  const universidadOrigen = normalizarTexto(payload.universidadOrigen, 160);

  if (!nombre || !apellido || !/^\d{11}$/.test(cuitCuil) || !tituloOriginal || !analiticoOriginal || !paisOrigen) {
    return respuestaError("Datos incompletos para tramite de titulo extranjero");
  }

  const tramite = {
    id: `EXT-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${Date.now().toString(16).toUpperCase()}`,
    walletEgresado,
    titular: { nombre, apellido, cuitCuil },
    tituloOriginal,
    analiticoOriginal,
    paisOrigen,
    universidadOrigen,
    estado: "Pendiente ministerio",
    fechaSolicitud: hoyIso(),
    tokenMinisterioId: "",
    tokenCancilleriaId: "",
    codigoRegistroFinal: "",
    flujo: [
      { actor: "Egresado", paso: "Solicitud de validacion extranjera", fecha: fechaDia(), estado: "Completado" },
      { actor: "Ministerio", paso: "Evaluacion inicial", fecha: "", estado: "Pendiente" },
      { actor: "Cancilleria", paso: "Apostillado internacional", fecha: "", estado: "Pendiente" },
      { actor: "Ministerio", paso: "Transferencia final al egresado", fecha: "", estado: "Pendiente" },
    ],
  };

  estado.tramitesExtranjero.unshift(tramite);
  persistirEstado();
  return { ok: true, data: tramite };
}

export function listarTramitesMinisterio(walletMinisterio) {
  const rol = buscarRolActivo(walletMinisterio);
  if (!rol || rol.rol !== "MINISTERIO") return respuestaError("Solo el ministerio puede ver tramites extranjeros");
  return {
    ok: true,
    data: estado.tramitesExtranjero.filter((t) => t.estado === "Pendiente ministerio"),
  };
}

export function resolverTramiteMinisterio(payload) {
  const walletMinisterio = normalizarWallet(payload.walletMinisterio);
  const rol = buscarRolActivo(walletMinisterio);
  if (!rol || rol.rol !== "MINISTERIO") return respuestaError("Solo el ministerio puede resolver tramites extranjeros");

  const tramite = estado.tramitesExtranjero.find((t) => t.id === normalizarTexto(payload.tramiteId, 64));
  const accion = normalizarTexto(payload.accion, 20).toLowerCase();
  const motivo = normalizarTexto(payload.motivo, 180);

  if (!tramite) return respuestaError("Tramite extranjero inexistente");
  if (tramite.estado !== "Pendiente ministerio") return respuestaError("El tramite no esta pendiente de ministerio");
  if (!["aprobar", "rechazar"].includes(accion)) return respuestaError("Accion invalida");

  if (accion === "rechazar") {
    tramite.estado = "Rechazado ministerio";
    tramite.flujo[1] = { actor: "Ministerio", paso: "Evaluacion inicial", fecha: fechaDia(), estado: "Rechazado" };
    tramite.motivoRechazo = motivo;
    persistirEstado();
    return { ok: true, data: tramite };
  }

  tramite.estado = "Pendiente cancilleria";
  tramite.tokenMinisterioId = `MIN-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  tramite.flujo[1] = {
    actor: "Ministerio",
    paso: "Generacion de token ministerial y envio a cancilleria",
    fecha: fechaDia(),
    estado: "Completado",
  };

  persistirEstado();

  return { ok: true, data: tramite };
}

export function listarTramitesCancilleria(walletCancilleria) {
  const rol = buscarRolActivo(walletCancilleria);
  if (!rol || rol.rol !== "CANCILLERIA") return respuestaError("Solo cancilleria puede ver tramites pendientes");
  return {
    ok: true,
    data: estado.tramitesExtranjero.filter((t) => t.estado === "Pendiente cancilleria"),
  };
}

export function resolverTramiteCancilleria(payload) {
  const walletCancilleria = normalizarWallet(payload.walletCancilleria);
  const rol = buscarRolActivo(walletCancilleria);
  if (!rol || rol.rol !== "CANCILLERIA") return respuestaError("Solo cancilleria puede resolver tramites");

  const tramite = estado.tramitesExtranjero.find((t) => t.id === normalizarTexto(payload.tramiteId, 64));
  const accion = normalizarTexto(payload.accion, 20).toLowerCase();
  const motivo = normalizarTexto(payload.motivo, 180);
  if (!tramite) return respuestaError("Tramite extranjero inexistente");
  if (tramite.estado !== "Pendiente cancilleria") return respuestaError("El tramite no esta pendiente de cancilleria");
  if (!["aprobar", "rechazar"].includes(accion)) return respuestaError("Accion invalida");

  if (accion === "rechazar") {
    tramite.estado = "Rechazado cancilleria";
    tramite.flujo[2] = { actor: "Cancilleria", paso: "Apostillado internacional", fecha: fechaDia(), estado: "Rechazado" };
    tramite.motivoRechazoCancilleria = motivo;
    persistirEstado();
    return { ok: true, data: tramite };
  }

  const codigoRegistro = generarCodigoRegistro();
  tramite.estado = "Certificado";
  tramite.tokenCancilleriaId = `CAN-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  tramite.codigoRegistroFinal = codigoRegistro;
  tramite.flujo[2] = {
    actor: "Cancilleria",
    paso: "Apostillado internacional y fusion de token",
    fecha: fechaDia(),
    estado: "Completado",
  };
  tramite.flujo[3] = {
    actor: "Ministerio",
    paso: "Transferencia final al egresado",
    fecha: fechaDia(),
    estado: "Completado",
  };

  estado.certificaciones.unshift({
    codigoRegistro,
    tokenCarreraId: `${tramite.tokenMinisterioId}+${tramite.tokenCancilleriaId}`,
    titular: tramite.titular,
    tipoCredencial: "Titulo extranjero apostillado",
    programa: tramite.tituloOriginal,
    carrera: tramite.tituloOriginal,
    planEstudio: "Validacion extranjera",
    matricula: "N/A",
    promedioEgreso: 0,
    anio: new Date().getFullYear(),
    institucion: tramite.universidadOrigen || "Institucion extranjera",
    estado: "Certificado",
    fechaEmision: fechaDia(),
    flujo: [...tramite.flujo],
  });

  persistirEstado();

  return { ok: true, data: tramite };
}

export function filtrarEmisiones(payload) {
  const desde = normalizarTexto(payload.desde, 12);
  const hasta = normalizarTexto(payload.hasta, 12);
  const anio = Number(payload.anio || 0);
  const universidad = normalizarTexto(payload.universidad, 160).toLowerCase();
  const carrera = normalizarTexto(payload.carrera, 160).toLowerCase();

  const data = estado.certificaciones.filter((item) => {
    const fecha = item.fechaEmision || item.flujo?.[0]?.fecha || "";
    const cumpleDesde = !desde || (fecha && fecha >= desde);
    const cumpleHasta = !hasta || (fecha && fecha <= hasta);
    const cumpleAnio = !anio || Number(item.anio || String(fecha).slice(0, 4)) === anio;
    const cumpleUniversidad = !universidad || String(item.institucion || "").toLowerCase().includes(universidad);
    const cumpleCarrera = !carrera || String(item.carrera || item.programa || "").toLowerCase().includes(carrera);
    return cumpleDesde && cumpleHasta && cumpleAnio && cumpleUniversidad && cumpleCarrera;
  });

  return { ok: true, data };
}

export function autorizarPorRol(wallet, rolEsperado) {
  const rol = buscarRolActivo(wallet);
  if (!rol || rol.rol !== rolEsperado) {
    return { ok: false, error: `Acceso restringido a rol ${rolEsperado}` };
  }
  return { ok: true, data: rol };
}

export function emitirCredencialMvp(payload) {
  const nombre = normalizarTexto(payload.nombre, 80);
  const apellido = normalizarTexto(payload.apellido, 80);
  const cuitCuil = normalizarCuit(payload.cuitCuil);
  const programa = normalizarTexto(payload.programa, 128);
  const tipoCredencial = normalizarTexto(payload.tipo, 32) || "Diploma";
  const institucion =
    normalizarTexto(payload.institucion, 128) || "Universidad Nacional de Tecnologia Aplicada";

  if (!nombre || !apellido || !cuitCuil || !programa) {
    return {
      ok: false,
      error: "Nombre, apellido, CUIT/CUIL y programa son obligatorios",
    };
  }

  if (!/^\d{11}$/.test(cuitCuil)) {
    return {
      ok: false,
      error: "El CUIT/CUIL debe contener 11 digitos",
    };
  }

  const codigoRegistro = generarCodigoRegistro();

  const credencial = {
    codigoRegistro,
    titular: { nombre, apellido, cuitCuil },
    tipoCredencial,
    programa,
    institucion,
    estado: "En proceso",
    flujo: generarFlujoInicial(),
  };

  estado.certificaciones.unshift(credencial);

  persistirEstado();

  return { ok: true, data: credencial };
}

export function buscarPorRegistroMvp(codigoRegistro) {
  const codigo = String(codigoRegistro || "").toUpperCase().trim();
  return estado.certificaciones.find((c) => c.codigoRegistro.toUpperCase() === codigo);
}

export function buscarTitularMvp({ nombre, apellido, cuitCuil }) {
  const n = String(nombre || "").trim().toLowerCase();
  const a = String(apellido || "").trim().toLowerCase();
  const c = String(cuitCuil || "").replace(/[^0-9]/g, "");

  return estado.certificaciones.filter((cert) => {
    const coincideNombre = !n || cert.titular.nombre.toLowerCase().includes(n);
    const coincideApellido = !a || cert.titular.apellido.toLowerCase().includes(a);
    const coincideCuit = !c || cert.titular.cuitCuil.includes(c);
    return coincideNombre && coincideApellido && coincideCuit;
  });
}

export function obtenerResumen(lista) {
  return {
    total: lista.length,
    enProceso: lista.filter((r) => r.estado === "En proceso").length,
    certificados: lista.filter((r) => r.estado !== "En proceso").length,
  };
}
