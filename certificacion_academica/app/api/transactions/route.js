import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { listarTransaccionesOnchain } from "../../lib/onchain/registro";
import {
  obtenerSnapshotsIndexador,
  obtenerTransaccionesIndexadas,
  reindexarTransaccionesOnchain,
} from "../../lib/onchain/indexador";

function leerEventosAuditoria(limit) {
  const base = path.resolve(process.cwd(), "storage", "auditoria");
  if (!fs.existsSync(base)) return [];

  const archivos = fs
    .readdirSync(base)
    .filter((name) => name.startsWith("auditoria-") && name.endsWith(".log"))
    .sort()
    .reverse();

  const eventos = [];
  for (const archivo of archivos) {
    const ruta = path.join(base, archivo);
    const lineas = fs
      .readFileSync(ruta, "utf8")
      .split("\n")
      .map((linea) => linea.trim())
      .filter(Boolean);

    for (const linea of lineas.reverse()) {
      try {
        const parsed = JSON.parse(linea);
        eventos.push(parsed);
      } catch (_e) {
        // Ignora lineas corruptas para no romper la API de transacciones.
      }
      if (eventos.length >= limit) return eventos;
    }
  }

  return eventos;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(500, Number(searchParams.get("limit") || 100)));
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.max(1, Math.min(500, Number(searchParams.get("pageSize") || limit)));
  const source = String(searchParams.get("source") || "all").trim().toLowerCase();
  const mode = String(searchParams.get("mode") || "live").trim().toLowerCase();
  const refreshIndex = searchParams.get("refresh") === "1";
  const includeSnapshots = searchParams.get("snapshots") === "1";

  try {
    if (mode === "indexed") {
      if (refreshIndex) {
        const refreshed = await reindexarTransaccionesOnchain({ limit: 2000 });
        if (!refreshed.ok) {
          return NextResponse.json(refreshed, { status: 503 });
        }
      }

      const resultado = obtenerTransaccionesIndexadas({ page, pageSize, source });
      return NextResponse.json(
        {
          ok: true,
          data: resultado.data,
          pagination: resultado.pagination,
          snapshots: includeSnapshots ? obtenerSnapshotsIndexador({ limit: 100 }) : undefined,
        },
        { status: 200 }
      );
    }

    const incluirOnchain = source === "all" || source === "onchain";
    const incluirLocal = source === "all" || source === "local";

    const onchain = incluirOnchain ? await listarTransaccionesOnchain({ limit }) : { ok: true, data: [] };
    const locales = incluirLocal ? leerEventosAuditoria(limit) : [];

    if (!onchain.ok) {
      return NextResponse.json(onchain, { status: 503 });
    }

    const data = [
      ...onchain.data,
      ...locales.map((item) => ({ source: "local", ...item })),
    ]
      .sort((a, b) => String(b.fecha || b.timestamp || "").localeCompare(String(a.fecha || a.timestamp || "")))
      .slice(0, limit);

    return NextResponse.json({ ok: true, data, total: data.length }, { status: 200 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar transacciones auditadas." },
      { status: 500 }
    );
  }
}
