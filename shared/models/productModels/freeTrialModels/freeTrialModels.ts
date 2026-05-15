import { z } from "zod/v4";
import { FreeTrialDuration } from "./freeTrialEnums";

export const TrialOnEnd = ["bill", "revert"] as const;
export type TrialOnEnd = (typeof TrialOnEnd)[number];

export const FreeTrialSchema = z.object({
	id: z.string(),
	duration: z.enum(FreeTrialDuration),
	length: z.number(),
	unique_fingerprint: z.boolean(),

	created_at: z.number(),
	internal_product_id: z.string(),
	is_custom: z.boolean(),
	card_required: z.boolean(),
	on_end: z.enum(TrialOnEnd).optional(),
});

export const CreateFreeTrialSchema = z.object({
	length: z
		.string()
		.or(z.number())
		.transform((val) => Number(val))
		.refine((val) => val > 0, {
			message: "Free trial length must be greater than 0",
		}),
	unique_fingerprint: z.boolean().default(false),
	duration: z.enum(FreeTrialDuration).default(FreeTrialDuration.Day),
	card_required: z.boolean().default(true),
	on_end: z.enum(TrialOnEnd).optional(),
});

export type FreeTrial = z.infer<typeof FreeTrialSchema>;
export type CreateFreeTrial = z.infer<typeof CreateFreeTrialSchema>;
