import { z } from "zod";
import {
  normalizeMoney,
  paymentMethods,
  moneyToCents,
} from "@/lib/finance/money";
import {
  cashOutflowSlots,
  closingPaymentChannels,
  closingPaymentTypes,
  tipSlots,
} from "@/lib/finance/closing";

function isValidBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const businessDateSchema = z
  .string()
  .trim()
  .refine(isValidBusinessDate, "La fecha no es válida.");

const optionalDateSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value) => value === null || isValidBusinessDate(value),
    "La fecha no es válida.",
  );

const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Ingresa un importe válido.")
  .transform(normalizeMoney);

const nonNegativeMoneySchema = moneySchema;
const positiveMoneySchema = moneySchema.refine(
  (value) => moneyToCents(value) > BigInt(0),
  "El importe debe ser mayor que cero.",
);

const optionalIdSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value) => value === null || /^[1-9]\d{0,19}$/.test(value),
    "Selecciona un registro válido.",
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const optionalPaymentMethodSchema = z
  .union([z.enum(paymentMethods), z.literal("")])
  .optional()
  .transform((value) => (value === "" || value === undefined ? null : value));

const closingOutflowSchema = z.object({
  description: optionalText(200),
  amount: nonNegativeMoneySchema,
});

const closingTipSchema = z.object({
  recipient: optionalText(120),
  amount: nonNegativeMoneySchema,
});

export const closingFormSchema = z
  .object({
    action: z.enum(["save", "confirm", "correct"]),
    operation_date: businessDateSchema,
    reported_sales_total: nonNegativeMoneySchema,
    pedidos_ya_total: nonNegativeMoneySchema,
    notes: optionalText(2000),
    correction_reason: optionalText(500),
    channel_payments: z
      .array(
        z.object({
          payment_type: z.enum(closingPaymentTypes),
          payment_channel: z.enum(closingPaymentChannels),
          amount: nonNegativeMoneySchema,
        }),
      )
      .length(closingPaymentTypes.length * closingPaymentChannels.length),
    cash_outflows: z.array(closingOutflowSchema).length(cashOutflowSlots),
    tips: z.array(closingTipSchema).length(tipSlots),
  })
  .superRefine((value, context) => {
    if (value.action === "correct" && !value.correction_reason) {
      context.addIssue({
        code: "custom",
        message: "Explica el motivo de la corrección.",
        path: ["correction_reason"],
      });
    }

    value.cash_outflows.forEach((outflow, index) => {
      if (
        (outflow.description === null) !==
        (moneyToCents(outflow.amount) === BigInt(0))
      ) {
        context.addIssue({
          code: "custom",
          message: "Completa descripción e importe para cada salida.",
          path: ["cash_outflows", index],
        });
      }
    });

    value.tips.forEach((tip, index) => {
      if (
        (tip.recipient === null) !==
        (moneyToCents(tip.amount) === BigInt(0))
      ) {
        context.addIssue({
          code: "custom",
          message: "Completa persona e importe para cada propina.",
          path: ["tips", index],
        });
      }
    });
  });

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const supplierSchema = z.object({
  legal_name: z.string().trim().min(1).max(190),
  contact_name: optionalText(120),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value.toLowerCase()))
    .refine(
      (value) => value === null || (value.length <= 190 && z.email().safeParse(value).success),
      "Ingresa un correo válido.",
    ),
  notes: optionalText(2000),
});

export const recordStatusSchema = z.object({
  is_active: z.enum(["0", "1"]),
});

export const expenseSchema = z
  .object({
    category_id: z.string().regex(/^[1-9]\d{0,19}$/),
    supplier_id: optionalIdSchema,
    expense_type: z.enum(["fixed", "variable"]),
    incurred_on: businessDateSchema,
    due_on: optionalDateSchema,
    amount: positiveMoneySchema,
    description: z.string().trim().min(1).max(500),
    status: z.enum(["unpaid", "paid"]),
    payment_method: optionalPaymentMethodSchema,
  })
  .superRefine((value, context) => {
    if (value.status === "paid" && !value.payment_method) {
      context.addIssue({
        code: "custom",
        message: "Selecciona el método de pago.",
        path: ["payment_method"],
      });
    }

    if (value.status === "unpaid" && value.payment_method) {
      context.addIssue({
        code: "custom",
        message: "Un gasto pendiente no puede tener método de pago.",
        path: ["payment_method"],
      });
    }

    if (value.due_on && value.due_on < value.incurred_on) {
      context.addIssue({
        code: "custom",
        message: "El vencimiento no puede ser anterior a la fecha del gasto.",
        path: ["due_on"],
      });
    }
  });

export const expenseStatusSchema = z.object({
  action: z.enum(["pay", "void"]),
  payment_method: optionalPaymentMethodSchema,
});

export const billSchema = z
  .object({
    supplier_id: z.string().regex(/^[1-9]\d{0,19}$/),
    invoice_reference: optionalText(100),
    issue_date: businessDateSchema,
    due_date: optionalDateSchema,
    amount: positiveMoneySchema,
    notes: optionalText(2000),
  })
  .superRefine((value, context) => {
    if (value.due_date && value.due_date < value.issue_date) {
      context.addIssue({
        code: "custom",
        message: "El vencimiento no puede ser anterior a la emisión.",
        path: ["due_date"],
      });
    }
  });

export const billPaymentSchema = z.object({
  amount: positiveMoneySchema,
  payment_method: z.enum(paymentMethods),
  reference: optionalText(120),
});

export const billStatusSchema = z.object({
  action: z.literal("void"),
});
