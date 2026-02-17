import { z } from "zod/v4";
export const InvoiceModeParamsSchema = z.object({
	enabled: z.boolean(),
	enable_plan_immediately: z.boolean().default(false),
	finalize: z.boolean().default(true),
});

export type InvoiceModeParams = z.infer<typeof InvoiceModeParamsSchema>;
