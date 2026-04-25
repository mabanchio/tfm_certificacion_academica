/* eslint-disable no-console */

async function chequear(url, esperadoOk = true) {
  const r = await fetch(url);
  if (esperadoOk && !r.ok) {
    throw new Error(`Fallo ${url} status ${r.status}`);
  }
  return { status: r.status };
}

async function ejecutar() {
  const base = process.env.BASE_URL || "http://localhost:3000";

  const checks = [
    `${base}/api/salud`,
    `${base}/api/observabilidad`,
    `${base}/api/verificaciones?registro=1FD8AD999C3D1A254594`,
    `${base}/api/egresados?nombre=Maria`,
  ];

  for (const url of checks) {
    const res = await chequear(url, true);
    console.log(`OK ${url} -> ${res.status}`);
  }

  console.log("Smoke UAT completado");
}

if (require.main === module) {
  ejecutar().catch((e) => {
    console.error("Fallo UAT smoke", e.message);
    process.exit(1);
  });
}
