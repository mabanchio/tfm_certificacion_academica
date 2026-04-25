import { NextResponse } from "next/server";
import { listarSolicitudesLotesMinisterioOnchain } from "../../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const walletMinisterio = String(searchParams.get("walletMinisterio") || "").trim();
  try {
    const resultado = await listarSolicitudesLotesMinisterioOnchain(walletMinisterio);
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 403 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar solicitudes de lote on-chain. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}

export async function POST(request) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "La solicitud de lote debe firmarse y enviarse on-chain desde la wallet UNIVERSIDAD en el cliente.",
    },
    { status: 405 }
  );
}
