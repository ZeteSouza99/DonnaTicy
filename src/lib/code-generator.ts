import { randomBytes } from "crypto";

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomAlphanumeric(length: number): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }
  return result;
}

export function generateCode(prefix: string): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${prefix}-${year}${month}-${randomAlphanumeric(6)}`;
}

export function generateCustomerCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `CLI-${timestamp}${randomAlphanumeric(3)}`;
}
