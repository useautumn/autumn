import { CustomLineItemSchema } from "@api/billing/common/customLineItem";
import type { SetupPaymentParamsV1 } from "@api/billing/setupPayment/setupPaymentParamsV1";
import type { InsertCustomerEntitlement } from "@autumn/shared";
import {
	type AppEnv,
	CusProductStatus,
	EntitlementSchema,
	EntityBalanceSchema,
	FeatureOptionsSchema,
	FreeTrialSchema,
	FullCusProductSchema,
	FullCustomerEntitlementSchema,
	type InsertInvoice,
	PriceSchema,
	ReplaceableSchema,
	SubscriptionSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { InsertReplaceable } from "../../cusProductModels/cusEntModels/replaceableTable";
import type { BillingContext } from "../context/billingContext";
import { LineItemSchema } from "../lineItem/lineItem";
import type { BillingPlan } from "./billingPlan";

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

	deletedReplaceables: z.array(ReplaceableSchema).optional(),
	insertReplaceables: z.array(z.custom<InsertReplaceable>()).optional(),
});

export const CustomerProductUpdateSchema = z.object({
	customerProduct: FullCusProductSchema,
	updates: z.object({
		options: z.array(FeatureOptionsSchema).optional(),
		status: z.enum(CusProductStatus).optional(),
		billing_cycle_anchor_resets_at: z.number().nullish(),
		// Cancel fields (nullish to support uncancel - setting to null)
		canceled: z.boolean().nullish(),
		canceled_at: z.number().nullish(),
		ended_at: z.number().nullish(),
		scheduled_ids: z.array(z.string()).optional(),
		subscription_ids: z.array(z.string()).optional(),
	}),
});

export const AutumnBillingPlanSchema = z.object({
	customerId: z.string(),
	insertCustomerProducts: z.array(FullCusProductSchema),

	updateCustomerProduct: CustomerProductUpdateSchema.optional(),
	updateCustomerProducts: z.array(CustomerProductUpdateSchema).optional(),

	updateByStripeScheduleId: z
		.object({
			oldScheduleId: z.string(),
			newScheduleId: z.string(),
		})
		.optional(),

	deleteCustomerProduct: FullCusProductSchema.optional(), // Scheduled product to delete (e.g., when updating while canceling)
	deleteCustomerProducts: z.array(FullCusProductSchema).optional(),

	customPrices: z.array(PriceSchema).optional(), // Custom prices to insert
	customEntitlements: z.array(EntitlementSchema).optional(), // Custom entitlements to insert
	customFreeTrial: FreeTrialSchema.optional(), // Custom free trial to insert

	lineItems: z.array(LineItemSchema).optional(),
	customLineItems: z.array(CustomLineItemSchema).optional(),

	insertCustomerEntitlements: z
		.array(z.custom<InsertCustomerEntitlement>())
		.optional(),
	updateCustomerEntitlements: z
		.array(UpdateCustomerEntitlementSchema)
		.optional(),

	/**
	 * Pre-computed auto top-up rebalance deltas. The compute step sizes paydown + prepaid
	 * remainder from the context's FullCustomer snapshot; the executor just loops these
	 * and applies each via adjustBalanceDbAndCache (atomic SQL balance + delta).
	 */
	autoTopupRebalance: z
		.object({
			deltas: z.array(
				z.object({
					cusEntId: z.string(),
					featureId: z.string(),
					delta: z.number(),
				}),
			),
		})
		.optional(),

	// Upsert operations (populated during webhook handling, e.g., checkout.session.completed)
	upsertSubscription: SubscriptionSchema.optional(),
	upsertInvoice: z.custom<InsertInvoice>().optional(),

	/** Refund plan computed by computeRefundPlan: the amount to refund and source invoice */
	refundPlan: z
		.object({
			amount: z.number(),
			invoice: z.object({
				stripe_id: z.string(),
				total: z.number(),
				current_refunded_amount: z.number(),
				currency: z.string(),
			}),
		})
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

export type DeferredSetupPaymentData = {
	requestId: string;
	orgId: string;
	env: AppEnv;
	params: SetupPaymentParamsV1;
};
