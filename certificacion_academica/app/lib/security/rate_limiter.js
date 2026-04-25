const ventanas = new Map();

function limpiarExpirados(ahoraMs) {
  for (const [clave, info] of ventanas.entries()) {
    if (info.expiraEn <= ahoraMs) {
      ventanas.delete(clave);
    }
  }
}

export function verificarRateLimit({
  bucket,
  key,
  maxIntentos = 30,
  ventanaMs = 60_000,
  ahoraMs = Date.now(),
}) {
  limpiarExpirados(ahoraMs);

  const clave = `${bucket}:${key}`;
  const actual = ventanas.get(clave);

  if (!actual) {
    ventanas.set(clave, { intentos: 1, expiraEn: ahoraMs + ventanaMs });
    return { permitido: true, restantes: maxIntentos - 1, reintentoEn: 0 };
  }

  if (actual.intentos >= maxIntentos) {
    return {
      permitido: false,
      restantes: 0,
      reintentoEn: Math.max(0, actual.expiraEn - ahoraMs),
    };
  }

  actual.intentos += 1;
  ventanas.set(clave, actual);

  return {
    permitido: true,
    restantes: Math.max(0, maxIntentos - actual.intentos),
    reintentoEn: 0,
  };
}

export function reiniciarRateLimit() {
  ventanas.clear();
}
