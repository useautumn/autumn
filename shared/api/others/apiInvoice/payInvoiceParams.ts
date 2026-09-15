import { z } from "zod/v4";
import { ApiListInvoiceV1Schema } from "./apiListInvoiceV1.js";

export const PayInvoiceParamsSchema = z.object({
	invoice_id: z.string().meta({
		description: "The Autumn invoice ID to mark as paid.",
		example: "inv_2b3c4d5e6f7g8h",
	}),
});

export const PayInvoiceResponseSchema = z.object({
	invoice: ApiListInvoiceV1Schema,
});

export type PayInvoiceParams = z.infer<typeof PayInvoiceParamsSchema>;
export type PayInvoiceResponse = z.infer<typeof PayInvoiceResponseSchema>;
