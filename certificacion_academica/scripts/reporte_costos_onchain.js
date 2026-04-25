/* eslint-disable no-console */

function calcularCostoTransaccion({
  firmas = 1,
  costoFirmaLamports = 5000,
  computeUnits = 100000,
  microLamportsPorCu = 0,
}) {
  const costoFirmas = firmas * costoFirmaLamports;
  const costoCompute = Math.floor((computeUnits * microLamportsPorCu) / 1_000_000);
  const totalLamports = costoFirmas + costoCompute;
  const totalSol = totalLamports / 1_000_000_000;

  return {
    costoFirmas,
    costoCompute,
    totalLamports,
    totalSol,
  };
}

function ejecutar() {
  const escenarios = [
    { nombre: "Emision credencial", firmas: 1, computeUnits: 160000, microLamportsPorCu: 0 },
    { nombre: "Revocacion credencial", firmas: 1, computeUnits: 120000, microLamportsPorCu: 0 },
    { nombre: "Reemision credencial", firmas: 1, computeUnits: 180000, microLamportsPorCu: 0 },
  ];

  console.log("Reporte estimado de costos on-chain");
  console.log("Supuesto base: 5000 lamports por firma");

  for (const e of escenarios) {
    const costo = calcularCostoTransaccion(e);
    console.log(`\\nOperacion: ${e.nombre}`);
    console.log(`- Costo firmas: ${costo.costoFirmas} lamports`);
    console.log(`- Costo compute: ${costo.costoCompute} lamports`);
    console.log(`- Total: ${costo.totalLamports} lamports (${costo.totalSol.toFixed(9)} SOL)`);
  }
}

if (require.main === module) {
  ejecutar();
}

module.exports = {
  calcularCostoTransaccion,
};
