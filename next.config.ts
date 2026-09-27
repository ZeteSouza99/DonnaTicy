import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";
const receiptPrinting = process.env.NEXT_PUBLIC_FEATURE_RECEIPT_PRINTING === "true";
// Deve bater com PRINT_SERVICE_URL em src/lib/print.ts.
const printServiceOrigin = "http://127.0.0.1:5555";

/**
 * CSP compatível com o runtime do Next (App Router).
 * `unsafe-inline` em script-src ainda é necessário para o bootstrap de hidratação;
 * `unsafe-eval` fica restrito ao modo de desenvolvimento (React Refresh).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${receiptPrinting ? ` ${printServiceOrigin}` : ""}${isProduction ? "" : " ws: wss:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Pode promover a chamada http do print-service para https; o HSTS já protege o próprio site.
  ...(isProduction && !receiptPrinting ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
