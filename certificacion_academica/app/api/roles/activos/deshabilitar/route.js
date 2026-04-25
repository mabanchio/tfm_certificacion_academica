import { NextResponse } from "next/server";
import { deshabilitarRolOnchain } from "../../../../lib/onchain/registro";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return NextResponse.json({ ok: false, error: "Payload JSON invalido" }, { status: 400 });
  }

  try {
    const resultado = await deshabilitarRolOnchain(body);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 403 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo escribir on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}
