import { AppEnv } from "../../genModels/genEnums.js";
import {
  CusProductResponseSchema,
  CusEntResponseV2Schema,
} from "../cusResponseModels.js";

import { z } from "zod";
import { InvoiceResponseSchema } from "../invoiceModels/invoiceResponseModels.js";

export const EntityResponseSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  customer_id: z.string(),
  created_at: z.number(),
  env: z.nativeEnum(AppEnv),

  products: z.array(CusProductResponseSchema),

  features: z.record(z.string(), CusEntResponseV2Schema),
  invoices: z.array(InvoiceResponseSchema).optional(),
});

export type EntityResponse = z.infer<typeof EntityResponseSchema>;
