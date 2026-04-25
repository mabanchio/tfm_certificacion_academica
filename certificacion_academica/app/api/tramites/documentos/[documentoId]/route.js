import fs from "fs/promises";
import path from "path";

const BASE_DIR = path.join(process.cwd(), ".data", "tramites_documentos");

function idValido(id) {
  return /^[a-zA-Z0-9-]{8,80}$/.test(String(id || ""));
}

export async function GET(_request, { params }) {
  const documentoId = String(params?.documentoId || "").trim();
  if (!idValido(documentoId)) {
    return new Response("Documento inválido", { status: 400 });
  }

  const pdfPath = path.join(BASE_DIR, `${documentoId}.pdf`);
  const metaPath = path.join(BASE_DIR, `${documentoId}.json`);

  try {
    const [pdfBytes, rawMeta] = await Promise.all([
      fs.readFile(pdfPath),
      fs.readFile(metaPath, "utf8"),
    ]);

    let meta = {};
    try {
      meta = JSON.parse(rawMeta);
    } catch (_e) {
      meta = {};
    }

    const nombre = String(meta.nombreOriginal || `analitico-${documentoId}.pdf`).replace(/[\r\n"]/g, "_");

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nombre}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (_e) {
    return new Response("Documento no encontrado", { status: 404 });
  }
}
