import { z } from "zod/v4";

export const invoiceTemplateBodySchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	footer: z.string().trim().optional(),
	memo: z.string().trim().optional(),
	net_terms_days: z.number().int().positive().optional(),
});
