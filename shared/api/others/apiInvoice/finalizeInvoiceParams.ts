import { z } from "zod/v4";
import { ApiListInvoiceV1Schema } from "./apiListInvoiceV1.js";

export const FinalizeInvoiceParamsSchema = z.object({
	invoice_id: z.string().meta({
		description: "The Autumn invoice ID to finalize.",
		example: "inv_2b3c4d5e6f7g8h",
	}),
});

export const FinalizeInvoiceResponseSchema = z.object({
	invoice: ApiListInvoiceV1Schema,
});

export type FinalizeInvoiceParams = z.infer<typeof FinalizeInvoiceParamsSchema>;
export type FinalizeInvoiceResponse = z.infer<
	typeof FinalizeInvoiceResponseSchema
>;
