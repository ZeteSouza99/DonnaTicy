/**
 * Código de barras interno (EAN-13).
 *
 * Usa o prefixo "2" (faixa 200–299), reservada pelo GS1 para uso interno da
 * loja. O código NÃO é registrado globalmente — vale apenas dentro do sistema.
 *
 * Estrutura: 2 + <11 dígitos derivados do código interno/sequência> + DV.
 */

const EAN13_LENGTH = 13;
const INTERNAL_PREFIX = "2";

/** Mantém apenas dígitos. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Dígito verificador EAN-13 a partir dos 12 primeiros dígitos. */
export function ean13CheckDigit(base12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(base12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** Valida um EAN-13 completo (13 dígitos + DV correto). */
export function isValidEan13(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== EAN13_LENGTH) return false;
  return ean13CheckDigit(digits.slice(0, 12)) === Number(digits[12]);
}

/**
 * Monta um EAN-13 interno a partir de uma "semente" numérica.
 * A semente costuma ser o código interno do produto + índice da variante.
 */
export function buildInternalEan13(seed: string | number): string {
  const digits = onlyDigits(String(seed)) || "0";
  // 11 dígitos após o prefixo; corta pela direita para preservar o final (mais variável)
  const body = digits.slice(-11).padStart(11, "0");
  const base12 = `${INTERNAL_PREFIX}${body}`;
  return `${base12}${ean13CheckDigit(base12)}`;
}

/**
 * Normaliza o código interno digitado pelo usuário.
 * Aceita letras/números; remove acentos, espaços e símbolos.
 */
export function normalizeInternalCode(value: string, max = 20): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, max);
}

/**
 * Converte um código interno alfanumérico em uma semente numérica estável.
 * Letras viram sua posição no alfabeto (A=10 … Z=35), como na base 36.
 */
export function internalCodeToSeed(internalCode: string): string {
  let seed = "";
  for (const char of normalizeInternalCode(internalCode)) {
    seed += parseInt(char, 36).toString().padStart(2, "0");
  }
  return seed || "0";
}

/**
 * N-ésimo candidato a código de barras a partir de uma semente.
 * Reserva os 3 últimos dígitos para o índice, dando até 1000 variantes por
 * semente antes de invadir a faixa vizinha.
 */
export function barcodeCandidate(seedBase: string, index: number): string {
  const base = Number(onlyDigits(seedBase).slice(-11) || "0") * 1000;
  return buildInternalEan13(String(base + index));
}

// ---------------------------------------------------------------------------
// Codificação gráfica (para renderizar o SVG da etiqueta)
// ---------------------------------------------------------------------------

const L_CODES = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G_CODES = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R_CODES = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
/** Paridade do grupo da esquerda, indexada pelo primeiro dígito. */
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/**
 * Converte um EAN-13 na sequência de barras ("1") e espaços ("0"), com 95 módulos.
 * Retorna string vazia se o código for inválido.
 */
export function encodeEan13(value: string): string {
  const digits = onlyDigits(value);
  if (!isValidEan13(digits)) return "";

  const parity = PARITY[Number(digits[0])];
  let bits = "101"; // guarda inicial

  for (let i = 1; i <= 6; i++) {
    const digit = Number(digits[i]);
    bits += parity[i - 1] === "L" ? L_CODES[digit] : G_CODES[digit];
  }

  bits += "01010"; // guarda central

  for (let i = 7; i <= 12; i++) {
    bits += R_CODES[Number(digits[i])];
  }

  return `${bits}101`; // guarda final
}
