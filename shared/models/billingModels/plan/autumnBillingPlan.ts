import { CustomLineItemSchema } from "@api/billing/common/customLineItem";
import type { SetupPaymentParamsV1 } from "@api/billing/setupPayment/setupPaymentParamsV1";
import type { InsertCustomerEntitlement } from "@autumn/shared";
import {
	type AppEnv,
	BillingVersion,
	CusProductStatus,
	EntitlementSchema,
	EntityBalanceSchema,
	EntitySchema,
	FeatureOptionsSchema,
	FreeTrialSchema,
	FullCusProductSchema,
	FullCustomerEntitlementSchema,
	FullCustomerPriceSchema,
	type InsertInvoice,
	PriceSchema,
	ReplaceableSchema,
	RolloverConfigSchema,
	SubscriptionSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import type { InsertReplaceable } from "../../cusProductModels/cusEntModels/replaceableTable";
import { PooledBalanceResetOwnerType } from "../../pooledBalanceModels/pooledBalanceTable.js";
import { EntInterval } from "../../productModels/intervals/entitlementInterval.js";
import type { BillingContext } from "../context/billingContext";
import { LineItemSchema } from "../lineItem/lineItem";
import type { BillingPlan } from "./billingPlan";
import {
	CustomerLicenseTransitionSchema,
	CustomerLicenseUpdateSchema,
	InsertPlanLicenseSpecSchema,
} from "./customerLicensePlan";

export const UpdateCustomerEntitlementSchema = z.object({
	customerEntitlement: FullCustomerEntitlementSchema,
	balanceChange: z.number().optional(),

	// For arrear billing:
	updates: z
		.object({
			next_reset_at: z.number().optional(),
			reset_cycle_anchor: z.number().nullable().optional(),
			adjustment: z.number().optional(),
			additional_balance: z.number().optional(),
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
		// License seat release/reuse: entity unlink + pool-return timestamp.
		internal_entity_id: z.string().nullish(),
		entity_id: z.string().nullish(),
		released_at: z.number().nullish(),
		billing_cycle_anchor: z.number().nullish(),
		billing_cycle_anchor_resets_at: z.number().nullish(),
		free_trial_id: z.string().nullish(),
		trial_ends_at: z.number().nullish(),
		// Cancel fields (nullish to support uncancel - setting to null)
		canceled: z.boolean().nullish(),
		canceled_at: z.number().nullish(),
		ended_at: z.number().nullish(),
		scheduled_ids: z.array(z.string()).optional(),
		subscription_ids: z.array(z.string()).optional(),
		updated_at: z.number().optional(),
		billing_version: z.enum(BillingVersion).optional(),
		is_custom: z.boolean().optional(),
	}),
});

export const PatchCustomerProductSchema = z.object({
	customerProduct: FullCusProductSchema,
	insertCustomerEntitlements: z.array(FullCustomerEntitlementSchema),
	insertCustomerPrices: z.array(FullCustomerPriceSchema),
	deleteCustomerEntitlements: z.array(FullCustomerEntitlementSchema),
	deleteCustomerPrices: z.array(FullCustomerPriceSchema),
});

const PooledBalanceSourceSchema = z.object({
	internalCustomerId: z.string(),
	sourceCustomerProductId: z.string(),
});

export const UpsertPooledBalanceSourceOpSchema =
	PooledBalanceSourceSchema.extend({
		op: z.literal("upsert_source"),
		featureId: z.string(),
		internalFeatureId: z.string(),
		interval: z.nativeEnum(EntInterval),
		intervalCount: z.number().int().positive(),
		resetCycleAnchor: z.number().nullable(),
		nextResetAt: z.number().nullable(),
		rollover: RolloverConfigSchema.nullish().default(null),
		resetOwnerType: z.enum(PooledBalanceResetOwnerType),
		resetOwnerId: z.string(),
		priceId: z.string().nullable(),
		sourceEntitlementId: z.string(),
		currentCycleContribution: z.number().nonnegative(),
		nextCycleContribution: z.number().nonnegative(),
		usageReapply: z
			.object({
				amount: z.number().positive(),
				excludedSourceCustomerProductId: z.string(),
			})
			.optional(),
	});

export const RemovePooledBalanceSourceOpSchema =
	PooledBalanceSourceSchema.extend({
		op: z.literal("remove_source"),
		effectiveAt: z.number().nullable(),
	});

export const RemovePooledBalanceContributionOpSchema =
	PooledBalanceSourceSchema.extend({
		op: z.literal("remove_contribution"),
		sourceEntitlementId: z.string(),
		effectiveAt: z.number().nullable(),
	});

export const RestorePooledBalanceSourceOpSchema =
	PooledBalanceSourceSchema.extend({
		op: z.literal("restore_source"),
		expectedEffectiveAt: z.number(),
	});

const PooledBalanceOwnerSchema = z.object({
	internalCustomerId: z.string(),
	resetOwnerType: z.enum(PooledBalanceResetOwnerType),
	resetOwnerId: z.string(),
});

export const StagePooledBalanceOwnerRemovalOpSchema =
	PooledBalanceOwnerSchema.extend({
		op: z.literal("stage_owner_removal"),
		effectiveAt: z.number(),
	});

export const RestorePooledBalanceOwnerOpSchema =
	PooledBalanceOwnerSchema.extend({
		op: z.literal("restore_owner"),
		expectedEffectiveAt: z.number(),
	});

export const TransferPooledBalanceSourceOpSchema =
	UpsertPooledBalanceSourceOpSchema.omit({
		op: true,
		usageReapply: true,
	}).extend({
		op: z.literal("transfer_source"),
		contributionId: z.string(),
		expectedPooledBalanceId: z.string(),
	});

export const PooledBalanceOpSchema = z.discriminatedUnion("op", [
	UpsertPooledBalanceSourceOpSchema,
	RemovePooledBalanceSourceOpSchema,
	RemovePooledBalanceContributionOpSchema,
	RestorePooledBalanceSourceOpSchema,
	StagePooledBalanceOwnerRemovalOpSchema,
	RestorePooledBalanceOwnerOpSchema,
	TransferPooledBalanceSourceOpSchema,
]);
export type PooledBalanceOp = z.infer<typeof PooledBalanceOpSchema>;

export const AutumnBillingPlanSchema = z.object({
	customerId: z.string(),
	// Inserted before customer products — provisioned rows may reference them.
	insertEntities: z.array(EntitySchema).optional(),
	insertCustomerProducts: z.array(FullCusProductSchema),

	updateCustomerProduct: CustomerProductUpdateSchema.optional(),
	updateCustomerProducts: z.array(CustomerProductUpdateSchema).optional(),

	updateByStripeScheduleId: z
		.object({
			oldScheduleId: z.string(),
			newScheduleId: z.string(),
		})
		.optional(),

	schedulePhaseCustomerProductReplacements: z
		.array(
			z.object({
				oldCustomerProductId: z.string(),
				newCustomerProductId: z.string(),
				internalCustomerId: z.string(),
				internalEntityId: z.string().nullish(),
			}),
		)
		.optional(),

	deleteCustomerProduct: FullCusProductSchema.optional(), // Scheduled product to delete (e.g., when updating while canceling)
	deleteCustomerProducts: z.array(FullCusProductSchema).optional(),

	customPrices: z.array(PriceSchema).optional(), // Custom prices to insert
	customEntitlements: z.array(EntitlementSchema).optional(), // Custom entitlements to insert
	customFreeTrial: FreeTrialSchema.optional(), // Custom free trial to insert
	insertPlanLicenses: z.array(InsertPlanLicenseSpecSchema).optional(),
	customerLicenseUpdates: z.array(CustomerLicenseUpdateSchema).optional(),
	customerLicenseTransitions: z
		.array(CustomerLicenseTransitionSchema)
		.optional(),
	pooledBalanceOps: z.array(PooledBalanceOpSchema).optional(),

	lineItems: z.array(LineItemSchema).optional(),
	customLineItems: z.array(CustomLineItemSchema).optional(),

	insertCustomerEntitlements: z
		.array(z.custom<InsertCustomerEntitlement>())
		.optional(),
	patchCustomerProducts: z.array(PatchCustomerProductSchema).optional(),
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

	oneOffPurchaseRebalance: z
		.object({
			purchases: z.array(
				z.object({
					customerEntitlementId: z.string(),
					featureId: z.string(),
					quantity: z.number(),
				}),
			),
		})
		.optional(),

	// Lock the customer to a currency on the first paid attach (only set when the
	// customer has none yet). Applied as a conditional, race-safe DB update.
	lockCustomerCurrency: z
		.object({
			internalCustomerId: z.string(),
			currency: z.string(),
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
export type CustomerProductUpdate = z.infer<typeof CustomerProductUpdateSchema>;

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
