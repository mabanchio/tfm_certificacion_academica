import { NextResponse } from "next/server";
import { listarSolicitudesRolOnchain } from "../../../lib/onchain/registro";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const walletAdmin = String(searchParams.get("walletAdmin") || "").trim();
  const estadoFiltro = String(searchParams.get("estado") || "").trim();
  try {
    const resultado = await listarSolicitudesRolOnchain({ walletAdmin, estadoFiltro });
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 403 });
  } catch (_e) {
    return NextResponse.json(
      { ok: false, error: "No se pudo acceder a Solana local. Verifique validator/RPC." },
      { status: 503 }
    );
  }
}

export async function POST(request) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "La solicitud de rol debe firmarse desde Backpack por la wallet solicitante. Use el flujo de /acceso.",
    },
    { status: 405 }
  );
}
