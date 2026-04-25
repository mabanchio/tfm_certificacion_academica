import {
  reindexarCertificacionesOnchain,
  reindexarPersonasOnchain,
  reindexarTransaccionesOnchain,
} from "../app/lib/onchain/indexador.js";

async function main() {
  const [tx, certs, persons] = await Promise.all([
    reindexarTransaccionesOnchain({ limit: 2000 }),
    reindexarCertificacionesOnchain(),
    reindexarPersonasOnchain(),
  ]);

  const checks = [
    { name: "transactions", value: tx },
    { name: "certifications", value: certs },
    { name: "persons", value: persons },
  ];

  const failed = checks.find((c) => !c.value?.ok);
  if (failed) {
    console.error(`[reindex] fallo en ${failed.name}:`, failed.value?.error || "desconocido");
    process.exit(1);
  }

  console.log("[reindex] OK", {
    transactions: tx.indexedTotal,
    certifications: certs.indexedTotal,
    persons: persons.indexedTotal,
  });
}

main().catch((e) => {
  console.error("[reindex] error inesperado", e);
  process.exit(1);
});
