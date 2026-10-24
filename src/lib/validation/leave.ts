import { z } from "zod";
import { isoDate, optionalIsoDate, optionalText, uuid } from "./common";

export const leaveSchema = z
  .object({
    employee_id: uuid,
    type: z.enum(["ferias", "licenca_medica", "licenca_maternidade", "licenca_paternidade", "falta_justificada", "folga", "outro"]),
    start_date: isoDate,
    end_date: isoDate,
    sell_days: z.coerce.number().int().min(0).max(10).default(0),
    acquisition_period_start: optionalIsoDate,
    reason: optionalText(500),
  })
  .refine((v) => v.end_date >= v.start_date, { path: ["end_date"], message: "A data final deve ser igual ou posterior à inicial." })
  .refine((v) => v.type === "ferias" || v.sell_days === 0, { path: ["sell_days"], message: "Abono só se aplica a férias." });
