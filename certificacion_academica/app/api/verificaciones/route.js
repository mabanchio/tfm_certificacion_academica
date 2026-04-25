import { NextResponse } from "next/server";
import { buscarPorRegistroOnchain } from "../../lib/onchain/registro";
import { validarRegistro } from "../../lib/security/validaciones";
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
  const ruta = "/api/verificaciones";

  function responder(payload, status, headers = {}) {
    registrarMetricaHttp({
      ruta,
      status,
      duracionMs: Date.now() - inicio,
    });
    return NextResponse.json(payload, { status, headers });
  }

  const rl = verificarRateLimit({
    bucket: "api-verificaciones",
    key: ip,
    maxIntentos: 40,
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
  const registroEntrada = searchParams.get("registro");
  const validacion = validarRegistro(registroEntrada);

  if (!validacion.ok) {
    try {
      registrarEventoAuditoria({
        evento: "consulta_verificacion",
        actor: "verificador_externo",
        estado: "rechazado",
        detalle: validacion.error,
        metadata: { ip },
      });
    } catch (_e) {
      // Evita bloquear respuesta por falla de I/O en auditoria.
    }

    return responder(
      { ok: false, error: validacion.error },
      400,
      {
        "X-RateLimit-Remaining": String(rl.restantes),
      }
    );
  }

  let certificacion = null;
  try {
    certificacion = await buscarPorRegistroOnchain(validacion.valor);
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

  if (!certificacion) {
    try {
      registrarEventoAuditoria({
        evento: "consulta_verificacion",
        actor: "verificador_externo",
        estado: "no_encontrado",
        detalle: "Registro consultado sin coincidencia",
        metadata: { ip, registro: validacion.valor },
      });
    } catch (_e) {
      // Evita bloquear respuesta por falla de I/O en auditoria.
    }

    return responder(
      { ok: false, error: "Registro no encontrado", data: null },
      404,
      {
        "X-RateLimit-Remaining": String(rl.restantes),
      }
    );
  }

  try {
    registrarEventoAuditoria({
      evento: "consulta_verificacion",
      actor: "verificador_externo",
      estado: "exitoso",
      detalle: "Registro verificado con exito",
      metadata: { ip, registro: validacion.valor },
    });
  } catch (_e) {
    // Evita bloquear respuesta por falla de I/O en auditoria.
  }

  return responder(
    { ok: true, data: certificacion },
    200,
    {
      "X-RateLimit-Remaining": String(rl.restantes),
    }
  );
}
