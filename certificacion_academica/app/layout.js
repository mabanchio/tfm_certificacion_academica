import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import WalletChangeRedirect from "./components/WalletChangeRedirect";

const titulo = Space_Grotesk({ subsets: ["latin", "latin-ext"], weight: ["500", "700"] });
const texto = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"] });

export const metadata = {
  title: "Certificacion Academica Digital",
  description: "Sistema de certificacion academica blockchain para Argentina",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

const enlaces = [
  ["Inicio", "/"],
  ["Verificar titulos", "/verificar"],
];

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
      </head>
      <body className={`${titulo.className} ${texto.className}`}>
        <WalletChangeRedirect />
        <header className="navegacion">
          <div className="contenedor navegacion-contenido">
            <div className="navegacion-marca">
              <img src="/logo.png" alt="Logo de certificacion academica" className="navegacion-logo" />
              <span>Circuito Digital de Titulos</span>
            </div>
            <nav className="navegacion-links">
              {enlaces.map(([label, href]) => (
                <a className="navegacion-link" href={href} key={href}>
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
