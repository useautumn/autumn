import {
	type AttachBillingContext,
	type BillingPlan,
	type BillingResult,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	featureUtils,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import type { FeatureOptionsParamsV0 } from "@shared/api/billing/common/featureOptions/featureOptionsParamsV0";
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

	// Always reset after trial end for non-allocated features
	const options: FeatureOptionsParamsV0[] = features
		.filter((f) => !featureUtils.isAllocated(f))
		.map((f) => ({
			feature_id: f.id,
			reset_after_trial_end: true,
		}));

	const updateSubscriptionParams: UpdateSubscriptionV0Params = {
		customer_id: fullCustomer.id || fullCustomer.internal_id,
		customer_product_id: currentCustomerProduct.id,
		entity_id: entity?.id,

		options,

		billing_behavior: "next_cycle_only",
		version: newProduct.version, // to trigger update custom plan intent
	};

	ctx.logger.info(
		`----- RUNNING MIGRATION FOR CUSTOMER ${fullCustomer.id}, ENTITY ${entity?.id} -----`,
	);
	await billingActions.updateSubscription({
		ctx,
		params: updateSubscriptionParams,
		contextOverrides: {
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
