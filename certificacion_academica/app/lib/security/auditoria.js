import fs from "fs";
import path from "path";

function obtenerRutaLog(baseDir, fechaIso) {
  const fecha = fechaIso.slice(0, 10);
  return path.join(baseDir, `auditoria-${fecha}.log`);
}

export function registrarEventoAuditoria({
  evento,
  actor,
  estado,
  detalle,
  metadata = {},
  baseDir,
  timestamp,
}) {
  const marcaTiempo = timestamp || new Date().toISOString();
  const dir =
    baseDir || path.resolve(process.cwd(), "storage", "auditoria");

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const entrada = {
    timestamp: marcaTiempo,
    evento,
    actor,
    estado,
    detalle,
    metadata,
  };

  const ruta = obtenerRutaLog(dir, marcaTiempo);
  fs.appendFileSync(ruta, `${JSON.stringify(entrada)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  return { ruta, entrada };
}
