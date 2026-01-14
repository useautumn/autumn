import { FreeTrialDuration } from "@autumn/shared";
import { z } from "zod/v4";

export const UpdateSubscriptionFormSchema = z.object({
	prepaidOptions: z.record(z.string(), z.number().nonnegative()),

	// Free trial configuration (flat fields for easier binding)
	trialLength: z.number().positive().nullable(),
	trialDuration: z.enum(FreeTrialDuration),
	trialCardRequired: z.boolean(),
	removeTrial: z.boolean(), // Only relevant when currently trialing

	// Plan version (initialized with current version)
	version: z.number().positive(),
});

export type UpdateSubscriptionForm = z.infer<
	typeof UpdateSubscriptionFormSchema
>;
