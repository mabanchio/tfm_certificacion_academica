import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import * as anchor from "@coral-xyz/anchor";
import { WALLET_ADMIN_SISTEMA } from "../config/sistema";

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
const IDL_PATH = path.join(process.cwd(), "target", "idl", "certificacion_academica.json");
const DEFAULT_INSTITUTION = "Universidad Nacional de Tecnologia Aplicada";
const DEFAULT_COUNTRY = "Argentina";
const ROLES_REGISTRO_OVERRIDES_PATH = path.join(process.cwd(), ".data", "roles_registro_overrides.json");
const TRAMITES_EXTRANJEROS_RESOLUCIONES_PATH = path.join(
  process.cwd(),
  ".data",
  "tramites_extranjeros_resoluciones.json"
);

let cache = null;

const ROLE_TO_CODE = {
  ADMIN: 1,
  UNIVERSIDAD: 2,
  MINISTERIO: 3,
  CANCILLERIA: 4,
  EGRESADO: 5,
};

const ROLE_FROM_ANCHOR = {
  admin: "ADMIN",
  universidad: "UNIVERSIDAD",
  ministerio: "MINISTERIO",
  cancilleria: "CANCILLERIA",
  egresado: "EGRESADO",
};

const REQUEST_STATUS_FROM_ANCHOR = {
  pending: "pendiente",
  approved: "aprobada",
  rejected: "rechazada",
};

const CREDENTIAL_STATUS_FROM_ANCHOR = {
  issued: "Vigente",
  revoked: "Revocado",
  reissued: "Reemitido",
  expired: "Expirado",
};

const MINISTRY_REQUEST_STATUS_FROM_ANCHOR = {
  pending: "pendiente",
  approved: "aprobada",
  rejected: "rechazada",
  senttocancilleria: "en_cancilleria",
  finalized: "finalizada",
};

const MINISTRY_REQUEST_TYPE_FROM_ANCHOR = {
  tokens: "TOKENS",
  foreigntitle: "TITULO_EXTRANJERO",
};

const TOKEN_STATUS_FROM_ANCHOR = {
  disponible: "disponible",
  asignado: "asignado",
  revocado: "revocado",
};

