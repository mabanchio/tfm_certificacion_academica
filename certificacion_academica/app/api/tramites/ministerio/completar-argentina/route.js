import { NextResponse } from "next/server";
import { completarTramiteArgentinaPostMinisterioOnchain } from "../../../../lib/onchain/registro";

export async function POST(request) {
  try {
    const payload = await request.json();
    const resultado = await completarTramiteArgentinaPostMinisterioOnchain(payload || {});
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo completar la certificacion nacional del tramite argentino." },
      { status: 503 }
    );
  }
}
