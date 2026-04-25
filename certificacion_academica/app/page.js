"use client";

import { useEffect, useMemo, useState } from "react";
import RevealOnScroll from "./components/RevealOnScroll";
import { conectarBackpack, listarWalletsInstaladas, useWalletSesion } from "./lib/cliente/wallet";
import { WALLET_ADMIN_SISTEMA } from "./lib/config/sistema";

const PANEL_POR_ROL = {
  ADMIN: "/autoridad",
  UNIVERSIDAD: "/universidad",
  MINISTERIO: "/ministerio",
  CANCILLERIA: "/cancilleria",
  EGRESADO: "/egresado",
};

export default function Home() {
  const { wallet, setWallet } = useWalletSesion();
  const [estado, setEstado] = useState(null);
  const [walletsInstaladas, setWalletsInstaladas] = useState({ backpack: false });
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    let cancelado = false;
    async function cargarEstado() {
      if (!wallet) {
        setEstado(null);
        return;
      }
      const response = await fetch(`/api/roles/estado?wallet=${encodeURIComponent(wallet)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!cancelado) setEstado(payload.data || null);
    }
    cargarEstado();
    return () => {
      cancelado = true;
    };
  }, [wallet]);

  useEffect(() => {
    setWalletsInstaladas(listarWalletsInstaladas());
  }, []);

  const panelesDisponibles = useMemo(() => {
    const roles = Array.isArray(estado?.rolesDisponibles)
      ? estado.rolesDisponibles
      : estado?.rolActivo
        ? [estado.rolActivo]
        : [];

    return roles
      .map((rol) => ({ rol, ruta: PANEL_POR_ROL[rol] || "" }))
      .filter((item) => item.ruta);
  }, [estado]);

  async function vincularBackpack() {
    const resultado = await conectarBackpack();
    if (!resultado.ok) {
      setMensaje(resultado.error || "No se pudo vincular Backpack");
      return;
    }

    setWallet(resultado.wallet);
    setMensaje("Wallet Backpack vinculada");
  }

  function desvincularWallet() {
    setWallet("");
    setMensaje("Wallet desvinculada");
  }

  return (
    <main className="contenedor" style={{ paddingTop: 34, paddingBottom: 48, display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="hero">
        <RevealOnScroll>
          <h1>Plataforma nacional de certificacion academica</h1>
          <p>Vincule su wallet para operar segun rol. Sin wallet, solo verificacion publica.</p>
        </RevealOnScroll>
      </section>

      <RevealOnScroll className="panel" delay={30}>
        <h1>Acceso al sistema</h1>
        <p style={{ color: "var(--texto-secundario)" }}>Seleccione una wallet instalada para operar.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button className="boton" type="button" onClick={vincularBackpack}>
            Vincular Wallet
          </button>
          {wallet ? (
            <button className="boton" type="button" onClick={desvincularWallet}>Desvincular</button>
          ) : null}
        </div>
        {!walletsInstaladas.backpack ? (
          <p style={{ color: "var(--texto-secundario)", marginTop: 10 }}>
            Backpack no detectada. Verifique que la extension este habilitada.
          </p>
        ) : null}
        {mensaje ? <p style={{ color: "var(--texto-secundario)", marginTop: 10 }}>{mensaje}</p> : null}
      </RevealOnScroll>

      {!wallet ? (
        <RevealOnScroll className="panel" delay={80}>
          <h2>Acceso publico</h2>
          <p style={{ color: "var(--texto-secundario)" }}>
            Sin wallet vinculada solo esta habilitada la verificacion publica de titulos.
          </p>
          <a href="/verificar" className="boton" style={{ display: "inline-block" }}>
            Verificar titulo publicamente
          </a>
        </RevealOnScroll>
      ) : null}

      {wallet && estado?.walletValida !== false && estado?.estadoSolicitud === "sin_solicitud" ? (
        <RevealOnScroll className="panel" delay={120}>
          <h2>Solicitud de rol requerida</h2>
          <p style={{ color: "var(--texto-secundario)" }}>
            Para operar debe completar su solicitud de rol.
          </p>
          <a href="/acceso" className="boton" style={{ display: "inline-block" }}>
            Solicitar rol
          </a>
        </RevealOnScroll>
      ) : null}

      {wallet && estado?.estadoSolicitud === "pendiente" ? (
        <RevealOnScroll className="panel" delay={120}>
          <h2>Solicitud en revision</h2>
          <p style={{ color: "var(--texto-secundario)" }}>
            Su solicitud fue recibida. Estado: pendiente de aprobacion.
          </p>
          <span className="estado estado-proceso">Pendiente</span>
        </RevealOnScroll>
      ) : null}

      {wallet && estado?.estadoSolicitud === "rechazada" ? (
        <RevealOnScroll className="panel" delay={120}>
          <h2>Solicitud rechazada</h2>
          <p style={{ color: "var(--texto-secundario)" }}>
            Puede reenviar su solicitud con los datos corregidos.
          </p>
          <a href="/acceso" className="boton" style={{ display: "inline-block" }}>
            Reenviar
          </a>
        </RevealOnScroll>
      ) : null}

      {wallet && estado?.estadoSolicitud === "aprobada" && panelesDisponibles.length > 0 ? (
        <section className="grilla" style={{ marginTop: 0 }}>
          <RevealOnScroll className="panel col-6" delay={90}>
            <h2>Operacion habilitada</h2>
            <p style={{ color: "var(--texto-secundario)" }}>
              Roles habilitados: <strong>{panelesDisponibles.map((item) => item.rol).join(", ")}</strong>
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {panelesDisponibles.map((item) => (
                <a key={item.rol} href={item.ruta} className="boton" style={{ display: "inline-block" }}>
                  Panel {item.rol}
                </a>
              ))}
            </div>
          </RevealOnScroll>
          <RevealOnScroll className="panel col-6" delay={140}>
            <h2>Verificacion publica</h2>
            <p style={{ color: "var(--texto-secundario)" }}>
              Consulta por codigo de titulo.
            </p>
            <a href="/verificar" className="boton" style={{ display: "inline-block" }}>
              Verificar
            </a>
          </RevealOnScroll>
        </section>
      ) : null}

      {wallet && panelesDisponibles.some((item) => item.rol === "ADMIN") && wallet === WALLET_ADMIN_SISTEMA ? (
        <RevealOnScroll className="panel" delay={160}>
          <h2>Administrador principal detectado</h2>
          <p style={{ color: "var(--texto-secundario)" }}>
            El rol ADMIN se asigna automaticamente para esta wallet.
          </p>
        </RevealOnScroll>
      ) : null}
    </main>
  );
}
