/**
 * Geração do BRCode Pix (padrão EMV/BACEN).
 *
 * O payload é montado no cliente — não há chamada a gateway. Isso torna o QR
 * Code estático quanto à origem, porém dinâmico quanto a valor e identificador,
 * que é o suficiente para cobrança de mensalidade.
 */

function pad(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Remove acentos e caracteres fora do ASCII imprimível.
 *
 * O BRCode é lido por apps de banco que assumem ASCII; nome ou cidade com
 * acento ("SÃO PAULO") faz alguns leitores recusarem o QR Code.
 */
function toAscii(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

/** Mantém apenas os caracteres aceitos pelo BACEN no txid (A-Z a-z 0-9). */
export function sanitizeTxid(value: string): string {
  const clean = toAscii(value).replace(/[^A-Za-z0-9]/g, "");
  return clean.slice(0, 25) || "***";
}

/**
 * Identificador do pagamento recorrente no extrato: categoria + competência
 * (ex.: SISTEMA202608). Assim cada mês chega identificado no extrato.
 */
export function buildRecurringTxid(
  category: string,
  reference?: string | Date | null,
): string {
  const date = reference ? new Date(reference) : new Date();
  const valid = Number.isNaN(date.getTime()) ? new Date() : date;
  const competencia = `${valid.getFullYear()}${String(valid.getMonth() + 1).padStart(2, "0")}`;
  return sanitizeTxid(`${category}${competencia}`);
}

export interface PixPayloadOptions {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount?: number;
  txid?: string;
  description?: string;
}

export function generatePixPayload(options: PixPayloadOptions): string {
  const {
    pixKey,
    merchantName,
    merchantCity,
    amount,
    txid = "***",
    description,
  } = options;

  // Merchant Account Information (ID 26)
  let mai = pad("00", "br.gov.bcb.pix");
  mai += pad("01", toAscii(pixKey));
  if (description) {
    mai += pad("02", toAscii(description).slice(0, 25));
  }

  let payload = "";
  payload += pad("00", "01"); // Payload Format Indicator
  payload += pad("26", mai); // Merchant Account Information
  payload += pad("52", "0000"); // Merchant Category Code
  payload += pad("53", "986"); // Transaction Currency (BRL)

  if (amount && amount > 0) {
    payload += pad("54", amount.toFixed(2));
  }

  payload += pad("58", "BR"); // Country Code
  payload += pad("59", toAscii(merchantName).slice(0, 25)); // Merchant Name
  payload += pad("60", toAscii(merchantCity).slice(0, 15)); // Merchant City
  payload += pad("62", pad("05", txid)); // Additional Data Field

  // CRC16 (ID 63, length 04)
  payload += "6304";
  payload += crc16(payload);

  return payload;
}
