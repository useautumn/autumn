import {
	type BillingBehavior,
	BillingBehaviorSchema,
	FreeTrialDuration,
	type ProductItem,
} from "@autumn/shared";
import { CancelActionSchema } from "node_modules/@autumn/shared/api/common/cancelMode";
import { z } from "zod/v4";
import {
	RefundBehaviorSchema,
	type RefundBehaviorValue,
} from "@/components/forms/update-subscription-v2/types/refundBehaviourSchema";

export type BillingBehaviorValue = BillingBehavior;
export type { RefundBehaviorValue };
export type CancelActionValue = z.infer<typeof CancelActionSchema>;

export const UpdateSubscriptionFormSchema = z.object({
	prepaidOptions: z.record(z.string(), z.number().nonnegative()),

	trialLength: z.number().positive().nullable(),
	trialDuration: z.enum(FreeTrialDuration),
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
