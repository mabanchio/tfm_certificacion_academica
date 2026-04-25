import { NextResponse } from "next/server";
import { buscarPorRegistroOnchain } from "../../lib/onchain/registro";

async function resolverVerificacion(registro) {
  const registroLimpio = String(registro || "").trim();
  if (!registroLimpio) {
    return { ok: false, error: "El codigo de registro es obligatorio", status: 400 };
  }

  const data = await buscarPorRegistroOnchain(registroLimpio);
  if (!data) {
    return { ok: false, error: "Registro no encontrado", status: 404 };
  }

  return { ok: true, data, status: 200 };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  try {
    const resultado = await resolverVerificacion(searchParams.get("registro"));
    return NextResponse.json(
      resultado.ok ? { ok: true, data: resultado.data } : { ok: false, error: resultado.error, data: null },
      { status: resultado.status }
    );
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar verificacion on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return NextResponse.json({ ok: false, error: "Payload JSON invalido" }, { status: 400 });
  }

  try {
    const resultado = await resolverVerificacion(body?.registro);
    return NextResponse.json(
      resultado.ok ? { ok: true, data: resultado.data } : { ok: false, error: resultado.error, data: null },
      { status: resultado.status }
    );
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar verificacion on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