function asIso(unixSeconds) {
  const n = Number(unixSeconds || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Date(n * 1000).toISOString();
}

function expandHome(filePath) {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function loadKeypair() {
  const keypairPath = expandHome(process.env.ANCHOR_WALLET || "~/.config/solana/id.json");
  const raw = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
}

function decodeEnum(enumValue) {
  if (!enumValue) return "";
  if (typeof enumValue === "string") return enumValue.toLowerCase();
  const keys = Object.keys(enumValue);
  return keys.length ? String(keys[0]).toLowerCase() : "";
}

function mapRole(enumValue) {
  const decoded = decodeEnum(enumValue);
  return ROLE_FROM_ANCHOR[decoded] || "";
}

function mapRequestStatus(enumValue) {
  const decoded = decodeEnum(enumValue);
  return REQUEST_STATUS_FROM_ANCHOR[decoded] || "sin_solicitud";
}

function mapCredentialStatus(enumValue) {
  const decoded = decodeEnum(enumValue);
  return CREDENTIAL_STATUS_FROM_ANCHOR[decoded] || "Desconocido";
}

function mapMinistryRequestStatus(enumValue) {
  const decoded = decodeEnum(enumValue);
  return MINISTRY_REQUEST_STATUS_FROM_ANCHOR[decoded] || "pendiente";
}

function mapMinistryRequestType(enumValue) {
  const decoded = decodeEnum(enumValue);
  return MINISTRY_REQUEST_TYPE_FROM_ANCHOR[decoded] || "TOKENS";
}

function mapTokenStatus(enumValue) {
  const decoded = decodeEnum(enumValue);
  return TOKEN_STATUS_FROM_ANCHOR[decoded] || "disponible";
}

function normalizarWallet(wallet) {
  return String(wallet || "").trim();
}

function normalizarTextoComparacion(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function walletValida(wallet) {
  try {
    const w = normalizarWallet(wallet);
    if (!w) return false;
    new anchor.web3.PublicKey(w);
    return true;
  } catch (_e) {
    return false;
  }
}

function toPublicKey(wallet) {
  return new anchor.web3.PublicKey(normalizarWallet(wallet));
}

function normalizarRol(rol) {
  return String(rol || "").trim().toUpperCase();
}

function parsePaisesCsv(value) {
  return String(value || "")
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
}

function leerOverridesRegistroRoles() {
  try {
    if (!fs.existsSync(ROLES_REGISTRO_OVERRIDES_PATH)) return {};
    const raw = fs.readFileSync(ROLES_REGISTRO_OVERRIDES_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function guardarOverridesRegistroRoles(data) {
  const dir = path.dirname(ROLES_REGISTRO_OVERRIDES_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ROLES_REGISTRO_OVERRIDES_PATH, JSON.stringify(data, null, 2), "utf8");
}

function leerResolucionesTramitesExtranjeros() {
  try {
    if (!fs.existsSync(TRAMITES_EXTRANJEROS_RESOLUCIONES_PATH)) return {};
    const raw = fs.readFileSync(TRAMITES_EXTRANJEROS_RESOLUCIONES_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_e) {
    return {};
  }
}

function guardarResolucionesTramitesExtranjeros(data) {
  const dir = path.dirname(TRAMITES_EXTRANJEROS_RESOLUCIONES_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(TRAMITES_EXTRANJEROS_RESOLUCIONES_PATH, JSON.stringify(data, null, 2), "utf8");
}

function enriquecerTramitesConResolucionLocal(tramites) {
  const resoluciones = leerResolucionesTramitesExtranjeros();
  return (tramites || []).map((item) => {
    const extra = resoluciones[item.id] || {};
    return {
      ...item,
      codigoRegistro: String(extra.codigoRegistro || "").trim(),
      urlVerificacion: String(extra.urlVerificacion || "").trim(),
      notificacionEgresado: String(extra.notificacionEgresado || "").trim(),
      fechaNotificacion: String(extra.fechaNotificacion || "").trim(),
    };
  });
}

function claveRegistroRol(wallet, rol) {
  return `${normalizarWallet(wallet)}|${normalizarRol(rol)}`;
}

function generarCodigoRegistro() {
  const prefijo = crypto.randomBytes(5).toString("hex").toUpperCase();
  const sufijo = Date.now().toString(16).toUpperCase();
  return `${prefijo}${sufijo}`.slice(0, 32);
}

function generarFlujoInicial(fechaIso) {
  const fecha = String(fechaIso || "").slice(0, 10);
  return [
    { actor: "Universidad", paso: "Emision", fecha, estado: "Completado" },
    { actor: "Universidad", paso: "Legalizacion interna", fecha: "", estado: "Pendiente" },
    { actor: "Ministerio", paso: "Validacion ministerial", fecha: "", estado: "Pendiente" },
    { actor: "Cancilleria", paso: "Apostilla", fecha: "", estado: "Pendiente" },
  ];
}

function parseTokenIdDesdeLoteId(loteId) {
  const raw = String(loteId || "").trim();
  const match = raw.match(/^TKN-(\d+)$/i);
  if (!match) return 0;
  return Number(match[1] || 0);
}

function mapRoleRequest(pubkey, account) {
  return {
    id: pubkey.toBase58(),
    requestId: String(account.requestId?.toString?.() ?? account.requestId ?? ""),
    wallet: account.wallet.toBase58(),
    rolSolicitado: mapRole(account.roleRequested),
    identificacion: {
      nombre: account.nombre,
      entidad: account.entidad,
      documento: account.documento,
      email: account.email,
    },
    estado: mapRequestStatus(account.status),
    fechaSolicitud: asIso(account.requestedAt),
    fechaResolucion: asIso(account.resolvedAt),
    resueltoPor:
      account.resolvedBy && account.resolvedBy.toBase58() !== anchor.web3.PublicKey.default.toBase58()
        ? account.resolvedBy.toBase58()
        : "",
    motivoResolucion: account.resolutionReason || "",
  };
}

function parseTraceability(jsonRaw, fechaIso, estado) {
  if (!jsonRaw) {
    return generarFlujoInicial(fechaIso);
  }

  try {
    const parsed = JSON.parse(jsonRaw);
    if (Array.isArray(parsed)) return parsed;
  } catch (_e) {
    // Si no parsea, devuelve flujo minimo para no romper UI.
  }

  return [
    { actor: "Universidad", paso: "Emision", fecha: String(fechaIso).slice(0, 10), estado: "Completado" },
    { actor: "Sistema", paso: "Estado actual", fecha: "", estado },
  ];
}

function mapCredential(_pubkey, account) {
  const issueDateIso = asIso(account.issueDate);
  const estado = mapCredentialStatus(account.status);
  const codigoRegistro = account.registryCode || `ONCHAIN-${account.credentialId.toString()}`;
  return {
    codigoRegistro,
    tokenCarreraId: `CAR-${account.credentialId.toString()}`,
    titular: {
      nombre: account.holderName || "",
      apellido: account.holderLastName || "",
      cuitCuil: account.holderDocument || "",
      wallet: "",
      identificadorOnchain: account.recipient.toBase58(),
    },
    tipoCredencial: account.credentialType,
    programa: account.programName,
    carrera: account.programName,
    planEstudio: account.programName,
    matricula: "N/A",
    promedioEgreso: 0,
    anio: issueDateIso ? Number(issueDateIso.slice(0, 4)) : 0,
    institucion: account.institutionName || DEFAULT_INSTITUTION,
    estado,
    fechaEmision: issueDateIso ? issueDateIso.slice(0, 10) : "",
    flujo: parseTraceability(account.traceabilityJson, issueDateIso, estado),
  };
}

function mapMinistryRequest(pubkey, account) {
  let metadata = {};
  try {
    metadata = account.metadataJson ? JSON.parse(account.metadataJson) : {};
  } catch (_e) {
    metadata = {};
  }

  return {
    id: pubkey.toBase58(),
    requestId: String(account.requestId?.toString?.() ?? account.requestId ?? ""),
    tipo: mapMinistryRequestType(account.requestType),
    walletUniversidad: account.solicitanteWallet.toBase58(),
    universidad: account.universidad || "",
    carrera: account.carrera || "",
    planEstudio: account.planEstudio || "",
    matricula: account.matricula || "",
    anio: Number(account.anio || 0),
    cantidadEgresados: Number(account.cantidadEgresados || 0),
    estado: mapMinistryRequestStatus(account.status),
    fechaSolicitud: asIso(account.createdAt),
    fechaResolucion: asIso(account.updatedAt),
    motivoResolucion: account.resolutionReason || "",
    resueltoPor:
      account.reviewedBy && account.reviewedBy.toBase58() !== anchor.web3.PublicKey.default.toBase58()
        ? account.reviewedBy.toBase58()
        : "",
    loteId: account.tokenId ? `TKN-${String(account.tokenId?.toString?.() ?? account.tokenId)}` : "",
    titular: metadata.titular || { nombre: "", apellido: "" },
    paisOrigen: metadata.paisOrigen || "",
    universidadOrigen: metadata.universidadOrigen || "",
    tituloOriginal: metadata.tituloOriginal || "",
    analiticoOriginal: metadata.analiticoOriginal || "",
    analiticoPdfUrl: metadata.analiticoPdfUrl || "",
    analiticoPdfNombre: metadata.analiticoPdfNombre || "",
    analiticoPdfSha256: metadata.analiticoPdfSha256 || "",
    analiticoPdfId: metadata.analiticoPdfId || "",
    tokenMinisterioId: account.tokenId ? `MIN-${String(account.tokenId?.toString?.() ?? account.tokenId)}` : "",
    tokenCancilleriaId: account.secondaryTokenId
      ? `CAN-${String(account.secondaryTokenId?.toString?.() ?? account.secondaryTokenId)}`
      : "",
  };
}

function mapCertificationToken(pubkey, account) {
  const tokenId = String(account.tokenId?.toString?.() ?? account.tokenId ?? "0");
  return {
    id: `TKN-${tokenId}`,
    cuenta: pubkey.toBase58(),
    requestId: String(account.requestId?.toString?.() ?? account.requestId ?? ""),
    walletUniversidad: account.universidadWallet.toBase58(),
    universidad: account.universidad || "",
    carrera: account.titulo || "",
    anio: Number(account.anio || 0),
    estado: mapTokenStatus(account.status),
    cantidadTotal: Number(account.cantidadTotal || 0),
    cantidadDisponible: Number(account.cantidadDisponible || 0),
    fechaEmision: asIso(account.fechaCreacion),
    transferidoPor: account.creadoPor.toBase58(),
  };
}

async function construirMapaSolicitantesUniversidad(wallets) {
  const listaWallets = Array.from(
    new Set(
      (wallets || [])
        .map((wallet) => normalizarWallet(wallet))
        .filter(Boolean)
    )
  );

  if (!listaWallets.length) return {};

  const walletSet = new Set(listaWallets);
  const { program } = getClient();
  const solicitudes = (await program.account.roleRequest.all())
    .map((item) => mapRoleRequest(item.publicKey, item.account))
    .filter(
      (item) =>
        item.rolSolicitado === "UNIVERSIDAD" &&
        item.estado === "aprobada" &&
        walletSet.has(item.wallet)
    );

  const mapa = {};
  solicitudes.forEach((item) => {
    const actual = mapa[item.wallet];
    const fechaActual = String(actual?.fecha || "");
    const fechaItem = String(item.fechaResolucion || item.fechaSolicitud || "");
    if (!actual || fechaItem >= fechaActual) {
      mapa[item.wallet] = {
        wallet: item.wallet,
        nombre: item.identificacion?.nombre || "",
        email: item.identificacion?.email || "",
        entidad: item.identificacion?.entidad || "",
        fecha: fechaItem,
      };
    }
  });

  return mapa;
}

async function construirMapaIdentidadesWallet(wallets) {
  const listaWallets = Array.from(
    new Set(
      (wallets || [])
        .map((wallet) => normalizarWallet(wallet))
        .filter(Boolean)
    )
  );

  if (!listaWallets.length) return {};

  const walletSet = new Set(listaWallets);
  const { program } = getClient();
  const solicitudes = (await program.account.roleRequest.all())
    .map((item) => mapRoleRequest(item.publicKey, item.account))
    .filter((item) => item.estado === "aprobada" && walletSet.has(item.wallet));

  const mapa = {};
  solicitudes.forEach((item) => {
    const actual = mapa[item.wallet];
    const fechaActual = String(actual?.fecha || "");
    const fechaItem = String(item.fechaResolucion || item.fechaSolicitud || "");
    if (!actual || fechaItem >= fechaActual) {
      mapa[item.wallet] = {
        wallet: item.wallet,
        nombre: item.identificacion?.nombre || "",
        email: item.identificacion?.email || "",
        entidad: item.identificacion?.entidad || "",
        rol: item.rolSolicitado || "",
        fecha: fechaItem,
      };
    }
  });

  return mapa;
}

async function construirMapaRegistroRolAprobado({ incluirOverrides = true } = {}) {
  const { program } = getClient();
  const solicitudes = (await program.account.roleRequest.all())
    .map((item) => mapRoleRequest(item.publicKey, item.account))
    .filter((item) => item.estado === "aprobada");

  const mapa = {};
  solicitudes.forEach((item) => {
    const key = `${item.wallet}|${item.rolSolicitado}`;
    const actual = mapa[key];
    const fechaActual = String(actual?.fechaReferencia || "");
    const fechaItem = String(item.fechaResolucion || item.fechaSolicitud || "");
    if (!actual || fechaItem >= fechaActual) {
      mapa[key] = {
        solicitudId: item.id,
        rolSolicitado: item.rolSolicitado,
        nombre: item.identificacion?.nombre || "",
        entidad: item.identificacion?.entidad || "",
        documento: item.identificacion?.documento || "",
        email: item.identificacion?.email || "",
        paises: item.rolSolicitado === "CANCILLERIA" && item.identificacion?.entidad
          ? [String(item.identificacion.entidad).trim()]
          : [],
        fechaSolicitud: item.fechaSolicitud || "",
        fechaResolucion: item.fechaResolucion || "",
        fechaReferencia: fechaItem,
      };
    }
  });

  let perfiles = [];
  try {
    // En despliegues desfasados puede no existir aun la cuenta RoleProfile.
    perfiles = await program.account.roleProfile.all();
  } catch (_e) {
    perfiles = [];
  }

  perfiles.forEach(({ account }) => {
    const wallet = account.wallet.toBase58();
    const rol = mapRole(account.role);
    if (!wallet || !rol) return;

    const key = `${wallet}|${rol}`;
    const base = mapa[key] || {
      solicitudId: "",
      rolSolicitado: rol,
      nombre: "",
      entidad: "",
      documento: "",
      email: "",
      fechaSolicitud: "",
      fechaResolucion: "",
      fechaReferencia: "",
    };

    const nombre = String(account.nombre || "").trim();
    const entidad = String(account.entidad || "").trim();
    const documento = String(account.documento || "").trim();
    const email = String(account.email || "").trim();
    const universidad = String(account.universidad || "").trim();
    const paises = parsePaisesCsv(account.paisesCsv || account.paises_csv || "");
    const fechaPerfil = asIso(account.updatedAt || account.updated_at) || "";

    mapa[key] = {
      ...base,
      rolSolicitado: rol,
      nombre: nombre || base.nombre,
      entidad: entidad || base.entidad,
      documento: documento || base.documento,
      email: email || base.email,
      universidad: universidad || base.universidad || "",
      paises: paises.length > 0 ? paises : base.paises || [],
      fechaReferencia: fechaPerfil || base.fechaReferencia || "",
    };
  });

  if (incluirOverrides) {
    const overrides = leerOverridesRegistroRoles();
    Object.entries(overrides).forEach(([key, override]) => {
      const [wallet, rol] = String(key || "").split("|");
      if (!wallet || !rol || !override || typeof override !== "object") return;

      const base = mapa[key] || {
        solicitudId: "",
        rolSolicitado: rol,
        nombre: "",
        entidad: "",
        documento: "",
        email: "",
        fechaSolicitud: "",
        fechaResolucion: "",
        fechaReferencia: "",
      };

      mapa[key] = {
        ...base,
        nombres: String(override.nombres ?? "").trim(),
        apellidos: String(override.apellidos ?? "").trim(),
        nombre: String(override.nombre ?? base.nombre ?? "").trim(),
        entidad: String(override.entidad ?? base.entidad ?? "").trim(),
        documento: String(override.documento ?? base.documento ?? "").trim(),
        email: String(override.email ?? base.email ?? "").trim(),
        universidad: String(override.universidad ?? "").trim(),
        paises: Array.isArray(override.paises) ? override.paises : [],
        actualizadoPor: String(override.actualizadoPor || "").trim(),
        actualizadoPorNombre: String(override.actualizadoPorNombre || "").trim(),
        actualizadoEn: String(override.actualizadoEn || "").trim(),
      };
    });
  }

  return mapa;
}

async function enriquecerMinistryRequestsConIdentidades(solicitudes) {
  const wallets = (solicitudes || []).flatMap((item) => [
    item.walletUniversidad,
    item.resueltoPor,
  ]);
  const mapaIdentidades = await construirMapaIdentidadesWallet(wallets);

  return (solicitudes || []).map((item) => {
    const solicitante = mapaIdentidades[item.walletUniversidad] || {
      wallet: item.walletUniversidad,
      nombre: "",
      email: "",
      entidad: item.universidad || "",
      rol: "UNIVERSIDAD",
    };
    const resuelto = mapaIdentidades[item.resueltoPor] || { nombre: "" };

    return {
      ...item,
      solicitanteUniversidad: solicitante,
      solicitanteNombre: solicitante.nombre,
      solicitanteEmail: solicitante.email,
      resueltoNombre: resuelto.nombre || "",
    };
  });
}

async function obtenerUniversidadRegistradaDeWallet(walletUniversidad) {
  const wallet = normalizarWallet(walletUniversidad);
  if (!wallet) return "";
  const mapa = await construirMapaSolicitantesUniversidad([wallet]);
  return String(mapa?.[wallet]?.entidad || "").trim();
}

export function respuestaError(error) {
  return { ok: false, error };
}

export function obtenerResumen(lista) {
  return {
    total: lista.length,
    enProceso: lista.filter((r) => r.estado === "En proceso").length,
    certificados: lista.filter((r) => r.estado !== "En proceso").length,
  };
}

function getClient() {
  if (cache) return cache;

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const connection = new anchor.web3.Connection(SOLANA_RPC_URL, "confirmed");
  const keypair = loadKeypair();
  const wallet = {
    publicKey: keypair.publicKey,
    async signTransaction(tx) {
      tx.partialSign(keypair);
      return tx;
    },
    async signAllTransactions(txs) {
      txs.forEach((tx) => tx.partialSign(keypair));
      return txs;
    },
  };
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);

  cache = { idl, connection, wallet, provider, program, authority: keypair.publicKey };
  return cache;
}

function pdaConfig(programId) {
  return anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}

function pdaInstitution(programId, walletPubkey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("institution"), walletPubkey.toBuffer()],
    programId
  )[0];
}

function pdaRoleAssignment(programId, walletPubkey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_assignment"), walletPubkey.toBuffer()],
    programId
  )[0];
}

function pdaRoleProfile(programId, walletPubkey) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_profile"), walletPubkey.toBuffer()],
    programId
  )[0];
}

function pdaRoleRequest(programId, walletPubkey, requestIdBn) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("role_request"), walletPubkey.toBuffer(), requestIdBn.toArrayLike(Buffer, "le", 8)],
    programId
  )[0];
}

