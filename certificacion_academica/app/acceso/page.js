"use client";

import { useEffect, useState } from "react";
import RevealOnScroll from "../components/RevealOnScroll";
import { conectarBackpack, listarWalletsInstaladas, useWalletSesion } from "../lib/cliente/wallet";
import { solicitarRolOnchainDesdeBackpack } from "../lib/cliente/roles_onchain";

const ROLES = ["UNIVERSIDAD", "MINISTERIO", "CANCILLERIA", "EGRESADO"];

export default function AccesoPage() {
  const { wallet, setWallet } = useWalletSesion();
  const [walletsInstaladas, setWalletsInstaladas] = useState({ backpack: false });
  const [form, setForm] = useState({
    rolSolicitado: "UNIVERSIDAD",
    nombres: "",
    apellidos: "",
    entidad: "",
    paisCancilleria: "",
    dni: "",
    cuitCuil: "",
    email: "",
  });
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [estadoWallet, setEstadoWallet] = useState(null);

  async function cargarEstadoWallet(walletObjetivo) {
    const walletConsulta = String(walletObjetivo || "").trim();
    if (!walletConsulta) {
      setEstadoWallet(null);
      return;
    }

    try {
      const response = await fetch(`/api/roles/estado?wallet=${encodeURIComponent(walletConsulta)}`, { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && payload?.ok) {
        setEstadoWallet(payload.data || null);
      }
    } catch (_e) {
      setEstadoWallet(null);
    }
  }

  useEffect(() => {
    setWalletsInstaladas(listarWalletsInstaladas());
  }, []);

  useEffect(() => {
    cargarEstadoWallet(wallet || "");
  }, [wallet]);

  async function conectarSesionBackpack() {
    setMensaje("");
    setError("");

    const resultado = await conectarBackpack();
    if (!resultado.ok) {
      setError(resultado.error || "No se pudo conectar Backpack");
      return;
    }

    setWallet(resultado.wallet);
    await cargarEstadoWallet(resultado.wallet);
    setMensaje("Wallet Backpack vinculada para la sesion.");
  }

  async function enviarSolicitud(event) {
    event.preventDefault();
    setMensaje("");
    setError("");

    if (!wallet) {
      setError("Debe vincular Backpack para solicitar el rol.");
      return;
    }

    const nombres = String(form.nombres || "").trim();
    const apellidos = String(form.apellidos || "").trim();
    const paisCancilleria = String(form.paisCancilleria || "").trim();
    const dni = String(form.dni || "").replace(/[^0-9]/g, "").slice(0, 8);
    const cuitCuil = String(form.cuitCuil || "").replace(/[^0-9]/g, "").slice(0, 11);
    const nombreCompuesto = `${apellidos}${apellidos && nombres ? ", " : ""}${nombres}`.trim();

    if (!nombres || !apellidos) {
      setError("Complete nombres y apellidos para solicitar el rol.");
      return;
    }

    if (!/^\d{7,8}$/.test(dni)) {
      setError("El DNI debe contener 7 u 8 digitos.");
      return;
    }

    if (!/^\d{11}$/.test(cuitCuil)) {
      setError("El CUIT/CUIL debe contener 11 digitos.");
      return;
    }

    if (esRolCancilleria && !paisCancilleria) {
      setError("Debe consignar el pais para el rol CANCILLERIA.");
      return;
    }

    const payload = await solicitarRolOnchainDesdeBackpack({
      wallet,
      ...form,
      entidad: esRolCancilleria ? paisCancilleria : form.entidad,
      nombre: nombreCompuesto,
      apellido: apellidos,
      dni,
      cuitCuil,
      documento: `DNI:${dni}|CUIT:${cuitCuil}`,
    });

    if (!payload.ok) {
      setError(payload.error || "No se pudo registrar la solicitud on-chain.");
      return;
    }

    await cargarEstadoWallet(wallet);
    setMensaje("Solicitud on-chain enviada correctamente. Queda en espera de aprobacion.");
  }

  const solicitudPendiente = estadoWallet?.estadoSolicitud === "pendiente";
  const solicitudAprobada = estadoWallet?.estadoSolicitud === "aprobada";
  const esRolEgresado = form.rolSolicitado === "EGRESADO";
  const esRolCancilleria = form.rolSolicitado === "CANCILLERIA";

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48 }}>
      <RevealOnScroll className="panel" delay={40}>
        <h1>Acceso y solicitud de rol</h1>
        <p style={{ color: "var(--texto-secundario)" }}>
          Ingrese la wallet operativa y complete su identificacion para solicitar el rol institucional.
        </p>
      </RevealOnScroll>

      <section className="grilla" style={{ marginTop: 16 }}>
        <RevealOnScroll className="panel col-12" delay={120}>
          <h2>Solicitud de rol</h2>

          <div style={{ marginBottom: 12 }}>
            <button className="boton" type="button" onClick={conectarSesionBackpack}>
              Vincular Wallet
            </button>
          </div>
          {!walletsInstaladas.backpack ? (
            <p style={{ color: "var(--texto-secundario)", marginBottom: 12 }}>
              Backpack no detectada. Verifique que la extension este habilitada.
            </p>
          ) : null}

          {solicitudPendiente ? (
            <div>
              <p style={{ color: "var(--texto-secundario)" }}>
                La solicitud de rol para esta wallet fue enviada correctamente y queda en espera de aprobacion.
              </p>
              <span className="estado estado-proceso">Pendiente de aprobacion</span>
            </div>
          ) : null}

          {solicitudAprobada ? (
            <div>
              <p style={{ color: "var(--texto-secundario)" }}>
                Esta wallet ya tiene un rol aprobado y puede operar segun el panel asignado.
              </p>
              <span className="estado estado-ok">Aprobada</span>
            </div>
          ) : null}

          {!solicitudPendiente && !solicitudAprobada ? (
            <form onSubmit={enviarSolicitud}>
              <div className="campo">
                <label>Rol solicitado</label>
                <select
                  value={form.rolSolicitado}
                  onChange={(e) =>
                    setForm((v) => ({
                      ...v,
                      rolSolicitado: e.target.value,
                      paisCancilleria: e.target.value === "CANCILLERIA" ? String(v.paisCancilleria || "") : "",
                    }))
                  }
                >
                  {ROLES.map((rol) => (
                    <option key={rol} value={rol}>{rol}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label>Nombre(s)</label>
                <input value={form.nombres} onChange={(e) => setForm((v) => ({ ...v, nombres: e.target.value }))} required />
              </div>
              <div className="campo">
                <label>Apellido(s)</label>
                <input value={form.apellidos} onChange={(e) => setForm((v) => ({ ...v, apellidos: e.target.value }))} required />
              </div>
              {!esRolEgresado ? (
                <div className="campo">
                  <label>{esRolCancilleria ? "Pais" : "Entidad"}</label>
                  <input
                    value={esRolCancilleria ? String(form.paisCancilleria || "") : form.entidad}
                    onChange={(e) =>
                      setForm((v) =>
                        esRolCancilleria
                          ? { ...v, paisCancilleria: e.target.value }
                          : { ...v, entidad: e.target.value }
                      )
                    }
                    required
                  />
                </div>
              ) : null}
              <div className="campo">
                <label>DNI</label>
                <input value={form.dni} onChange={(e) => setForm((v) => ({ ...v, dni: e.target.value }))} required />
              </div>
              <div className="campo">
                <label>CUIT/CUIL</label>
                <input value={form.cuitCuil} onChange={(e) => setForm((v) => ({ ...v, cuitCuil: e.target.value }))} required />
              </div>
              <div className="campo">
                <label>Email institucional</label>
                <input type="email" value={form.email} onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))} required />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="boton" type="submit">Enviar solicitud</button>
              </div>
            </form>
          ) : null}

          {mensaje ? <p style={{ marginTop: 10, color: "var(--exito)" }}>{mensaje}</p> : null}
          {error ? <p style={{ marginTop: 10, color: "var(--error)" }}>{error}</p> : null}
        </RevealOnScroll>
      </section>
    </main>
  );
}
