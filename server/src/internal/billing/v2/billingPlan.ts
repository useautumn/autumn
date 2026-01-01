import {
	type AppEnv,
	EntitlementSchema,
	FreeTrialSchema,
	LineItemSchema,
	PriceSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { FullCusProductSchema } from "../../../../../shared/models/cusProductModels/cusProductModels";
import { QuantityUpdateDetailsSchema } from "./typesOld";

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
		type: z.literal("cancel_immediately"),
		stripeSubscriptionId: z.string(),
	}),
	z.object({
		type: z.literal("cancel_at_period_end"),
		stripeSubscriptionId: z.string(),
	}),
	z.object({
		type: z.literal("cancel"),
		stripeSubscriptionId: z.string(),
	}),
	z.object({
		type: z.literal("none"),
	}),
]);

export const StripeSubscriptionScheduleActionSchema = z.discriminatedUnion(
	"type",
	[
		z.object({
			type: z.literal("create"),
			params:
				z.custom<import("stripe").Stripe.SubscriptionScheduleUpdateParams>(),
		}),
		z.object({
			type: z.literal("update"),
			stripeSubscriptionScheduleId: z.string(),
			params:
				z.custom<import("stripe").Stripe.SubscriptionScheduleUpdateParams>(),
		}),
	],
);

export const InvoiceModeSchema = z.object({
	finalizeInvoice: z.boolean().default(false),
	enableProductImmediately: z.boolean().default(true),
});

export type InvoiceMode = z.infer<typeof InvoiceModeSchema>;

export const StripeInvoiceActionSchema = z.object({
	addLineParams: z.custom<import("stripe").Stripe.InvoiceAddLinesParams>(),
	invoiceMode: InvoiceModeSchema.optional(),
});

export type StripeSubscriptionScheduleAction = z.infer<
	typeof StripeSubscriptionScheduleActionSchema
>;

export type StripeSubscriptionAction = z.infer<
	typeof StripeSubscriptionActionSchema
>;

export type StripeInvoiceAction = z.infer<typeof StripeInvoiceActionSchema>;

export const StripeBillingPlanSchema = z.object({
	subscriptionAction: StripeSubscriptionActionSchema.optional(),
	subscriptionScheduleAction: StripeSubscriptionScheduleActionSchema.optional(),
	invoiceAction: StripeInvoiceActionSchema.optional(),
});

export const AutumnBillingPlanSchema = z.object({
	freeTrialPlan: FreeTrialPlanSchema.optional(),

	insertCustomerProducts: z.array(FullCusProductSchema),

	updateCustomerProduct: FullCusProductSchema.optional(),

	customPrices: z.array(PriceSchema), // Custom prices to insert
	customEntitlements: z.array(EntitlementSchema), // Custom entitlements to insert
	customFreeTrial: FreeTrialSchema.optional(), // Custom free trial to insert

	autumnLineItems: z.array(LineItemSchema),
	quantityUpdateDetails: z.array(QuantityUpdateDetailsSchema).optional(),
	shouldUncancelSubscription: z.boolean().optional(),
});

export const BillingPlanSchema = z.object({
	autumn: AutumnBillingPlanSchema,
	stripe: StripeBillingPlanSchema,
});

export type BillingPlan = z.infer<typeof BillingPlanSchema>;
export type AutumnBillingPlan = z.infer<typeof AutumnBillingPlanSchema>;
export type StripeBillingPlan = z.infer<typeof StripeBillingPlanSchema>;

export type StripeInvoiceMetadata = {
	autumn_metadata_id: string;
};

export type DeferredAutumnBillingPlanData = {
	orgId: string;
	env: AppEnv;
	autumnBillingPlan: AutumnBillingPlan;
};
