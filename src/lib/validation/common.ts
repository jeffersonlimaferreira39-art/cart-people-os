import { z } from "zod";
import { isIsoDate } from "@/lib/domain/dates";
import { isValidCpf, isValidPis, onlyDigits } from "@/lib/domain/documents-br";

export const uuid = z.uuid("Seleção inválida.");
export const optionalUuid = z.uuid("Seleção inválida.").optional();
export const isoDate = z.string({ error: "Informe a data." }).refine(isIsoDate, "Data inválida.");
export const optionalIsoDate = isoDate.optional();
export const optionalText = (max = 200) => z.string().max(max, `Máximo de ${max} caracteres.`).optional();

export const cpf = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCpf, "CPF inválido.")
  .optional();

export const pis = z
  .string()
  .transform(onlyDigits)
  .refine(isValidPis, "PIS/PASEP inválido.")
  .optional();

/** "4.250,90" ou "4250.90" → 4250.9 */
export const money = z
  .string()
  .transform((v) => {
    const s = v.replace(/[R$\s]/g, "");
    const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    return Number(normalized);
  })
  .refine((n) => Number.isFinite(n) && n >= 0 && n < 10_000_000, "Valor inválido.")
  .optional();

/** Política de senha do People OS (definida pelo usuário ou provisória do administrador). */
export const password = z
  .string()
  .min(10, "Use pelo menos 10 caracteres.")
  .max(72, "Use no máximo 72 caracteres.")
  .regex(/[A-Za-z]/, "Inclua letras.")
  .regex(/\d/, "Inclua números.");
