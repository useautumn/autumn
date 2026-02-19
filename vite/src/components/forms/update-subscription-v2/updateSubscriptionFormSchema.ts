import {
	BillingBehaviorSchema,
	CancelActionSchema,
	FreeTrialDuration,
	type ProductItem,
} from "@autumn/shared";

import { z } from "zod/v4";
import { RefundBehaviorSchema } from "@/components/forms/update-subscription-v2/types/refundBehaviourSchema";

export const UpdateSubscriptionFormSchema = z.object({
	prepaidOptions: z.record(z.string(), z.number().nonnegative()),

	trialLength: z.number().positive().nullable(),
	trialDuration: z.enum(FreeTrialDuration),
	trialCardRequired: z.boolean(),
	removeTrial: z.boolean(),
	trialEnabled: z.boolean(),

	version: z.number().positive(),

	items: z.custom<ProductItem[]>().nullable(),

	cancelAction: CancelActionSchema.nullable(),
	billingBehavior: BillingBehaviorSchema.nullable(),
	refundBehavior: RefundBehaviorSchema.nullable(),
});

export type UpdateSubscriptionForm = z.infer<
	typeof UpdateSubscriptionFormSchema
>;
