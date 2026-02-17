import { z } from "zod/v4";
export const InvoiceModeParamsSchema = z.object({
	enabled: z.boolean(),
	enable_product_immediately: z.boolean().default(false),
	finalize_invoice: z.boolean().default(true),
});

export type InvoiceModeParams = z.infer<typeof InvoiceModeParamsSchema>;
