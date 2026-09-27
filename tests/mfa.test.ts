import { beforeAll, describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  decryptMfaSecret,
  encryptMfaSecret,
  generateMfaSecret,
  matchTotp,
  otpauthUrl,
  totpAt,
  totpStep,
  verifyMfaCode,
} from "@/lib/mfa";

// Vetor de teste do RFC 6238 (SHA-1): segredo ASCII "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890");

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://unit:unit@127.0.0.1:1/unit";
  process.env.JWT_SECRET = "segredo-de-teste-unitario-com-32-caracteres";
});

describe("base32", () => {
  it("codifica e decodifica sem perdas", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 128]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });

  it("recusa caracteres fora do alfabeto", () => {
    expect(() => base32Decode("ABC1")).toThrow();
  });
});

describe("TOTP", () => {
  it("reproduz os vetores do RFC 6238 com 6 dígitos", () => {
    expect(totpAt(RFC_SECRET, totpStep(59_000))).toBe("287082");
    expect(totpAt(RFC_SECRET, totpStep(1_111_111_109_000))).toBe("081804");
    expect(totpAt(RFC_SECRET, totpStep(2_000_000_000_000))).toBe("279037");
  });

  it("aceita um passo de diferença de relógio e recusa dois", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), now)).toBeNull();
    expect(matchTotp(RFC_SECRET, "12345", now)).toBeNull();
  });

  it("monta a URL otpauth com emissor e conta", () => {
    const url = otpauthUrl("JBSWY3DPEHPK3PXP", "ana@loja.com", "Minha Loja");
    expect(url.startsWith("otpauth://totp/Minha%20Loja%3Aana%40loja.com?")).toBe(true);
    expect(new URL(url).searchParams.get("secret")).toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("segredo cifrado", () => {
  it("cifra com IV aleatório e decifra o original", () => {
    const secret = generateMfaSecret();
    const first = encryptMfaSecret(secret);
    expect(first).not.toContain(secret);
    expect(encryptMfaSecret(secret)).not.toBe(first);
    expect(decryptMfaSecret(first)).toBe(secret);
  });

  it("detecta adulteração", () => {
    const [version, iv, tag, data] = encryptMfaSecret(generateMfaSecret()).split(".");
    const tampered = [version, iv, tag, `${data[0] === "A" ? "B" : "A"}${data.slice(1)}`].join(".");
    expect(() => decryptMfaSecret(tampered)).toThrow();
  });

  it("valida o código atual e recusa reutilizar o mesmo passo", () => {
    const secret = generateMfaSecret();
    const encrypted = encryptMfaSecret(secret);
    const code = totpAt(base32Decode(secret), totpStep());
    const step = verifyMfaCode(encrypted, code, null);
    expect(step).not.toBeNull();
    expect(verifyMfaCode(encrypted, code, step)).toBeNull();
  });
});
