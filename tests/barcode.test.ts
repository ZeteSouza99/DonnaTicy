import { describe, expect, it } from "vitest";
import {
  buildInternalEan13,
  ean13CheckDigit,
  encodeEan13,
  internalCodeToSeed,
  isValidEan13,
  normalizeInternalCode,
  onlyDigits,
} from "@/lib/barcode";

describe("ean13CheckDigit", () => {
  it("calcula o dígito verificador conhecido", () => {
    // 789835600000 -> DV 1 (exemplo clássico de EAN-13 brasileiro)
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13CheckDigit("123456789012")).toBe(8);
  });
});

describe("isValidEan13", () => {
  it("aceita códigos com DV correto", () => {
    expect(isValidEan13("4006381333931")).toBe(true);
  });

  it("rejeita DV incorreto ou tamanho errado", () => {
    expect(isValidEan13("4006381333930")).toBe(false);
    expect(isValidEan13("400638133393")).toBe(false);
    expect(isValidEan13("")).toBe(false);
  });
});

describe("buildInternalEan13", () => {
  it("gera código válido de 13 dígitos com prefixo interno 2", () => {
    const code = buildInternalEan13("12345");
    expect(code).toHaveLength(13);
    expect(code.startsWith("2")).toBe(true);
    expect(isValidEan13(code)).toBe(true);
  });

  it("é determinístico para a mesma semente", () => {
    expect(buildInternalEan13("777")).toBe(buildInternalEan13("777"));
  });

  it("gera códigos distintos para sementes distintas", () => {
    expect(buildInternalEan13("1")).not.toBe(buildInternalEan13("2"));
  });

  it("tolera semente vazia ou não numérica", () => {
    expect(isValidEan13(buildInternalEan13(""))).toBe(true);
    expect(isValidEan13(buildInternalEan13("ABC"))).toBe(true);
  });
});

describe("normalizeInternalCode", () => {
  it("remove acentos, espaços e símbolos e aplica caixa alta", () => {
    expect(normalizeInternalCode(" maya-001 ")).toBe("MAYA001");
    expect(normalizeInternalCode("çãO 12")).toBe("CAO12");
  });

  it("respeita o tamanho máximo", () => {
    expect(normalizeInternalCode("ABCDEFGHIJ", 4)).toBe("ABCD");
  });
});

describe("internalCodeToSeed", () => {
  it("converte alfanumérico em semente numérica estável", () => {
    expect(internalCodeToSeed("A1")).toBe("1001");
    expect(internalCodeToSeed("")).toBe("0");
  });
});

describe("onlyDigits", () => {
  it("mantém apenas dígitos", () => {
    expect(onlyDigits(" 200-123 456 ")).toBe("200123456");
  });
});

describe("encodeEan13", () => {
  it("produz 95 módulos com guardas nas posições esperadas", () => {
    const bits = encodeEan13("4006381333931");
    expect(bits).toHaveLength(95);
    expect(bits.startsWith("101")).toBe(true);
    expect(bits.endsWith("101")).toBe(true);
    expect(bits.slice(45, 50)).toBe("01010");
  });

  it("retorna vazio para código inválido", () => {
    expect(encodeEan13("123")).toBe("");
  });
});
