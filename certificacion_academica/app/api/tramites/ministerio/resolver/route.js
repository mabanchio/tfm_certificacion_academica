import { NextResponse } from "next/server";

export async function POST(request) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "La resolucion de tramites de ministerio debe firmarse y enviarse on-chain desde la wallet MINISTERIO en el cliente.",
    },
    { status: 405 }
  );
}
