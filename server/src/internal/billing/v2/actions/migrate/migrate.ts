import {
	type AttachBillingContext,
	type BillingPlan,
	type BillingResult,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	featureUtils,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { TransitionRules } from "@shared/api/billing/common/transitionRules";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";

export interface AttachResult {
	billingContext: AttachBillingContext;
	billingPlan?: BillingPlan;
	billingResult?: BillingResult | null;
	checkoutUrl?: string;
}

export async function migrate({
	ctx,
	fullCustomer,
	currentCustomerProduct,
	newProduct,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	currentCustomerProduct: FullCusProduct;
	newProduct: FullProduct;
}) {
	// 1. Build update subscription params
	const entity = fullCustomer.entities.find(
		(e) => e.internal_id === currentCustomerProduct.internal_entity_id,
	);

	const features = newProduct.entitlements.map((e) => e.feature);

	// Reset all features after trial ends
	const transitionRules: TransitionRules = {
		reset_after_trial_end: features
			.filter((f) => !featureUtils.isAllocated(f))
			.map((f) => f.id),
	};

	const updateSubscriptionParams: UpdateSubscriptionV1Params = {
		customer_id: fullCustomer.id || fullCustomer.internal_id,
		customer_product_id: currentCustomerProduct.id,
		entity_id: entity?.id,

		billing_behavior: "next_cycle_only",
		version: newProduct.version, // to trigger update custom plan intent

		transition_rules: transitionRules,
	};

	ctx.logger.info(
		`----- RUNNING MIGRATION FOR CUSTOMER ${fullCustomer.id}, ENTITY ${entity?.id} -----`,
	);
	await billingActions.updateSubscription({
		ctx,
		params: updateSubscriptionParams,
		contextOverride: {
			productContext: {
				customerProduct: currentCustomerProduct,
				fullProduct: newProduct,

				customPrices: [],
				customEnts: [],
			},

			billingVersion: currentCustomerProduct.billing_version,
		},
	});

	ctx.logger.info(
		`migration summary for ${fullCustomer.id}, entity ${entity?.id}`,
		{
			data2: ctx.extraLogs,
		},
	);

	ctx.extraLogs = {};
}
