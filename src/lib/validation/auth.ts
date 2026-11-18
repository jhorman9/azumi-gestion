import { z } from "zod";

export const userRoles = ["admin", "manager", "menu_editor"] as const;

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(190)
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .refine(
    (password) => new TextEncoder().encode(password).length <= 72,
    "La contraseña no puede superar 72 bytes.",
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1)
    .refine(
      (password) => new TextEncoder().encode(password).length <= 72,
      "La contraseña no es válida.",
    ),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(userRoles),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
