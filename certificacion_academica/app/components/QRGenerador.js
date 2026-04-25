import React from "react";
import QRCode from "qrcode";

export default function QRGenerador({ value, size = 180, className = "" }) {
  const [src, setSrc] = React.useState("");

  React.useEffect(() => {
    if (!value) return setSrc("");
    QRCode.toDataURL(value, { width: size, margin: 1 }, (err, url) => {
      if (err) return setSrc("");
      setSrc(url);
    });
  }, [value, size]);

  if (!value || !src) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%" }}>
      <img src={src} alt="QR de verificación" width={size} height={size} className={className} />
    </div>
  );
}
