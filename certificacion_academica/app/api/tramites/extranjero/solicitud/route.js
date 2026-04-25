import { NextResponse } from "next/server";

export async function POST(request) {
  return NextResponse.json(
    {
      ok: false,
      error:
        "La solicitud extranjera debe firmarse y enviarse on-chain desde la wallet EGRESADO en el cliente.",
    },
    { status: 405 }
  );
}
