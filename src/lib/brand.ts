/**
 * Identidade visual por cliente (whitelabel).
 * Cada deploy define suas variáveis NEXT_PUBLIC_BRAND_* no ambiente.
 */
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "DonnaTicy",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Sistema de gestão para moda e operação digital",
  logo: process.env.NEXT_PUBLIC_BRAND_LOGO ?? "/donnaticy-logo.png",
} as const;
