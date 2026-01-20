import { z } from "zod";

// Route form validation schema
export const routeSchema = z.object({
  client: z
    .string()
    .trim()
    .min(1, "Cliente é obrigatório")
    .max(200, "Cliente deve ter no máximo 200 caracteres"),
  neighborhood: z
    .string()
    .trim()
    .min(1, "Bairro é obrigatório")
    .max(100, "Bairro deve ter no máximo 100 caracteres"),
  address: z
    .string()
    .max(300, "Endereço deve ter no máximo 300 caracteres")
    .optional()
    .or(z.literal("")),
  cep: z
    .string()
    .max(10, "CEP deve ter no máximo 10 caracteres")
    .regex(/^$|^\d{5}-?\d{3}$/, "CEP deve estar no formato 00000-000")
    .optional()
    .or(z.literal("")),
  observation: z
    .string()
    .max(1000, "Observação deve ter no máximo 1000 caracteres")
    .optional()
    .or(z.literal("")),
  consultant_id: z.string().uuid().optional().or(z.literal("")),
  driver_id: z.string().uuid().optional().or(z.literal("")),
  vehicle_id: z.string().uuid().optional().or(z.literal("")),
  payment_method_id: z.string().uuid().optional().or(z.literal("")),
});

// Driver form validation schema
export const driverSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, "Formato de cor inválido"),
});

// Vehicle form validation schema
export const vehicleSchema = z.object({
  plate: z
    .string()
    .trim()
    .min(1, "Placa é obrigatória")
    .max(20, "Placa deve ter no máximo 20 caracteres")
    .regex(/^[A-Z0-9-]+$/i, "Placa deve conter apenas letras, números e hífens"),
});

// Consultant form validation schema
export const consultantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
});

// Payment method form validation schema
export const paymentMethodSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome é obrigatório")
    .max(50, "Nome deve ter no máximo 50 caracteres"),
});

// Occurrence form validation schema
export const occurrenceSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Descrição é obrigatória")
    .max(500, "Descrição deve ter no máximo 500 caracteres"),
  motorista: z.boolean(),
  vendedor: z.boolean(),
  cliente: z.boolean(),
});
