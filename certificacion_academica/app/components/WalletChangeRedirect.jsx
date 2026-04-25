"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWalletSesion } from "../lib/cliente/wallet";

export default function WalletChangeRedirect() {
  const { wallet } = useWalletSesion();
  const router = useRouter();
  const pathname = usePathname();
  const previa = useRef(null);

  const rutasPublicas = ["/", "/verificar", "/acceso"];
  const esRutaPublica = rutasPublicas.some(
    (ruta) => pathname === ruta || pathname?.startsWith(`${ruta}/`)
  );

  useEffect(() => {
    const huboSyncInicial = previa.current === "" && wallet;
    const huboCambioReal = Boolean(previa.current) && Boolean(wallet) && previa.current !== wallet;
    const huboDesconexion = Boolean(previa.current) && !wallet;

    if (!esRutaPublica && !huboSyncInicial && (huboCambioReal || huboDesconexion)) {
      router.push("/");
    }
    previa.current = wallet;
  }, [wallet, pathname, router, esRutaPublica]);

  return null;
}
