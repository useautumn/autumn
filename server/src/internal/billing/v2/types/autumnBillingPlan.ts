import {
	type AppEnv,
	EntitlementSchema,
	FreeTrialSchema,
	LineItemSchema,
	PriceSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";
import { FullCusProductSchema } from "../../../../../../shared/models/cusProductModels/cusProductModels";

export const FreeTrialPlanSchema = z.object({
	freeTrial: FreeTrialSchema.nullable().optional(),
	trialEndsAt: z.number().optional(),
});

export type FreeTrialPlan = z.infer<typeof FreeTrialPlanSchema>;

export const UpdateCustomerEntitlementSchema = z.object({
	customerEntitlementId: z.string(),
	balanceChange: z.number(),
});

export const AutumnBillingPlanSchema = z.object({
	freeTrialPlan: FreeTrialPlanSchema.optional(),

	insertCustomerProducts: z.array(FullCusProductSchema),

	updateCustomerProduct: FullCusProductSchema.optional(),

	customPrices: z.array(PriceSchema), // Custom prices to insert
	customEntitlements: z.array(EntitlementSchema), // Custom entitlements to insert
	customFreeTrial: FreeTrialSchema.optional(), // Custom free trial to insert

	lineItems: z.array(LineItemSchema),

	updateCustomerEntitlements: z
		.array(UpdateCustomerEntitlementSchema)
		.optional(),
});

export type AutumnBillingPlan = z.infer<typeof AutumnBillingPlanSchema>;

export type DeferredAutumnBillingPlanData = {
	orgId: string;
	env: AppEnv;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
};
