"use client";

import { useEffect, useState } from "react";

export default function MotivoRechazoModal({
  abierto,
  titulo,
  etiqueta,
  placeholder,
  onCancelar,
  onConfirmar,
}) {
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (abierto) setMotivo("");
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className="modal-fondo" role="dialog" aria-modal="true">
      <div className="modal-panel">
        <h3>{titulo}</h3>
        <div className="campo">
          <label>{etiqueta}</label>
          <textarea
            rows={4}
            value={motivo}
            placeholder={placeholder}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        <div className="modal-acciones">
          <button className="boton" type="button" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className="boton"
            type="button"
            onClick={() => onConfirmar(String(motivo || "").trim())}
          >
            Confirmar rechazo
          </button>
        </div>
      </div>
    </div>
  );
}
