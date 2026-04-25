const REGISTRO_REGEX = /^[A-Z0-9-]{10,32}$/;

export function limpiarTexto(valor, maxLen = 128) {
  return String(valor || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

export function normalizarCuitCuil(valor) {
  return String(valor || "").replace(/[^0-9]/g, "").slice(0, 11);
}

export function validarRegistro(registro) {
  const limpio = limpiarTexto(registro, 32).toUpperCase();
  if (!limpio) {
    return { ok: false, valor: "", error: "El codigo de registro es obligatorio" };
  }
  if (!REGISTRO_REGEX.test(limpio)) {
    return { ok: false, valor: limpio, error: "El codigo de registro tiene formato invalido" };
  }
  return { ok: true, valor: limpio };
}

function validarSoloLetras(valor, campo) {
  const limpio = limpiarTexto(valor, 64);
  if (!limpio) return { ok: true, valor: "" };
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s'-]+$/.test(limpio)) {
    return { ok: false, valor: limpio, error: `El campo ${campo} tiene caracteres invalidos` };
  }
  return { ok: true, valor: limpio };
}

export function validarParametrosEgresado({ nombre, apellido, cuitCuil }) {
  const errores = [];

  const nombreVal = validarSoloLetras(nombre, "nombre");
  const apellidoVal = validarSoloLetras(apellido, "apellido");
  const cuitNormalizado = normalizarCuitCuil(cuitCuil);

  if (!nombreVal.ok) errores.push(nombreVal.error);
  if (!apellidoVal.ok) errores.push(apellidoVal.error);
  if (cuitNormalizado && !/^\d{11}$/.test(cuitNormalizado)) {
    errores.push("El CUIT/CUIL debe contener 11 digitos");
  }

  if (!nombreVal.valor && !apellidoVal.valor && !cuitNormalizado) {
    errores.push("Debe indicar al menos un criterio de busqueda");
  }

  return {
    ok: errores.length === 0,
    errores,
    valores: {
      nombre: nombreVal.valor,
      apellido: apellidoVal.valor,
      cuitCuil: cuitNormalizado,
    },
  };
}
