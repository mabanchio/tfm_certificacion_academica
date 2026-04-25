export async function POST(request) {
  void request;
  return Response.json(
    {
      ok: false,
      error:
        "Operacion no permitida en servidor. La asignacion debe firmarse desde la wallet UNIVERSIDAD en cliente.",
    },
    { status: 405 }
  );
}
