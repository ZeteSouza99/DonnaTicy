import { z } from "@/lib/zod";

// ============================================================================
// Auth
// ============================================================================

// Mesma forma em cadastro e login: o e-mail é único sem diferenciar maiúsculas.
const emailSchema = z.string().trim().toLowerCase().pipe(z.email("E-mail inválido."));

const mfaCodeSchema = z.string().trim().regex(/^\d{6}$/, "O código tem 6 dígitos.");

export const strongPasswordSchema = z.string()
  .min(8, "Senha deve ter no mínimo 8 caracteres.")
  .regex(/[A-Z]/, "Senha deve conter pelo menos uma letra maiúscula.")
  .regex(/[a-z]/, "Senha deve conter pelo menos uma letra minúscula.")
  .regex(/[0-9]/, "Senha deve conter pelo menos um número.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres."),
  code: mfaCodeSchema.optional(),
});

export const createUserSchema = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres."),
  role: z.enum([
    "SUPER_ADMIN",
    "STORE_MANAGER",
    "SELLER",
    "BUYER",
    "WAREHOUSE_OP",
    "FINANCE",
    "MARKETING",
    "ECOM_ADMIN",
    "VIEWER",
  ]),
  locationId: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres.").optional(),
  role: z.enum([
    "SUPER_ADMIN",
    "STORE_MANAGER",
    "SELLER",
    "BUYER",
    "WAREHOUSE_OP",
    "FINANCE",
    "MARKETING",
    "ECOM_ADMIN",
    "VIEWER",
  ]).optional(),
  locationId: z.string().optional(),
  isActive: z.boolean().optional(),
  /** Remove o 2FA de quem perdeu o aparelho autenticador. */
  resetMfa: z.literal(true).optional(),
});

export const mfaActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("enable"), code: mfaCodeSchema }),
  z.object({ action: z.literal("disable"), password: z.string().min(1, "Informe a senha."), code: mfaCodeSchema }),
]);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: z.string()
    .min(8, "Nova senha deve ter no mínimo 8 caracteres.")
    .regex(/[A-Z]/, "Nova senha deve conter pelo menos uma letra maiúscula.")
    .regex(/[a-z]/, "Nova senha deve conter pelo menos uma letra minúscula.")
    .regex(/[0-9]/, "Nova senha deve conter pelo menos um número."),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
