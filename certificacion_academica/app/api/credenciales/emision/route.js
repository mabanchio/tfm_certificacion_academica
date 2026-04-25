import { NextResponse } from "next/server";
import { emitirCredencialOnchain } from "../../../lib/onchain/registro";
import { registrarEventoAuditoria } from "../../../lib/security/auditoria";
import { registrarMetricaHttp } from "../../../lib/observabilidad/metricas";

function obtenerIpCliente(request) {
  const ipForward = request.headers.get("x-forwarded-for");
  if (ipForward) {
    return ipForward.split(",")[0].trim();
  }
  return "local";
}

export async function POST(request) {
  const inicio = Date.now();
  const ruta = "/api/credenciales/emision";
  const ip = obtenerIpCliente(request);

  function responder(payload, status) {
    registrarMetricaHttp({
      ruta,
      status,
      duracionMs: Date.now() - inicio,
    });
    return NextResponse.json(payload, { status });
  }

  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return responder({ ok: false, error: "Payload JSON invalido" }, 400);
  }

  let resultado;
  try {
    resultado = await emitirCredencialOnchain(body);
  } catch (_e) {
    return responder(
      { ok: false, error: "No se pudo emitir on-chain. Verifique validator/RPC." },
      503
    );
  }

  if (!resultado.ok) {
    try {
      registrarEventoAuditoria({
        evento: "emision_credencial",
        actor: "universidad",
        estado: "rechazado",
        detalle: resultado.error,
        metadata: { ip },
      });
    } catch (_e) {}

    return responder({ ok: false, error: resultado.error }, 400);
  }

  try {
    registrarEventoAuditoria({
      evento: "emision_credencial",
      actor: "universidad",
      estado: "exitoso",
        detalle: "Credencial emitida on-chain",
      metadata: {
        ip,
        codigoRegistro: resultado.data.codigoRegistro,
      },
    });
  } catch (_e) {}

  return responder(
    {
      ok: true,
      data: {
        ...resultado.data,
        urlVerificacion: `/verificar?registro=${encodeURIComponent(resultado.data.codigoRegistro)}`,
      },
    },
    201
  );
}
