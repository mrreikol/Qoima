// SVG fragments need a same-origin file URL; data URI <use> is not reliable.
import symbolUrl from "../assets/branding/qoima-symbol.svg?no-inline";
import "./brand.css";

export function BrandSymbol({ className = "", label }) {
  return (
    <svg
      className={`qoima-symbol ${className}`}
      width="28"
      height="30"
      viewBox="0 0 298 318"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <use href={`${symbolUrl}#qoima-symbol`} />
    </svg>
  );
}

export default function Brand({
  className = "",
  variant = "full",
  tagline = false,
}) {
  if (variant === "symbol")
    return <BrandSymbol className={className} label="Qoima" />;

  return (
    <span
      className={`qoima-brand ${tagline ? "qoima-brand--tagline" : ""} ${className}`}
    >
      <BrandSymbol />
      <span className="qoima-brand-copy">
        <span className="qoima-wordmark">Qoima</span>
        {tagline && <span className="qoima-tagline">Digital Warehouse</span>}
      </span>
    </span>
  );
}
