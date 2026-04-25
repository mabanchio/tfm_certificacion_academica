"use client";

import { useEffect, useState } from "react";

const KEY_WALLET = "mvp_wallet_actual";

export function guardarWallet(wallet) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_WALLET, String(wallet || "").trim());
}

export function leerWallet() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(KEY_WALLET) || "").trim();
}

export function limpiarWallet() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_WALLET);
}

function notificarCambioWallet(wallet) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("wallet-cambiada", {
      detail: { wallet: String(wallet || "").trim() },
    })
  );
}

function obtenerProveedorBackpack() {
  if (typeof window === "undefined") return null;

  const proveedoresSolana = Array.isArray(window.solana?.providers)
    ? window.solana.providers
    : [];

  const posibles = [
    window.xnft?.solana,
    window.backpack,
    window.backpack?.solana,
    ...proveedoresSolana,
    window.solana,
  ];

  for (const proveedor of posibles) {
    if (!proveedor) continue;
    const nombre = String(proveedor.name || proveedor.provider || "").toLowerCase();
    const esBackpack = Boolean(proveedor.isBackpack || nombre.includes("backpack"));
    if (esBackpack && typeof proveedor.connect === "function") {
      return proveedor;
    }
  }

  // Algunos entornos exponen Backpack solo como window.solana sin banderas explicitas.
  if (window.solana && typeof window.solana.connect === "function") {
    return window.solana;
  }

  return null;
}

export function obtenerBackpackProvider() {
  return obtenerProveedorBackpack();
}

function obtenerDireccion(proveedor, respuesta) {
  return (
    respuesta?.publicKey?.toString?.() ||
    respuesta?.address ||
    proveedor?.publicKey?.toString?.() ||
    ""
  );
}

async function esperarProveedor(timeoutMs = 8000) {
  const inicio = Date.now();

  while (Date.now() - inicio < timeoutMs) {
    const proveedor = obtenerProveedorBackpack();
    if (proveedor) return proveedor;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return null;
}

export function listarWalletsInstaladas() {
  const backpack = Boolean(obtenerProveedorBackpack());
  return { backpack };
}

export async function conectarBackpack() {
  const proveedor = await esperarProveedor();
  if (!proveedor) {
    return { ok: false, error: "Backpack no detectada en el navegador" };
  }

  try {
    let respuesta = null;
    if (typeof proveedor.connect === "function") {
      respuesta = await proveedor.connect({ onlyIfTrusted: false });
    } else if (typeof proveedor.request === "function") {
      respuesta = await proveedor.request({ method: "connect" });
    }

    const llave = obtenerDireccion(proveedor, respuesta);

    if (!llave) {
      return { ok: false, error: "No fue posible obtener la direccion de la wallet" };
    }

    return { ok: true, wallet: llave };
  } catch (_e) {
    return { ok: false, error: "No se pudo conectar con Backpack" };
  }
}

export function useWalletSesion() {
  const [wallet, setWallet] = useState("");

  useEffect(() => {
    setWallet(leerWallet());
  }, []);

  useEffect(() => {
    const proveedor = obtenerProveedorBackpack();
    if (!proveedor || typeof proveedor.on !== "function") return;

    const onAccountChanged = (publicKey) => {
      const walletNueva = publicKey?.toString?.() || "";
      guardarWallet(walletNueva);
      setWallet(walletNueva);
      notificarCambioWallet(walletNueva);
    };

    const onDisconnect = () => {
      limpiarWallet();
      setWallet("");
      notificarCambioWallet("");
    };

    proveedor.on("accountChanged", onAccountChanged);
    proveedor.on("disconnect", onDisconnect);

    return () => {
      if (typeof proveedor.off === "function") {
        proveedor.off("accountChanged", onAccountChanged);
        proveedor.off("disconnect", onDisconnect);
      }
    };
  }, []);

  const actualizar = (walletNueva) => {
    const normalizada = String(walletNueva || "").trim();
    guardarWallet(normalizada);
    setWallet(normalizada);
    notificarCambioWallet(normalizada);
  };

  return { wallet, setWallet: actualizar };
}
