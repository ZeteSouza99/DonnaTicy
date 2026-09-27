/** Cabeçalhos que o proxy injeta em toda requisição para correlacionar logs e respostas. */
export const REQUEST_ID_HEADER = "x-request-id";
export const REQUEST_PATH_HEADER = "x-request-path";
export const REQUEST_METHOD_HEADER = "x-request-method";

const SAFE_REQUEST_ID = /^[\w.:-]{8,100}$/;

/** Reaproveita o id recebido (se for seguro para logar) ou gera um novo. */
export function resolveRequestId(inbound: string | null | undefined): string {
  return inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : crypto.randomUUID();
}
