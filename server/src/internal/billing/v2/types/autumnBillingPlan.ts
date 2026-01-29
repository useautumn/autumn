import {
	type AppEnv,
	CusProductStatus,
	EntitlementSchema,
	EntityBalanceSchema,
	FeatureOptionsSchema,
	FreeTrialSchema,
	FullCusProductSchema,
	FullCustomerEntitlementSchema,
	LineItemSchema,
	PriceSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { BillingContext, BillingPlan } from "@/internal/billing/v2/types";

export const UpdateCustomerEntitlementSchema = z.object({
	customerEntitlement: FullCustomerEntitlementSchema,
	balanceChange: z.number().optional(),

	// For arrear billing:
	updates: z
		.object({
			next_reset_at: z.number().optional(),
			adjustment: z.number().optional(),
			entities: z.record(z.string(), EntityBalanceSchema).optional(),
			balance: z.number().optional(),
		})
		.optional(),
});

export const AutumnBillingPlanSchema = z.object({
	insertCustomerProducts: z.array(FullCusProductSchema),

	updateCustomerProduct: z
		.object({
			customerProduct: FullCusProductSchema,
			updates: z.object({
				options: z.array(FeatureOptionsSchema).optional(),
				status: z.enum(CusProductStatus).optional(),
				// Cancel fields (nullish to support uncancel - setting to null)
				canceled: z.boolean().nullish(),
				canceled_at: z.number().nullish(),
				ended_at: z.number().nullish(),

				scheduled_ids: z.array(z.string()).optional(),
			}),
		})
		.optional(),

	updateByStripeScheduleId: z
		.object({
			oldScheduleId: z.string(),
			newScheduleId: z.string(),
		})
		.optional(),

	deleteCustomerProduct: FullCusProductSchema.optional(), // Scheduled product to delete (e.g., when updating while canceling)

	customPrices: z.array(PriceSchema).optional(), // Custom prices to insert
	customEntitlements: z.array(EntitlementSchema).optional(), // Custom entitlements to insert
	customFreeTrial: FreeTrialSchema.optional(), // Custom free trial to insert

	lineItems: z.array(LineItemSchema).optional(),

	updateCustomerEntitlements: z
		.array(UpdateCustomerEntitlementSchema)
		.optional(),
});

export type AutumnBillingPlan = z.infer<typeof AutumnBillingPlanSchema>;

export type UpdateCustomerEntitlement = z.infer<
	typeof UpdateCustomerEntitlementSchema
>;

export enum StripeBillingStage {
	InvoiceAction = "invoice_action",
	SubscriptionAction = "subscription_action",
}

export type DeferredAutumnBillingPlanData = {
	requestId: string;
	orgId: string;
	env: AppEnv;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
	resumeAfter?: StripeBillingStage;
};
