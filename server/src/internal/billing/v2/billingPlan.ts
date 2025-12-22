import {
	CusProductStatus,
	EntitlementSchema,
	FreeTrialSchema,
	PriceSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { FullCusProductSchema } from "../../../../../shared/models/cusProductModels/cusProductModels";

export const FreeTrialPlanSchema = z.object({
	freeTrial: FreeTrialSchema.nullable().optional(),
	trialEndsAt: z.number().optional(),
});

export type FreeTrialPlan = z.infer<typeof FreeTrialPlanSchema>;

export const StripeSubscriptionActionSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("create"),
		params: z.custom<import("stripe").Stripe.SubscriptionCreateParams>(),
	}),
	z.object({
		type: z.literal("update"),
		stripeSubscriptionId: z.string(),
		params: z.custom<import("stripe").Stripe.SubscriptionUpdateParams>(),
	}),
	z.object({
		type: z.literal("cancel"),
		stripeSubscriptionId: z.string(),
	}),
]);

export type StripeSubscriptionAction = z.infer<
	typeof StripeSubscriptionActionSchema
>;

export const StripeBillingPlanSchema = z.object({
	subscription: StripeSubscriptionActionSchema.optional(),
});

export const AutumnBillingPlanSchema = z.object({
	insertCustomerProducts: z.array(FullCusProductSchema),

	updateCustomerProduct: z.object({
		customerProduct: FullCusProductSchema,
		updates: z.object({
			status: z.enum(CusProductStatus),
		}),
	}),

	customPrices: z.array(PriceSchema), // Custom prices to insert
	customEntitlements: z.array(EntitlementSchema), // Custom entitlements to insert
	customFreeTrial: FreeTrialSchema.optional(), // Custom free trial to insert

	// expireCusProducts: z.array(z.string()),

	// updateCusProduct: z.object({
	// 	cusProductId: z.string(),
	// 	options: z.array(FeatureOptionsSchema),
	// }),
	// entitlementChanges: z.array(
	// 	z.object({ cusEntId: z.string(), delta: z.number() }),
	// ),
});

export const BillingPlanSchema = z.object({
	autumn: AutumnBillingPlanSchema,
	stripe: StripeBillingPlanSchema,
});

export type BillingPlan = z.infer<typeof BillingPlanSchema>;
export type AutumnBillingPlan = z.infer<typeof AutumnBillingPlanSchema>;
