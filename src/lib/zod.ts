import { z } from "zod/v4";

// Mensagens padrão do Zod em pt-BR (campo obrigatório, tipo inválido, etc.).
// Importe `z` daqui em vez de "zod/v4" para garantir que o locale esteja aplicado.
z.config(z.locales.pt());

export { z };
