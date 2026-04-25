/* eslint-disable no-console */

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function ejecutar() {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const concurrencia = Number(process.env.CARGA_CONCURRENCIA || 10);
  const total = Number(process.env.CARGA_TOTAL || 100);

  const resultados = [];
  let ok = 0;
  let error = 0;

  async function unaPeticion(i) {
    const inicio = performance.now();
    try {
      const registro = i % 2 === 0 ? "1FD8AD999C3D1A254594" : "NO-EXISTE-1234";
      const response = await fetch(`${baseUrl}/api/verificaciones?registro=${encodeURIComponent(registro)}`);
      const fin = performance.now();
      resultados.push(fin - inicio);
      if (response.ok) ok += 1;
      else error += 1;
    } catch (_e) {
      const fin = performance.now();
      resultados.push(fin - inicio);
      error += 1;
    }
  }

  const lotes = Math.ceil(total / concurrencia);
  for (let lote = 0; lote < lotes; lote += 1) {
    const promesas = [];
    for (let j = 0; j < concurrencia; j += 1) {
      const i = lote * concurrencia + j;
      if (i >= total) break;
      promesas.push(unaPeticion(i));
    }
    await Promise.all(promesas);
  }

  const promedio = resultados.reduce((acc, v) => acc + v, 0) / Math.max(1, resultados.length);

  console.log("Reporte de carga /api/verificaciones");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Solicitudes: ${total}`);
  console.log(`Concurrencia: ${concurrencia}`);
  console.log(`OK: ${ok}`);
  console.log(`Error: ${error}`);
  console.log(`Latencia promedio: ${promedio.toFixed(2)} ms`);
  console.log(`Latencia p95: ${percentile(resultados, 95).toFixed(2)} ms`);
  console.log(`Latencia p99: ${percentile(resultados, 99).toFixed(2)} ms`);
}

if (require.main === module) {
  ejecutar().catch((e) => {
    console.error("Fallo test de carga", e);
    process.exit(1);
  });
}
