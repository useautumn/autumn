import { z } from "zod/v4";
import { ApiListInvoiceV1Schema } from "./apiListInvoiceV1.js";

export const VoidInvoiceParamsSchema = z.object({
	invoice_id: z.string().meta({
		description: "The Autumn invoice ID to void.",
		example: "inv_2b3c4d5e6f7g8h",
	}),
});

export const VoidInvoiceResponseSchema = z.object({
	invoice: ApiListInvoiceV1Schema,
});

export type VoidInvoiceParams = z.infer<typeof VoidInvoiceParamsSchema>;
export type VoidInvoiceResponse = z.infer<typeof VoidInvoiceResponseSchema>;
