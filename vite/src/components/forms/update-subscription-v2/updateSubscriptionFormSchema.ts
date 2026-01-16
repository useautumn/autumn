import { FreeTrialDuration, type ProductItem } from "@autumn/shared";
import { z } from "zod/v4";

export const UpdateSubscriptionFormSchema = z.object({
	prepaidOptions: z.record(z.string(), z.number().nonnegative()),

	trialLength: z.number().positive().nullable(),
	trialDuration: z.enum(FreeTrialDuration),
	removeTrial: z.boolean(),

	version: z.number().positive(),

	items: z.custom<ProductItem[]>().nullable(),
});

export type UpdateSubscriptionForm = z.infer<
	typeof UpdateSubscriptionFormSchema
>;
