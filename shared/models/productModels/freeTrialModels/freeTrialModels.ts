import { z } from "zod/v4";
import { FreeTrialDuration } from "./freeTrialEnums.js";

export const FreeTrialSchema = z.object({
	id: z.string(),
	duration: z.nativeEnum(FreeTrialDuration),
	length: z.number(),
	unique_fingerprint: z.boolean(),

	created_at: z.number(),
	internal_product_id: z.string(),
	is_custom: z.boolean(),
	card_required: z.boolean(),
});

export const CreateFreeTrialSchema = z.object({
	length: z
		.string()
		.or(z.number())
		.transform((val) => Number(val)),
	unique_fingerprint: z.boolean().default(false),
	duration: z.nativeEnum(FreeTrialDuration).default(FreeTrialDuration.Day),
	card_required: z.boolean().default(true),
});

export type FreeTrial = z.infer<typeof FreeTrialSchema>;
export type CreateFreeTrial = z.infer<typeof CreateFreeTrialSchema>;
