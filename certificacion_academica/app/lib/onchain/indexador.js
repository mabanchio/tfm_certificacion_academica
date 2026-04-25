import fs from "fs";
import path from "path";
import {
  listarCredencialesOnchain,
  listarPersonasOnchain,
  listarTransaccionesOnchain,
} from "./registro";

const INDEX_DIR = path.resolve(process.cwd(), ".data", "indexador");
const TX_INDEX_FILE = path.join(INDEX_DIR, "transactions-index.json");
const CERT_INDEX_FILE = path.join(INDEX_DIR, "certifications-index.json");
const PERSON_INDEX_FILE = path.join(INDEX_DIR, "persons-index.json");
const SNAPSHOTS_FILE = path.join(INDEX_DIR, "snapshots.jsonl");

function asegurarDirectorio() {
  fs.mkdirSync(INDEX_DIR, { recursive: true });
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function leerJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) {
    return [];
  }
}

function guardarJsonArray(filePath, data) {
  asegurarDirectorio();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function keyFecha(item) {
  return String(item?.fecha || item?.timestamp || "");
}

function paginate(data, { page = 1, pageSize = 100 } = {}) {
  const safePage = clamp(page, 1, 100000, 1);
  const safePageSize = clamp(pageSize, 1, 500, 100);
  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const offset = (safePage - 1) * safePageSize;
  return {
    data: data.slice(offset, offset + safePageSize),
    pagination: {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    },
  };
}

function appendSnapshot(kind, total, extra = {}) {
  asegurarDirectorio();
  const record = {
    timestamp: new Date().toISOString(),
    kind,
    total,
    ...extra,
  };
  fs.appendFileSync(SNAPSHOTS_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

export function obtenerSnapshotsIndexador({ limit = 100 } = {}) {
  const safeLimit = clamp(limit, 1, 500, 100);
  if (!fs.existsSync(SNAPSHOTS_FILE)) return [];
  const lineas = fs.readFileSync(SNAPSHOTS_FILE, "utf8").split("\n").filter(Boolean);
  return lineas
    .slice(-safeLimit)
    .reverse()
    .map((linea) => {
      try {
        return JSON.parse(linea);
      } catch (_e) {
        return null;
      }
    })
    .filter(Boolean);
}

export function obtenerTransaccionesIndexadas({ page = 1, pageSize = 100, source = "all" } = {}) {
  const src = String(source || "all").trim().toLowerCase();
  const filtradas = leerJsonArray(TX_INDEX_FILE)
    .filter((item) => src === "all" || String(item?.source || "").toLowerCase() === src)
    .sort((a, b) => keyFecha(b).localeCompare(keyFecha(a)))
;

  return paginate(filtradas, { page, pageSize });
}

export async function reindexarTransaccionesOnchain({ limit = 500 } = {}) {
  const safeLimit = clamp(limit, 1, 2000, 500);
  const onchain = await listarTransaccionesOnchain({ limit: safeLimit });
  if (!onchain.ok) return onchain;

  const actuales = leerJsonArray(TX_INDEX_FILE);
  const porFirma = new Map();

  for (const item of actuales) {
    const key = String(item.signature || `${item.slot || ""}-${keyFecha(item)}`);
    porFirma.set(key, item);
  }

  for (const item of onchain.data) {
    const key = String(item.signature || `${item.slot || ""}-${keyFecha(item)}`);
    porFirma.set(key, item);
  }

  const merged = Array.from(porFirma.values())
    .sort((a, b) => keyFecha(b).localeCompare(keyFecha(a)))
    .slice(0, 5000);

  guardarJsonArray(TX_INDEX_FILE, merged);
  appendSnapshot("transactions", merged.length, { fetched: onchain.data.length });
  return { ok: true, data: merged.slice(0, clamp(safeLimit, 1, 500, 100)), indexedTotal: merged.length };
}

export function obtenerCertificacionesIndexadas({
  page = 1,
  pageSize = 100,
  filtros = {},
} = {}) {
  const desde = String(filtros?.desde || "").trim();
  const hasta = String(filtros?.hasta || "").trim();
  const anio = Number(filtros?.anio || 0);
  const universidad = String(filtros?.universidad || "").trim().toLowerCase();
  const carrera = String(filtros?.carrera || "").trim().toLowerCase();

  const filtradas = leerJsonArray(CERT_INDEX_FILE)
    .filter((item) => {
      const fecha = String(item?.fechaEmision || item?.flujo?.[0]?.fecha || "");
      const itemAnio = Number(item?.anio || (fecha ? fecha.slice(0, 4) : 0));
      const okDesde = !desde || (fecha && fecha >= desde);
      const okHasta = !hasta || (fecha && fecha <= hasta);
      const okAnio = !anio || itemAnio === anio;
      const okUni = !universidad || String(item?.institucion || "").toLowerCase().includes(universidad);
      const okCarrera =
        !carrera || String(item?.carrera || item?.programa || "").toLowerCase().includes(carrera);
      return okDesde && okHasta && okAnio && okUni && okCarrera;
    })
    .sort((a, b) => String(b?.fechaEmision || "").localeCompare(String(a?.fechaEmision || "")));

  return paginate(filtradas, { page, pageSize });
}

export async function reindexarCertificacionesOnchain() {
  const data = await listarCredencialesOnchain();
  const sorted = [...data].sort((a, b) => String(b?.fechaEmision || "").localeCompare(String(a?.fechaEmision || "")));
  guardarJsonArray(CERT_INDEX_FILE, sorted.slice(0, 20000));
  appendSnapshot("certifications", sorted.length);
  return { ok: true, data: sorted.slice(0, 100), indexedTotal: sorted.length };
}

export function obtenerPersonasIndexadas({ page = 1, pageSize = 100, filtros = {} } = {}) {
  const rol = String(filtros?.rol || "").trim().toUpperCase();
  const institucion = String(filtros?.institucion || "").trim().toLowerCase();
  const q = String(filtros?.q || "").trim().toLowerCase();

  const filtradas = leerJsonArray(PERSON_INDEX_FILE)
    .filter((item) => {
      const roles = Array.isArray(item?.roles) ? item.roles : [];
      const texto = `${item?.nombre || ""} ${item?.apellido || ""} ${item?.email || ""} ${item?.wallet || ""}`.toLowerCase();
      const okRol = !rol || roles.includes(rol);
      const okInstitucion = !institucion || String(item?.institucion || "").toLowerCase().includes(institucion);
      const okQ = !q || texto.includes(q);
      return okRol && okInstitucion && okQ;
    })
    .sort((a, b) => String(b?.fechaAlta || "").localeCompare(String(a?.fechaAlta || "")));

  return paginate(filtradas, { page, pageSize });
}

export async function reindexarPersonasOnchain() {
  const resultado = await listarPersonasOnchain();
  if (!resultado.ok) return resultado;
  const data = Array.isArray(resultado.data) ? resultado.data : [];
  const sorted = [...data].sort((a, b) => String(b?.fechaAlta || "").localeCompare(String(a?.fechaAlta || "")));
  guardarJsonArray(PERSON_INDEX_FILE, sorted.slice(0, 50000));
  appendSnapshot("persons", sorted.length);
  return { ok: true, data: sorted.slice(0, 100), indexedTotal: sorted.length };
}
