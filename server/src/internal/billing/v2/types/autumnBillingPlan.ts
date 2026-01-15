import {
	type AppEnv,
	CusProductStatus,
	EntitlementSchema,
	FeatureOptionsSchema,
	FreeTrialSchema,
	FullCusProductSchema,
	FullCustomerEntitlementSchema,
	LineItemSchema,
	PriceSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";

export const UpdateCustomerEntitlementSchema = z.object({
	customerEntitlement: FullCustomerEntitlementSchema,
	balanceChange: z.number(),
});

export const AutumnBillingPlanSchema = z.object({
	insertCustomerProducts: z.array(FullCusProductSchema),

	updateCustomerProduct: z.object({
		customerProduct: FullCusProductSchema,
		updates: z.object({
			options: z.array(FeatureOptionsSchema).optional(),
			status: z.enum(CusProductStatus).optional(),
		}),
	}),
	deleteCustomerProduct: FullCusProductSchema.optional(), // Scheduled product to delete (e.g., when updating while canceling)

	customPrices: z.array(PriceSchema), // Custom prices to insert
	customEntitlements: z.array(EntitlementSchema), // Custom entitlements to insert
	customFreeTrial: FreeTrialSchema.optional(), // Custom free trial to insert

	lineItems: z.array(LineItemSchema),

	updateCustomerEntitlements: z
		.array(UpdateCustomerEntitlementSchema)
		.optional(),
});

export type AutumnBillingPlan = z.infer<typeof AutumnBillingPlanSchema>;

export enum StripeBillingStage {
	InvoiceAction = "invoice_action",
	SubscriptionAction = "subscription_action",
}

export type DeferredAutumnBillingPlanData = {
	orgId: string;
	env: AppEnv;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
	resumeAfter: StripeBillingStage;
};