function pdaCredential(programId, issuerPubkey, credentialIdBn) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("credential"), issuerPubkey.toBuffer(), credentialIdBn.toArrayLike(Buffer, "le", 8)],
    programId
  )[0];
}

function pdaMinistryRequest(programId, walletPubkey, requestIdBn) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("ministry_request"), walletPubkey.toBuffer(), requestIdBn.toArrayLike(Buffer, "le", 8)],
    programId
  )[0];
}

function pdaCertificationToken(programId, walletPubkey, tokenIdBn) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("certification_token"), walletPubkey.toBuffer(), tokenIdBn.toArrayLike(Buffer, "le", 8)],
    programId
  )[0];
}

async function fetchNullable(fetcher, key) {
  try {
    return await fetcher.fetch(key);
  } catch (_e) {
    return null;
  }
}

async function asegurarConfig() {
  const { program, authority } = getClient();
  const config = pdaConfig(program.programId);
  const actual = await fetchNullable(program.account.programConfig, config);
  if (actual) return { config, data: actual };

  await program.methods
    .initialize()
    .accounts({
      config,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const creado = await program.account.programConfig.fetch(config);
  return { config, data: creado };
}

async function asegurarInstitution() {
  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const institution = pdaInstitution(program.programId, authority);
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);
  const actual = await fetchNullable(program.account.institution, institution);
  if (actual) {
    if (!actual.isActive) {
      await program.methods
        .setInstitutionStatus(true)
        .accounts({
          config,
          institution,
          authority,
        })
        .rpc();
    }
    return institution;
  }

  await program.methods
    .registerInstitution(authority, DEFAULT_INSTITUTION, DEFAULT_COUNTRY)
    .accounts({
      config,
      institution,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  return institution;
}

async function asegurarAdminSistema() {
  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const adminPubkey = toPublicKey(WALLET_ADMIN_SISTEMA);
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);
  const roleAssignment = pdaRoleAssignment(program.programId, adminPubkey);
  const existente = await fetchNullable(program.account.roleAssignment, roleAssignment);
  if (existente && existente.active && mapRole(existente.role) === "ADMIN") {
    return;
  }

  await program.methods
    .upsertRole(adminPubkey, ROLE_TO_CODE.ADMIN, true)
    .accounts({
      config,
      roleAssignment,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();
}

async function esAdmin(wallet) {
  if (!walletValida(wallet)) return false;
  const { program } = getClient();
  const walletPubkey = toPublicKey(wallet);
  const roleAssignment = pdaRoleAssignment(program.programId, walletPubkey);
  const role = await fetchNullable(program.account.roleAssignment, roleAssignment);
  if (!role) return false;
  return role.active && mapRole(role.role) === "ADMIN";
}

/**
 * Resuelve el nombre del titular de una wallet al momento de la operacion.
 * Busca en los overrides locales; si no hay, intenta reconstruirlo desde las
 * solicitudes on-chain. Devuelve siempre un string (abreviatura de wallet como fallback).
 */
async function resolverNombreTitular(walletStr) {
  const wallet = normalizarWallet(walletStr);
  if (!walletValida(wallet)) return wallet.slice(0, 8) || "desconocido";
  try {
    const overrides = leerOverridesRegistroRoles();
    // Buscar en overrides por cualquier clave que comience con esta wallet
    const claveEncontrada = Object.keys(overrides).find((k) => k.startsWith(`${wallet}|`));
    if (claveEncontrada) {
      const r = overrides[claveEncontrada];
      const nombre = String(r.nombre || r.apellidos || r.nombres || "").trim();
      if (nombre) return nombre;
    }
    // Fallback: buscar en solicitudes on-chain aprobadas
    const { program } = getClient();
    const walletPk = toPublicKey(wallet);
    const walletB58 = walletPk.toBase58();
    const solicitudes = await program.account.roleRequest.all();
    const aprobada = solicitudes
      .map((i) => mapRoleRequest(i.publicKey, i.account))
      .filter((i) => i.wallet === walletB58 && i.estado === "aprobada")
      .sort((a, b) => (a.fechaResolucion > b.fechaResolucion ? -1 : 1))[0];
    if (aprobada?.identificacion?.nombre) return aprobada.identificacion.nombre;
  } catch (_e) {
    // silencioso
  }
  return wallet.slice(0, 8);
}

export async function obtenerEstadoWalletOnchain(walletEntrada) {
  await asegurarAdminSistema();
  const wallet = normalizarWallet(walletEntrada);

  if (!walletValida(wallet)) {
    return {
      ok: true,
      data: {
        wallet,
        walletValida: false,
        estadoSolicitud: "sin_solicitud",
        rolActivo: null,
        rolesDisponibles: [],
      },
    };
  }

  const { program } = getClient();
  const walletPubkey = toPublicKey(wallet);

  const roleAssignment = pdaRoleAssignment(program.programId, walletPubkey);
  const rol = await fetchNullable(program.account.roleAssignment, roleAssignment);

  const solicitudes = await program.account.roleRequest.all([
    {
      memcmp: {
        offset: 16,
        bytes: walletPubkey.toBase58(),
      },
    },
  ]);

  const solicitudesMapeadas = solicitudes
    .map((item) => mapRoleRequest(item.publicKey, item.account))
    .sort((a, b) => (a.fechaSolicitud < b.fechaSolicitud ? 1 : -1));

  const rolesAprobados = Array.from(
    new Set(
      solicitudesMapeadas
        .filter((item) => item.estado === "aprobada")
        .map((item) => String(item.rolSolicitado || "").toUpperCase())
        .filter(Boolean)
    )
  );

  if (rol && rol.active) {
    const rolActivo = mapRole(rol.role);
    return {
      ok: true,
      data: {
        wallet,
        walletValida: true,
        estadoSolicitud: "aprobada",
        rolActivo,
        rolesDisponibles: Array.from(new Set([rolActivo, ...rolesAprobados].filter(Boolean))),
      },
    };
  }

  if (!solicitudes.length) {
    return {
      ok: true,
      data: {
        wallet,
        walletValida: true,
        estadoSolicitud: "sin_solicitud",
        rolActivo: null,
        rolesDisponibles: [],
      },
    };
  }

  const ultima = solicitudesMapeadas[0];

  return {
    ok: true,
    data: {
      wallet,
      walletValida: true,
      estadoSolicitud: rolesAprobados.length ? "aprobada" : ultima.estado,
      rolActivo: null,
      rolesDisponibles: rolesAprobados,
      solicitud: ultima,
    },
  };
}

export async function obtenerPerfilRolOnchain(walletEntrada) {
  await asegurarAdminSistema();
  const wallet = normalizarWallet(walletEntrada);

  if (!walletValida(wallet)) {
    return { ok: false, error: "Wallet invalida" };
  }

  const estado = await obtenerEstadoWalletOnchain(wallet);
  if (!estado.ok) return estado;

  const { program } = getClient();
  const walletPk = toPublicKey(wallet);
  const rolActivo = String(estado?.data?.rolActivo || "").toUpperCase();

  const solicitudAprobada = (await program.account.roleRequest.all())
    .map((item) => mapRoleRequest(item.publicKey, item.account))
    .filter(
      (item) =>
        item.wallet === walletPk.toBase58() &&
        item.estado === "aprobada" &&
        (!rolActivo || item.rolSolicitado === rolActivo)
    )
    .sort((a, b) => (a.fechaResolucion < b.fechaResolucion ? 1 : -1))[0];

  const documentoRegistrado = String(solicitudAprobada?.identificacion?.documento || "").trim();
  const cuitMatch = documentoRegistrado.match(/CUIT\s*:\s*(\d{11})/i);
  const dniMatch = documentoRegistrado.match(/DNI\s*:\s*(\d{7,8})/i);

  return {
    ok: true,
    data: {
      wallet,
      rolActivo,
      entidadRegistrada: solicitudAprobada?.identificacion?.entidad || "",
      nombreRegistrado: solicitudAprobada?.identificacion?.nombre || "",
      documentoRegistrado,
      cuitCuilRegistrado: cuitMatch?.[1] || "",
      dniRegistrado: dniMatch?.[1] || "",
      emailRegistrado: solicitudAprobada?.identificacion?.email || "",
    },
  };
}

export async function crearSolicitudRolOnchain(payload) {
  await asegurarAdminSistema();
  const wallet = normalizarWallet(payload.wallet);
  const rolSolicitado = String(payload.rolSolicitado || "").trim().toUpperCase();
  const nombreBase = String(payload.nombre || "").trim();
  const nombres = String(payload.nombres || "").trim();
  const apellido = String(payload.apellido || payload.apellidos || "").trim();
  const nombre = nombreBase || `${apellido}${apellido && nombres ? ", " : ""}${nombres}`.trim();
  const dni = String(payload.dni || "").replace(/[^0-9]/g, "").slice(0, 8);
  const cuitCuil = String(payload.cuitCuil || "").replace(/[^0-9]/g, "").slice(0, 11);
  const entidadIngresada = String(payload.entidad || "").trim();
  const paisCancilleria = String(payload.pais || payload.paisCancilleria || "").trim();
  const entidad = rolSolicitado === "EGRESADO"
    ? "NO_APLICA_EGRESADO"
    : rolSolicitado === "CANCILLERIA"
      ? (paisCancilleria || entidadIngresada)
      : entidadIngresada;
  const documentoBase = String(payload.documento || "").trim();
  const documento = documentoBase || `DNI:${dni}|CUIT:${cuitCuil}`;
  const email = String(payload.email || "").trim();

  if (!walletValida(wallet)) return respuestaError("Wallet invalida");
  if (!ROLE_TO_CODE[rolSolicitado] || rolSolicitado === "ADMIN") return respuestaError("Rol solicitado invalido");
  if (!/^\d{7,8}$/.test(dni)) return respuestaError("El DNI debe contener 7 u 8 digitos");
  if (!/^\d{11}$/.test(cuitCuil)) return respuestaError("El CUIT/CUIL debe contener 11 digitos");

  if (!nombre || !documento || !email || (rolSolicitado !== "EGRESADO" && !entidad)) {
    return respuestaError("Complete todos los datos de identificacion del rol");
  }

  const estado = await obtenerEstadoWalletOnchain(wallet);
  if (!estado.ok) return estado;
  if (estado.data.rolActivo) return respuestaError("La wallet ya tiene un rol activo");
  if (estado.data.estadoSolicitud === "pendiente") {
    return respuestaError("Ya existe una solicitud pendiente para esta wallet");
  }

  const { program, authority } = getClient();
  const { config, data } = await asegurarConfig();
  const walletPubkey = toPublicKey(wallet);
  const requestId = new anchor.BN(Number(data.roleRequestCounter || 0) + 1);
  const roleRequest = pdaRoleRequest(program.programId, walletPubkey, requestId);

  await program.methods
    .requestRole(walletPubkey, requestId, ROLE_TO_CODE[rolSolicitado], nombre, entidad, documento, email)
    .accounts({
      config,
      roleRequest,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const creada = await program.account.roleRequest.fetch(roleRequest);
  return { ok: true, data: mapRoleRequest(roleRequest, creada) };
}

export async function listarSolicitudesRolOnchain({ walletAdmin, estadoFiltro }) {
  await asegurarAdminSistema();
  if (!(await esAdmin(walletAdmin))) return respuestaError("Solo el administrador puede ver solicitudes");

  const { program } = getClient();
  const filtro = String(estadoFiltro || "").trim().toLowerCase();
  const data = (await program.account.roleRequest.all())
    .map((item) => mapRoleRequest(item.publicKey, item.account))
    .filter((item) => !filtro || item.estado === filtro)
    .sort((a, b) => (a.fechaSolicitud < b.fechaSolicitud ? 1 : -1));

  return { ok: true, data };
}

export async function resolverSolicitudRolOnchain(payload) {
  await asegurarAdminSistema();
  const walletAdmin = normalizarWallet(payload.walletAdmin);
  if (!(await esAdmin(walletAdmin))) return respuestaError("Solo el administrador puede resolver solicitudes");

  const solicitudPkRaw = String(payload.solicitudId || "").trim();
  const accion = String(payload.accion || "").trim().toLowerCase();
  const motivo = String(payload.motivo || "").trim();

  if (!solicitudPkRaw) return respuestaError("Solicitud de rol inexistente");
  if (!["aprobar", "rechazar"].includes(accion)) return respuestaError("Accion invalida");

  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const solicitudPk = toPublicKey(solicitudPkRaw);
  const solicitud = await fetchNullable(program.account.roleRequest, solicitudPk);
  if (!solicitud) return respuestaError("Solicitud de rol inexistente");

  const requestId = new anchor.BN(Number(solicitud.requestId));
  const roleAssignment = pdaRoleAssignment(program.programId, solicitud.wallet);
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);
  const roleProfile = pdaRoleProfile(program.programId, solicitud.wallet);

  const txSignature = await program.methods
    .resolveRoleRequest(requestId, accion === "aprobar" ? 1 : 2, motivo)
    .accounts({
      config,
      roleRequest: solicitudPk,
      roleAssignment,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const actualizada = await program.account.roleRequest.fetch(solicitudPk);
  const salida = mapRoleRequest(solicitudPk, actualizada);

  let txProfileSignature = "";

  if (accion === "aprobar") {
    const rolAprobado = await fetchNullable(program.account.roleAssignment, roleAssignment);
    if (!rolAprobado || !rolAprobado.active) {
      return respuestaError("La solicitud se proceso pero el rol no quedo activo on-chain");
    }

    const rolAprobadoTexto = mapRole(rolAprobado.role);
    const entidadAprobada = String(actualizada.entidad || "").trim();
    const paisesCsv = rolAprobadoTexto === "CANCILLERIA" && entidadAprobada ? entidadAprobada : "";

    txProfileSignature = await program.methods
      .upsertRoleProfile(
        solicitud.wallet,
        ROLE_TO_CODE[rolAprobadoTexto],
        String(actualizada.nombre || "").trim(),
        entidadAprobada,
        String(actualizada.documento || "").trim(),
        String(actualizada.email || "").trim(),
        "",
        paisesCsv
      )
      .accounts({
        config,
        roleProfile,
        authorityRoleAssignment,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  return { ok: true, data: { ...salida, txSignature, txProfileSignature } };
}

export async function listarRolesActivosOnchain(walletAdmin) {
  await asegurarAdminSistema();
  if (!(await esAdmin(walletAdmin))) return respuestaError("Solo el administrador puede ver roles activos");

  const { program } = getClient();
  const mapaRegistro = await construirMapaRegistroRolAprobado({ incluirOverrides: false });
  const data = (await program.account.roleAssignment.all())
    .map(({ account }) => {
      const wallet = account.wallet.toBase58();
      const rol = mapRole(account.role);
      const registroRol = mapaRegistro[`${wallet}|${rol}`] || null;

      return {
        wallet,
        rol,
        estado: account.active ? "activo" : "deshabilitado",
        fechaAlta: asIso(account.updatedAt),
        fechaActualizacion: asIso(account.updatedAt),
        registroRol,
      };
    })
    .filter((item) => item.estado === "activo");

  return { ok: true, data };
}

export async function otorgarRolAdminOnchain(payload) {
  await asegurarAdminSistema();
  const walletAdmin = normalizarWallet(payload.walletAdmin);
  if (!(await esAdmin(walletAdmin))) return respuestaError("Solo el administrador puede otorgar rol ADMIN");
  if (walletAdmin !== WALLET_ADMIN_SISTEMA) {
    return respuestaError("Solo el administrador principal puede otorgar rol ADMIN");
  }

  const firmanteNombre = await resolverNombreTitular(walletAdmin);
  const walletObjetivo = normalizarWallet(payload.walletObjetivo);
  if (!walletValida(walletObjetivo)) return respuestaError("Wallet objetivo invalida");

  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const walletPk = toPublicKey(walletObjetivo);
  const roleAssignment = pdaRoleAssignment(program.programId, walletPk);
  const roleProfile = pdaRoleProfile(program.programId, walletPk);
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);

  const existente = await fetchNullable(program.account.roleAssignment, roleAssignment);
  if (existente?.active) {
    const rolExistente = mapRole(existente.role);
    if (rolExistente === "ADMIN") {
      return respuestaError("La wallet objetivo ya tiene rol ADMIN activo");
    }
    // Si tiene rol operativo activo, preservar sus datos personales migrando el override
    if (rolExistente) {
      const overrides = leerOverridesRegistroRoles();
      const claveAnterior = claveRegistroRol(walletObjetivo, rolExistente);
      if (overrides[claveAnterior]) {
        const claveAdmin = claveRegistroRol(walletObjetivo, "ADMIN");
        // Copiar datos al nuevo key, guardando referencia del rol previo
        overrides[claveAdmin] = {
          ...overrides[claveAnterior],
          rolAnterior: rolExistente,
          actualizadoPor: walletAdmin,
          actualizadoPorNombre: firmanteNombre,
          actualizadoEn: new Date().toISOString(),
        };
        guardarOverridesRegistroRoles(overrides);
      }
    }
  }

  await program.methods
    .upsertRole(walletPk, ROLE_TO_CODE.ADMIN, true)
    .accounts({
      config,
      roleAssignment,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const actualizado = await program.account.roleAssignment.fetch(roleAssignment);
  return {
    ok: true,
    data: {
      wallet: actualizado.wallet.toBase58(),
      rol: mapRole(actualizado.role),
      estado: actualizado.active ? "activo" : "deshabilitado",
      fechaAlta: asIso(actualizado.updatedAt),
      fechaActualizacion: asIso(actualizado.updatedAt),
      firmanteWallet: walletAdmin,
      firmanteNombre,
      fechaFirma: new Date().toISOString(),
    },
  };
}

export async function actualizarRegistroRolOnchain(payload) {
  await asegurarAdminSistema();
  const walletAdmin = normalizarWallet(payload.walletAdmin);
  if (!(await esAdmin(walletAdmin))) return respuestaError("Solo un administrador puede actualizar datos de registro");

  const walletObjetivo = normalizarWallet(payload.walletObjetivo);
  const rolActual = normalizarRol(payload.rol);
  const rolNuevo = normalizarRol(payload.rolAsignado || payload.rol);
  if (!walletValida(walletObjetivo)) return respuestaError("Wallet objetivo invalida");
  if (!ROLE_TO_CODE[rolActual]) return respuestaError("Rol actual invalido");
  if (!ROLE_TO_CODE[rolNuevo]) return respuestaError("Rol nuevo invalido");

  const nombres = String(payload.nombres || "").trim();
  const apellidos = String(payload.apellidos || "").trim();
  const nombre = apellidos && nombres
    ? `${apellidos}, ${nombres}`
    : apellidos || nombres || String(payload.nombre || "").trim();
  const entidad = String(payload.entidad || "").trim();
  const documento = String(payload.documento || "").trim();
  const email = String(payload.email || "").trim();
  const universidad = String(payload.universidad || "").trim();
  const paisesRaw = payload.paises;
  const paises = Array.isArray(paisesRaw)
    ? paisesRaw.map((p) => String(p || "").trim()).filter(Boolean)
    : String(paisesRaw || "").split(",").map((p) => p.trim()).filter(Boolean);

  // Obtener nombre del admin para auditoría
  const overridesActuales = leerOverridesRegistroRoles();
  const claveAdmin = claveRegistroRol(walletAdmin, "ADMIN");
  const registroAdmin = overridesActuales[claveAdmin] || {};
  const titularAdmin = (
    String(registroAdmin.nombre || registroAdmin.apellidos || "").trim() ||
    walletAdmin.slice(0, 8)
  );

  // Siempre escribir en blockchain para dejar trazabilidad de la operacion
  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const walletPk = toPublicKey(walletObjetivo);
  const roleAssignment = pdaRoleAssignment(program.programId, walletPk);
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);

  const existente = await fetchNullable(program.account.roleAssignment, roleAssignment);
  if (!existente || !existente.active) {
    return respuestaError("No existe rol activo para esta wallet; no se puede actualizar el registro");
  }

  const txSignature = await program.methods
    .upsertRole(walletPk, ROLE_TO_CODE[rolNuevo], true)
    .accounts({
      config,
      roleAssignment,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const paisesCsv = paises.join(" | ");
  const txProfileSignature = await program.methods
    .upsertRoleProfile(walletPk, ROLE_TO_CODE[rolNuevo], nombre, entidad, documento, email, universidad, paisesCsv)
    .accounts({
      config,
      roleProfile,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  // Si cambio el rol, eliminar el override anterior
  if (rolNuevo !== rolActual) {
    const overrides = leerOverridesRegistroRoles();
    const claveAnterior = claveRegistroRol(walletObjetivo, rolActual);
    delete overrides[claveAnterior];
    guardarOverridesRegistroRoles(overrides);
  }

  const overrides = leerOverridesRegistroRoles();
  const key = claveRegistroRol(walletObjetivo, rolNuevo);
  const ahora = new Date().toISOString();
  overrides[key] = {
    nombres,
    apellidos,
    nombre,
    entidad,
    documento,
    email,
    universidad,
    paises,
    actualizadoPor: walletAdmin,
    actualizadoPorNombre: titularAdmin,
    actualizadoEn: ahora,
  };
  guardarOverridesRegistroRoles(overrides);

  return {
    ok: true,
    data: {
      wallet: walletObjetivo,
      rol: rolNuevo,
      txSignature,
      txProfileSignature,
      firmanteWallet: walletAdmin,
      firmanteNombre: titularAdmin,
      fechaFirma: ahora,
      registroRol: {
        solicitudId: "",
        rolSolicitado: rolNuevo,
        nombres,
        apellidos,
        nombre,
        entidad,
        documento,
        email,
        universidad,
        paises,
        actualizadoPor: walletAdmin,
        actualizadoPorNombre: titularAdmin,
        actualizadoEn: ahora,
      },
    },
  };
}

export async function deshabilitarRolOnchain(payload) {
  await asegurarAdminSistema();
  const walletAdmin = normalizarWallet(payload.walletAdmin);
  if (!(await esAdmin(walletAdmin))) return respuestaError("Solo el administrador puede deshabilitar roles");

  const firmanteNombre = await resolverNombreTitular(walletAdmin);

  const walletObjetivo = normalizarWallet(payload.walletObjetivo);
  if (!walletValida(walletObjetivo)) return respuestaError("Wallet objetivo invalida");
  if (walletObjetivo === WALLET_ADMIN_SISTEMA) return respuestaError("No es posible deshabilitar el administrador principal");

  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const walletPk = toPublicKey(walletObjetivo);
  const roleAssignment = pdaRoleAssignment(program.programId, walletPk);
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);

  const existente = await fetchNullable(program.account.roleAssignment, roleAssignment);
  if (!existente || !existente.active) return respuestaError("No existe rol activo para la wallet indicada");

  const txSignature = await program.methods
    .upsertRole(walletPk, ROLE_TO_CODE[mapRole(existente.role)] || 5, false)
    .accounts({
      config,
      roleAssignment,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const actualizado = await program.account.roleAssignment.fetch(roleAssignment);
  if (actualizado.active) {
    return respuestaError("No se pudo deshabilitar el rol on-chain");
  }

  return {
    ok: true,
    data: {
      wallet: actualizado.wallet.toBase58(),
      rol: mapRole(actualizado.role),
      estado: actualizado.active ? "activo" : "deshabilitado",
      fechaActualizacion: asIso(actualizado.updatedAt),
      motivo: String(payload.motivo || "").trim(),
      txSignature,
      firmanteWallet: walletAdmin,
      firmanteNombre,
      fechaFirma: new Date().toISOString(),
    },
  };
}

export async function autorizarPorRolOnchain(wallet, rolEsperado) {
  const estado = await obtenerEstadoWalletOnchain(wallet);
  if (!estado.ok) return estado;
  if (estado.data.rolActivo !== rolEsperado) {
    return { ok: false, error: `Acceso restringido a rol ${rolEsperado}` };
  }
  return { ok: true, data: { wallet, rol: rolEsperado } };
}

export async function solicitarLoteUniversidadOnchain(payload) {
  await asegurarAdminSistema();
  const walletUniversidad = normalizarWallet(payload.walletUniversidad);
  const auth = await autorizarPorRolOnchain(walletUniversidad, "UNIVERSIDAD");
  if (!auth.ok) return respuestaError("Solo una universidad activa puede solicitar lotes");

  const universidadPayload = String(payload.universidad || "").trim();
  const universidadRegistrada = await obtenerUniversidadRegistradaDeWallet(walletUniversidad);
  const universidad = universidadRegistrada || universidadPayload;
  const carrera = String(payload.carrera || "").trim();
  const planEstudio = String(payload.planEstudio || "").trim();
  const matricula = String(payload.matricula || "").trim();
  const anio = Number(payload.anio || 0);
  const cantidadEgresados = Number(payload.cantidadEgresados || 0);

  if (!universidad || !carrera || !planEstudio || !matricula || !anio || cantidadEgresados < 1) {
    return respuestaError("Datos incompletos para solicitar lote");
  }
  if (
    universidadRegistrada &&
    universidadPayload &&
    normalizarTextoComparacion(universidadPayload) !== normalizarTextoComparacion(universidadRegistrada)
  ) {
    return respuestaError("La universidad de la solicitud debe coincidir con la universidad registrada de la wallet");
  }

  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);
  const walletPk = toPublicKey(walletUniversidad);
  const requestId = new anchor.BN(Date.now() + Math.floor(Math.random() * 1000));
  const ministryRequest = pdaMinistryRequest(program.programId, walletPk, requestId);

  await program.methods
    .requestTokens(
      requestId,
      walletPk,
      universidad,
      carrera,
      planEstudio,
      matricula,
      anio,
      cantidadEgresados
    )
    .accounts({
      config,
      ministryRequest,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const creada = await program.account.ministryRequest.fetch(ministryRequest);
  return { ok: true, data: mapMinistryRequest(ministryRequest, creada) };
}

export async function listarSolicitudesLotesMinisterioOnchain(walletMinisterio) {
  await asegurarAdminSistema();
  const auth = await autorizarPorRolOnchain(walletMinisterio, "MINISTERIO");
  if (!auth.ok) return respuestaError("Solo el ministerio puede ver solicitudes de lotes");

  const { program } = getClient();
  const solicitudes = (await program.account.ministryRequest.all())
    .map((item) => mapMinistryRequest(item.publicKey, item.account))
    .filter((item) => item.tipo === "TOKENS")
    .sort((a, b) => (a.fechaSolicitud < b.fechaSolicitud ? 1 : -1));

  const data = await enriquecerMinistryRequestsConIdentidades(solicitudes);

  return { ok: true, data };
}

export async function resolverSolicitudLoteMinisterioOnchain(payload) {
  await asegurarAdminSistema();
  const walletMinisterio = normalizarWallet(payload.walletMinisterio);
  const auth = await autorizarPorRolOnchain(walletMinisterio, "MINISTERIO");
  if (!auth.ok) return respuestaError("Solo el ministerio puede resolver lotes");

  const solicitudId = String(payload.solicitudId || "").trim();
  const accion = String(payload.accion || "").trim().toLowerCase();
  const motivo = String(payload.motivo || "").trim();
  if (!solicitudId) return respuestaError("Solicitud de lote inexistente");
  if (!["aprobar", "rechazar"].includes(accion)) return respuestaError("Accion invalida");
  if (accion === "rechazar" && !motivo) return respuestaError("Debe ingresar un motivo de rechazo");

  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);
  const ministryRequest = toPublicKey(solicitudId);
  const solicitud = await fetchNullable(program.account.ministryRequest, ministryRequest);
  if (!solicitud) return respuestaError("Solicitud de lote inexistente");

  const requestId = new anchor.BN(Number(solicitud.requestId));
  if (accion === "aprobar") {
    const tokenId = new anchor.BN(Date.now() + Math.floor(Math.random() * 1000));
    const certificationToken = pdaCertificationToken(program.programId, solicitud.solicitanteWallet, tokenId);
    await program.methods
      .approveTokenRequest(requestId, tokenId, solicitud.carrera)
      .accounts({
        config,
        ministryRequest,
        certificationToken,
        authorityRoleAssignment,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  } else {
    await program.methods
      .rejectTokenRequest(requestId, motivo)
      .accounts({
        config,
        ministryRequest,
        authorityRoleAssignment,
        authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  }

  const actualizada = await program.account.ministryRequest.fetch(ministryRequest);
  return { ok: true, data: mapMinistryRequest(ministryRequest, actualizada) };
}

export async function listarLotesUniversidadOnchain(walletUniversidad) {
  await asegurarAdminSistema();
  const auth = await autorizarPorRolOnchain(walletUniversidad, "UNIVERSIDAD");
  if (!auth.ok) return respuestaError("Solo una universidad activa puede ver sus lotes");

  const universidadRegistrada = await obtenerUniversidadRegistradaDeWallet(walletUniversidad);
  if (!universidadRegistrada) {
    return respuestaError("La wallet no tiene universidad registrada/aprobada para filtrar lotes");
  }

  const { program } = getClient();
  const universidadFiltro = normalizarTextoComparacion(universidadRegistrada);
  const data = (await program.account.certificationToken.all())
    .map((item) => mapCertificationToken(item.publicKey, item.account))
    .filter(
      (item) =>
        item.estado === "disponible" &&
        normalizarTextoComparacion(item.universidad) === universidadFiltro
    );

  return { ok: true, data };
}

export async function listarSolicitudesLotesUniversidadOnchain(walletUniversidad) {
  await asegurarAdminSistema();
  const auth = await autorizarPorRolOnchain(walletUniversidad, "UNIVERSIDAD");
  if (!auth.ok) return respuestaError("Solo una universidad activa puede ver el seguimiento de sus solicitudes");

  const walletNormalizada = normalizarWallet(walletUniversidad);
  const universidadRegistrada = await obtenerUniversidadRegistradaDeWallet(walletNormalizada);
  if (!universidadRegistrada) {
    return respuestaError("La wallet no tiene universidad registrada/aprobada para filtrar solicitudes");
  }

  const { program } = getClient();
  const universidadFiltro = normalizarTextoComparacion(universidadRegistrada);
  const solicitudes = (await program.account.ministryRequest.all())
    .map((item) => mapMinistryRequest(item.publicKey, item.account))
    .filter(
      (item) =>
        item.tipo === "TOKENS" &&
        normalizarTextoComparacion(item.universidad) === universidadFiltro
    )
    .sort((a, b) => (a.fechaSolicitud < b.fechaSolicitud ? 1 : -1));

  const data = await enriquecerMinistryRequestsConIdentidades(solicitudes);

  return { ok: true, data };
}

export async function solicitarValidacionExtranjeraOnchain(payload) {
  await asegurarAdminSistema();
  const walletEgresado = normalizarWallet(payload.walletEgresado);
  const auth = await autorizarPorRolOnchain(walletEgresado, "EGRESADO");
  if (!auth.ok) return respuestaError("Solo un egresado activo puede solicitar validacion extranjera");

  const nombre = String(payload.nombre || "").trim();
  const apellido = String(payload.apellido || "").trim();
  const cuitCuil = String(payload.cuitCuil || "").replace(/[^0-9]/g, "").slice(0, 11);
  const tituloOriginal = String(payload.tituloOriginal || "").trim();
  const analiticoOriginal = String(payload.analiticoOriginal || "").trim();
  const analiticoPdfUrl = String(payload.analiticoPdfUrl || "").trim();
  const analiticoPdfNombre = String(payload.analiticoPdfNombre || "").trim();
  const analiticoPdfSha256 = String(payload.analiticoPdfSha256 || "").trim();
  const analiticoPdfId = String(payload.analiticoPdfId || "").trim();
  const paisOrigen = String(payload.paisOrigen || "").trim();
  const universidadOrigen = String(payload.universidadOrigen || "").trim();

  if (!nombre || !apellido || !/^\d{11}$/.test(cuitCuil) || !tituloOriginal || !analiticoOriginal || !paisOrigen) {
    return respuestaError("Datos incompletos para solicitud de validacion extranjera");
  }
  if (!analiticoPdfUrl) {
    return respuestaError("Debe adjuntar el PDF del analítico certificado");
  }

  const metadataJson = JSON.stringify({
    titular: { nombre, apellido, cuitCuil },
    tituloOriginal,
    analiticoOriginal,
    analiticoPdfUrl,
    analiticoPdfNombre,
    analiticoPdfSha256,
    analiticoPdfId,
    paisOrigen,
    universidadOrigen,
  });

  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);
  const walletPk = toPublicKey(walletEgresado);
  const requestId = new anchor.BN(Date.now() + Math.floor(Math.random() * 1000));
  const ministryRequest = pdaMinistryRequest(program.programId, walletPk, requestId);

  await program.methods
    .requestForeignTitle(requestId, walletPk, metadataJson)
    .accounts({
      config,
      ministryRequest,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const creada = await program.account.ministryRequest.fetch(ministryRequest);
  return { ok: true, data: mapMinistryRequest(ministryRequest, creada) };
}

export async function listarTramitesMinisterioOnchain(walletMinisterio) {
  await asegurarAdminSistema();
  const auth = await autorizarPorRolOnchain(walletMinisterio, "MINISTERIO");
  if (!auth.ok) return respuestaError("Solo el ministerio puede ver tramites extranjeros");

  const { program } = getClient();
  const solicitudes = (await program.account.ministryRequest.all())
    .map((item) => mapMinistryRequest(item.publicKey, item.account))
    .filter((item) => item.tipo === "TITULO_EXTRANJERO")
    .sort((a, b) => (a.fechaSolicitud < b.fechaSolicitud ? 1 : -1));

  const dataConIdentidades = await enriquecerMinistryRequestsConIdentidades(solicitudes);
  const data = enriquecerTramitesConResolucionLocal(dataConIdentidades);

  return { ok: true, data };
}

export async function resolverTramiteMinisterioOnchain(payload) {
  await asegurarAdminSistema();
  const walletMinisterio = normalizarWallet(payload.walletMinisterio);
  const auth = await autorizarPorRolOnchain(walletMinisterio, "MINISTERIO");
  if (!auth.ok) return respuestaError("Solo el ministerio puede resolver tramites extranjeros");

  const tramiteId = String(payload.tramiteId || "").trim();
  const accion = String(payload.accion || "").trim().toLowerCase();
  const accionNormalizada = accion === "aprobar" ? "enviar_cancilleria" : accion;
  const motivo = String(payload.motivo || "").trim();
  if (!tramiteId) return respuestaError("Tramite inexistente");
  if (!["enviar_cancilleria", "rechazar"].includes(accionNormalizada)) return respuestaError("Accion invalida");
  if (accionNormalizada === "rechazar" && !motivo) return respuestaError("Debe ingresar un motivo de rechazo");

  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);
  const ministryRequest = toPublicKey(tramiteId);
  const tramite = await fetchNullable(program.account.ministryRequest, ministryRequest);
  if (!tramite) return respuestaError("Tramite inexistente");

  const requestId = new anchor.BN(Number(tramite.requestId));
  const action = accionNormalizada === "enviar_cancilleria" ? 1 : 2;
  const tokenId = accionNormalizada === "enviar_cancilleria" ? new anchor.BN(Date.now() + Math.floor(Math.random() * 1000)) : new anchor.BN(0);

  await program.methods
    .processForeignTitle(requestId, action, tokenId, motivo)
    .accounts({
      config,
      ministryRequest,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const actualizado = await program.account.ministryRequest.fetch(ministryRequest);
  return { ok: true, data: mapMinistryRequest(ministryRequest, actualizado) };
}

export async function completarTramiteArgentinaPostMinisterioOnchain(payload) {
  await asegurarAdminSistema();
  const walletMinisterio = normalizarWallet(payload.walletMinisterio);
  const auth = await autorizarPorRolOnchain(walletMinisterio, "MINISTERIO");
  if (!auth.ok) return respuestaError("Solo el ministerio puede completar esta certificacion");

  const tramiteId = String(payload.tramiteId || "").trim();
  if (!tramiteId) return respuestaError("Tramite inexistente");

  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);
  const ministryRequest = toPublicKey(tramiteId);
  const tramite = await fetchNullable(program.account.ministryRequest, ministryRequest);
  if (!tramite) return respuestaError("Tramite inexistente");

  if (mapMinistryRequestType(tramite.requestType) !== "TITULO_EXTRANJERO") {
    return respuestaError("El tramite no corresponde a validacion de titulo extranjero");
  }

  let metadata = {};
  try {
    metadata = tramite.metadataJson ? JSON.parse(tramite.metadataJson) : {};
  } catch (_e) {
    metadata = {};
  }

  const paisOrigen = normalizarTextoComparacion(metadata.paisOrigen || "");
  if (paisOrigen !== normalizarTextoComparacion(DEFAULT_COUNTRY)) {
    return respuestaError("Este flujo automatico aplica solo para pais de origen Argentina");
  }

  if (mapMinistryRequestStatus(tramite.status) !== "en_cancilleria") {
    return respuestaError("El tramite todavia no fue enviado por el ministerio para cierre");
  }

  const titular = metadata.titular || {};
  const nombre = String(titular.nombre || "").trim();
  const apellido = String(titular.apellido || "").trim();
  const cuitCuil = String(titular.cuitCuil || "").replace(/[^0-9]/g, "").slice(0, 11);
  const programa = String(metadata.tituloOriginal || "").trim();
  const institucion = String(metadata.universidadOrigen || DEFAULT_INSTITUTION).trim();

  if (!nombre || !apellido || !/^\d{11}$/.test(cuitCuil) || !programa) {
    return respuestaError("No hay datos suficientes del titular para emitir la certificacion");
  }

  const flujoTrazabilidad = [
    {
      actor: "Egresado",
      paso: "Solicitud de validacion extranjera",
      fecha: String(asIso(tramite.createdAt)).slice(0, 10),
      estado: "Completado",
    },
    {
      actor: "Ministerio",
      paso: "Validacion y certificacion nacional",
      fecha: new Date().toISOString().slice(0, 10),
      estado: "Completado",
    },
    {
      actor: "Sistema",
      paso: "Registro on-chain y verificacion",
      fecha: new Date().toISOString().slice(0, 10),
      estado: "Completado",
    },
  ];

  const certificacion = await emitirCredencialBaseOnchain({
    tipoCredencial: "Validacion titulo extranjero",
    nombre,
    apellido,
    cuitCuil,
    programa,
    institucion,
    walletTitular: tramite.solicitanteWallet.toBase58(),
    flujoTrazabilidad,
  });

  const requestId = new anchor.BN(Number(tramite.requestId));
  const tokenId = new anchor.BN(Date.now() + Math.floor(Math.random() * 1000));
  const motivoCierre = "Certificacion nacional completada para titulo con origen Argentina";

  await program.methods
    .approveApostille(requestId, 1, tokenId, motivoCierre)
    .accounts({
      config,
      ministryRequest,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const resoluciones = leerResolucionesTramitesExtranjeros();
  resoluciones[tramiteId] = {
    codigoRegistro: certificacion.codigoRegistro,
    urlVerificacion: `/verificar?registro=${encodeURIComponent(certificacion.codigoRegistro)}`,
    notificacionEgresado: "Tu certificacion fue resuelta y ya puedes verificarla con QR.",
    fechaNotificacion: new Date().toISOString(),
  };
  guardarResolucionesTramitesExtranjeros(resoluciones);

  const actualizado = await program.account.ministryRequest.fetch(ministryRequest);
  return {
    ok: true,
    data: {
      tramite: mapMinistryRequest(ministryRequest, actualizado),
      certificacion,
      notificacionEgresado: resoluciones[tramiteId].notificacionEgresado,
      urlVerificacion: resoluciones[tramiteId].urlVerificacion,
    },
  };
}

export async function listarTramitesCancilleriaOnchain(walletCancilleria) {
  await asegurarAdminSistema();
  const auth = await autorizarPorRolOnchain(walletCancilleria, "CANCILLERIA");
  if (!auth.ok) return respuestaError("Solo cancilleria puede ver tramites");

  // Obtener paises asignados a esta cancilleria desde su registro
  const mapaRegistro = await construirMapaRegistroRolAprobado();
  const claveCancilleria = claveRegistroRol(walletCancilleria, "CANCILLERIA");
  const registroCancilleria = mapaRegistro[claveCancilleria] || {};
  const paisesAsignados = Array.isArray(registroCancilleria.paises)
    ? registroCancilleria.paises.map((p) => normalizarTextoComparacion(p)).filter(Boolean)
    : [];

  const { program } = getClient();
  const solicitudes = (await program.account.ministryRequest.all())
    .map((item) => mapMinistryRequest(item.publicKey, item.account))
    .filter((item) => {
      if (item.tipo !== "TITULO_EXTRANJERO") return false;
      if (!["en_cancilleria", "finalizada", "rechazada"].includes(item.estado)) return false;
      if (paisesAsignados.length === 0) return true;
      return paisesAsignados.includes(normalizarTextoComparacion(item.paisOrigen));
    })
    .sort((a, b) => (a.fechaSolicitud < b.fechaSolicitud ? 1 : -1));

  const dataConIdentidades = await enriquecerMinistryRequestsConIdentidades(solicitudes);
  const data = enriquecerTramitesConResolucionLocal(dataConIdentidades);

  return { ok: true, data, paisesAsignados: registroCancilleria.paises || [] };
}

export async function resolverTramiteCancilleriaOnchain(payload) {
  await asegurarAdminSistema();
  const walletCancilleria = normalizarWallet(payload.walletCancilleria);
  const auth = await autorizarPorRolOnchain(walletCancilleria, "CANCILLERIA");
  if (!auth.ok) return respuestaError("Solo cancilleria puede resolver tramites");

  const tramiteId = String(payload.tramiteId || "").trim();
  const accion = String(payload.accion || "").trim().toLowerCase();
  const motivo = String(payload.motivo || "").trim();
  if (!tramiteId) return respuestaError("Tramite inexistente");
  if (!["aprobar", "rechazar"].includes(accion)) return respuestaError("Accion invalida");
  if (accion === "rechazar" && !motivo) return respuestaError("Debe ingresar un motivo de rechazo");

  const { program, authority } = getClient();
  const { config } = await asegurarConfig();
  const authorityRoleAssignment = pdaRoleAssignment(program.programId, authority);
  const ministryRequest = toPublicKey(tramiteId);
  const tramite = await fetchNullable(program.account.ministryRequest, ministryRequest);
  if (!tramite) return respuestaError("Tramite inexistente");

  const requestId = new anchor.BN(Number(tramite.requestId));
  const action = accion === "aprobar" ? 1 : 2;
  const tokenId = accion === "aprobar" ? new anchor.BN(Date.now() + Math.floor(Math.random() * 1000)) : new anchor.BN(0);

  await program.methods
    .approveApostille(requestId, action, tokenId, motivo)
    .accounts({
      config,
      ministryRequest,
      authorityRoleAssignment,
      authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const actualizado = await program.account.ministryRequest.fetch(ministryRequest);
  return { ok: true, data: mapMinistryRequest(ministryRequest, actualizado) };
}

export async function listarTramitesEgresadoOnchain(walletEgresado) {
  await asegurarAdminSistema();
  const auth = await autorizarPorRolOnchain(walletEgresado, "EGRESADO");
  if (!auth.ok) return respuestaError("Solo un egresado activo puede ver el seguimiento de sus tramites");

  const { program } = getClient();
  const walletNormalizada = normalizarWallet(walletEgresado);
  const solicitudes = (await program.account.ministryRequest.all())
    .map((item) => mapMinistryRequest(item.publicKey, item.account))
    .filter((item) => item.tipo === "TITULO_EXTRANJERO" && item.walletUniversidad === walletNormalizada)
    .sort((a, b) => (a.fechaSolicitud < b.fechaSolicitud ? 1 : -1));

  const dataConIdentidades = await enriquecerMinistryRequestsConIdentidades(solicitudes);
  const data = enriquecerTramitesConResolucionLocal(dataConIdentidades);

  return { ok: true, data };
}

async function emitirCredencialBaseOnchain({
  tipoCredencial,
  nombre,
  apellido,
  cuitCuil,
  programa,
  institucion,
  walletTitular,
  flujoTrazabilidad,
}) {
  const { program, authority } = getClient();
  const { config, data } = await asegurarConfig();
  await asegurarInstitution();

  const credentialId = new anchor.BN(Number(data.credentialCounter || 0) + 1);
  const credential = pdaCredential(program.programId, authority, credentialId);
  const institution = pdaInstitution(program.programId, authority);
  const recipient = walletValida(walletTitular)
    ? toPublicKey(walletTitular)
    : new anchor.web3.PublicKey(
        crypto
          .createHash("sha256")
          .update(`${cuitCuil}|${String(nombre || "").toLowerCase()}|${String(apellido || "").toLowerCase()}`)
          .digest()
      );

  const now = Math.floor(Date.now() / 1000);
  const payloadHash = JSON.stringify({
    tipoCredencial,
    nombre,
    apellido,
    cuitCuil,
    programa,
    institucion,
    titularOnchain: recipient.toBase58(),
    now,
  });
  const documentHash = Array.from(crypto.createHash("sha256").update(payloadHash).digest());
  const metadataUri = `onchain://credential/${credentialId.toString()}`;

  const issueSignature = await program.methods
    .issueCredential(
      credentialId,
      recipient,
      tipoCredencial,
      programa,
      new anchor.BN(now),
      new anchor.BN(0),
      documentHash,
      metadataUri
    )
    .accounts({
      config,
      institution,
      credential,
      issuer: authority,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  const codigoRegistro = generarCodigoRegistro();
  const flujo = Array.isArray(flujoTrazabilidad) && flujoTrazabilidad.length
    ? flujoTrazabilidad
    : generarFlujoInicial(asIso(now));

  const metadataSignature = await program.methods
    .setCredentialMetadata(
      credentialId,
      codigoRegistro,
      nombre,
      apellido,
      cuitCuil,
      institucion,
      JSON.stringify(flujo)
    )
    .accounts({
      institution,
      credential,
      issuer: authority,
    })
    .rpc();

  const credencial = await program.account.credential.fetch(credential);
  const salida = mapCredential(credential, credencial);
  return {
    ...salida,
    tokenCarreraId: `CAR-${credentialId.toString()}`,
    transacciones: {
      issueCredential: issueSignature,
      setCredentialMetadata: metadataSignature,
    },
  };
}

export async function emitirCredencialOnchain(payload) {
  await asegurarAdminSistema();

  const nombre = String(payload.nombre || "").trim();
  const apellido = String(payload.apellido || "").trim();
  const cuitCuil = String(payload.cuitCuil || "").replace(/[^0-9]/g, "").slice(0, 11);
  const programa = String(payload.programa || "").trim();
  const tipoCredencial = String(payload.tipo || "Diploma").trim().slice(0, 32);
  const institucion = String(payload.institucion || DEFAULT_INSTITUTION).trim().slice(0, 128);
  const walletTitular = String(payload.walletTitular || "").trim();

  if (!nombre || !apellido || !/^\d{11}$/.test(cuitCuil) || !programa) {
    return respuestaError("Nombre, apellido, CUIT/CUIL y programa son obligatorios");
  }

  const data = await emitirCredencialBaseOnchain({
    tipoCredencial,
    nombre,
    apellido,
    cuitCuil,
    programa,
    institucion,
    walletTitular,
  });

  return { ok: true, data };
}

export async function listarCredencialesOnchain() {
  const { program } = getClient();
  const cuentas = await program.account.credential.all();
  return cuentas.map(({ publicKey, account }) => mapCredential(publicKey, account));
}

export async function listarPersonasOnchain() {
  await asegurarAdminSistema();
  const { program } = getClient();

  const [requests, roles] = await Promise.all([
    program.account.roleRequest.all(),
    program.account.roleAssignment.all(),
  ]);

  const rolesPorWallet = new Map();
  for (const { account } of roles) {
    const wallet = account.wallet.toBase58();
    if (!account.active) continue;
    const rol = mapRole(account.role);
    const lista = rolesPorWallet.get(wallet) || [];
    if (rol && !lista.includes(rol)) lista.push(rol);
    rolesPorWallet.set(wallet, lista);
  }

  const porWallet = new Map();
  for (const { account } of requests) {
    const wallet = account.wallet.toBase58();
    const existente = porWallet.get(wallet);
    const requestDate = Number(account.requestedAt || 0);
    const actualDate = Number(existente?.requestedAt || 0);
    if (!existente || requestDate > actualDate) {
      porWallet.set(wallet, account);
    }
  }

  const personas = Array.from(porWallet.entries()).map(([wallet, req]) => ({
    id: wallet,
    nombre: req.nombre || "",
    apellido: "",
    institucion: req.entidad || "",
    email: req.email || "",
    wallet,
    roles: rolesPorWallet.get(wallet) || [],
    fechaAlta: asIso(req.requestedAt),
    fechaBaja: null,
    observaciones: req.resolutionReason || "",
  }));

  return { ok: true, data: personas };
}

export async function listarTransaccionesOnchain({ limit = 100 } = {}) {
  const { idl, program, connection } = getClient();
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));

  const signatures = await connection.getSignaturesForAddress(program.programId, {
    limit: safeLimit,
  });

  if (!signatures.length) return { ok: true, data: [] };

  const coder = new anchor.BorshCoder(idl);
  const parser = new anchor.EventParser(program.programId, coder);

  const txs = await Promise.all(
    signatures.map(async (item) => {
      const tx = await connection.getTransaction(item.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      const logs = tx?.meta?.logMessages || [];
      const eventos = [];
      try {
        for (const evento of parser.parseLogs(logs)) {
          eventos.push({
            nombre: evento.name,
            datos: evento.data,
          });
        }
      } catch (_e) {
        // Si una transaccion no parsea como evento Anchor, igual se reporta la firma.
      }

      return {
        source: "onchain",
        signature: item.signature,
        slot: item.slot,
        fecha: asIso(item.blockTime || tx?.blockTime || 0),
        estado: tx?.meta?.err ? "error" : "confirmada",
        feeLamports: Number(tx?.meta?.fee || 0),
        eventos,
      };
    })
  );

  return { ok: true, data: txs };
}

export async function buscarPorRegistroOnchain(codigoRegistro) {
  const objetivo = String(codigoRegistro || "").trim().toUpperCase();
  if (!objetivo) return null;
  const data = await listarCredencialesOnchain();
  return data.find((item) => String(item.codigoRegistro || "").toUpperCase() === objetivo) || null;
}

export async function filtrarEmisionesOnchain(payload) {
  const desde = String(payload.desde || "").trim();
  const hasta = String(payload.hasta || "").trim();
  const anio = Number(payload.anio || 0);
  const universidad = String(payload.universidad || "").trim().toLowerCase();
  const carrera = String(payload.carrera || "").trim().toLowerCase();

  const data = (await listarCredencialesOnchain()).filter((item) => {
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

export async function buscarTitularOnchain({ nombre, apellido, cuitCuil }) {
  const n = String(nombre || "").trim().toLowerCase();
  const a = String(apellido || "").trim().toLowerCase();
  const c = String(cuitCuil || "").replace(/[^0-9]/g, "");

  const data = await listarCredencialesOnchain();
  return data.filter((cert) => {
    const coincideNombre = !n || String(cert.titular?.nombre || "").toLowerCase().includes(n);
    const coincideApellido = !a || String(cert.titular?.apellido || "").toLowerCase().includes(a);
    const coincideCuit = !c || String(cert.titular?.cuitCuil || "").includes(c);
    return coincideNombre && coincideApellido && coincideCuit;
  });
}
