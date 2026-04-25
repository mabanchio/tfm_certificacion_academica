import { NextResponse } from "next/server";

export async function POST(request) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "La resolucion de tramites de cancilleria debe firmarse y enviarse on-chain desde la wallet CANCILLERIA en el cliente.",
    },
    { status: 405 }
  );
}
