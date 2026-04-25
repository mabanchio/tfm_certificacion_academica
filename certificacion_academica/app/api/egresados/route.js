import { NextResponse } from "next/server";
import { buscarTitularOnchain, obtenerResumen } from "../../lib/onchain/registro";
import { validarParametrosEgresado } from "../../lib/security/validaciones";
import { verificarRateLimit } from "../../lib/security/rate_limiter";
import { registrarEventoAuditoria } from "../../lib/security/auditoria";
import { registrarMetricaHttp } from "../../lib/observabilidad/metricas";

function obtenerIpCliente(request) {
  const ipForward = request.headers.get("x-forwarded-for");
  if (ipForward) {
    return ipForward.split(",")[0].trim();
  }
  return "local";
}

export async function GET(request) {
  const inicio = Date.now();
  const ip = obtenerIpCliente(request);
  const ruta = "/api/egresados";

  function responder(payload, status, headers = {}) {
    registrarMetricaHttp({
      ruta,
      status,
      duracionMs: Date.now() - inicio,
    });
    return NextResponse.json(payload, { status, headers });
  }

  const rl = verificarRateLimit({
    bucket: "api-egresados",
    key: ip,
    maxIntentos: 25,
    ventanaMs: 60_000,
  });

  if (!rl.permitido) {
    return responder(
      {
        ok: false,
        error: "Demasiadas solicitudes, intente nuevamente en unos segundos",
      },
      429,
      {
        "Retry-After": String(Math.ceil(rl.reintentoEn / 1000)),
        "X-RateLimit-Remaining": "0",
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const nombre = String(searchParams.get("nombre") || "");
  const apellido = String(searchParams.get("apellido") || "");
  const cuitCuil = String(searchParams.get("cuitCuil") || "");

  const validacion = validarParametrosEgresado({ nombre, apellido, cuitCuil });

  if (!validacion.ok) {
    try {
      registrarEventoAuditoria({
        evento: "consulta_egresado",
        actor: "egresado",
        estado: "rechazado",
        detalle: validacion.errores.join("; "),
        metadata: { ip },
      });
    } catch (_e) {
      // Evita bloquear respuesta por falla de I/O en auditoria.
    }

    return responder(
      { ok: false, error: validacion.errores.join(". ") },
      400,
      {
        "X-RateLimit-Remaining": String(rl.restantes),
      }
    );
  }

  let resultados = [];
  try {
    resultados = await buscarTitularOnchain(validacion.valores);
  } catch (_e) {
    return responder(
      {
        ok: false,
        error: "No se pudo consultar Solana local. Verifique validator/RPC.",
      },
      503,
      {
        "X-RateLimit-Remaining": String(rl.restantes),
      }
    );
  }
  const resumen = obtenerResumen(resultados);

  try {
    registrarEventoAuditoria({
      evento: "consulta_egresado",
      actor: "egresado",
      estado: "exitoso",
      detalle: "Consulta procesada con filtros validos",
      metadata: {
        ip,
        nombre: validacion.valores.nombre,
        apellido: validacion.valores.apellido,
        cuitHash: validacion.valores.cuitCuil ? "presente" : "ausente",
      },
    });
  } catch (_e) {
    // Evita bloquear respuesta por falla de I/O en auditoria.
  }

  return responder(
    {
      ok: true,
      data: resultados,
      resumen,
    },
    200,
    {
      "X-RateLimit-Remaining": String(rl.restantes),
    }
  );
}
