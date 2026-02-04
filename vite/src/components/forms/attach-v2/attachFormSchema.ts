import { FreeTrialDuration, type ProductItem } from "@autumn/shared";
import { z } from "zod/v4";

export const AttachFormSchema = z.object({
	productId: z.string(),
	prepaidOptions: z.record(z.string(), z.number().nonnegative()),
	items: z.custom<ProductItem[]>().nullable(),
	version: z.number().positive().optional(),
	trialLength: z.number().positive().nullable(),
	trialDuration: z.enum(FreeTrialDuration),
	trialEnabled: z.boolean(),
});

export type AttachForm = z.infer<typeof AttachFormSchema>;
