import {
	type AppEnv,
	EntitlementSchema,
	FreeTrialSchema,
	LineItemSchema,
	PriceSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { FullCusProductSchema } from "../../../../../../shared/models/cusProductModels/cusProductModels";

export const FreeTrialPlanSchema = z.object({
	freeTrial: FreeTrialSchema.nullable().optional(),
	trialEndsAt: z.number().optional(),
});

export type FreeTrialPlan = z.infer<typeof FreeTrialPlanSchema>;

export const InvoiceModeSchema = z.object({
	finalizeInvoice: z.boolean().default(false),
	enableProductImmediately: z.boolean().default(true),
});

export type InvoiceMode = z.infer<typeof InvoiceModeSchema>;

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

	autumnLineItems: z.array(LineItemSchema),

	updateCustomerEntitlements: z
		.array(UpdateCustomerEntitlementSchema)
		.optional(),
});

export type AutumnBillingPlan = z.infer<typeof AutumnBillingPlanSchema>;

export type DeferredAutumnBillingPlanData = {
	orgId: string;
	env: AppEnv;
	autumnBillingPlan: AutumnBillingPlan;
};
