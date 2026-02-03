import {
	type AttachConfig,
	AttachFunctionResponseSchema,
	BillingVersion,
	cusProductToProduct,
	InternalError,
	SuccessCode,
	secondsToMs,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/computeUpdateSubscriptionPlan.js";
import { setupUpdateSubscriptionTrialContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionTrialContext";
import { executeBillingPlan } from "@/internal/billing/v2/execute/executeBillingPlan.js";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan.js";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan.js";
import { logStripeBillingResult } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingResult.js";
import { fetchStripeSubscriptionForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeSubscriptionForBilling.js";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse.js";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import type { AttachParams } from "../../../cusProducts/AttachParams.js";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";

export const handleUpdateQuantityFunction = async ({
	ctx,
	attachParams,
	config,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
}) => {
	const { curSameProduct: currentCustomerProduct } = attachParamToCusProducts({
		attachParams,
	});

	const optionsToUpdate = attachParams.optionsToUpdate;

	if (!currentCustomerProduct)
		throw new InternalError({ message: "currentCustomerProduct not found" });

	if (!optionsToUpdate)
		throw new InternalError({ message: "optionsToUpdate not found" });

	const params: UpdateSubscriptionV0Params = {
		customer_id: attachParams.customer.id || attachParams.customer.internal_id,
		product_id: currentCustomerProduct.product.id,
		entity_id: attachParams.customer.entity?.id,
		options: optionsToUpdate.map((o) => o.new),
	};

	const stripeSubscription = await fetchStripeSubscriptionForBilling({
		ctx,
		fullCus: attachParams.customer,
		product: cusProductToProduct({ cusProduct: currentCustomerProduct }),
	});

	const fullProduct = cusProductToProduct({
		cusProduct: currentCustomerProduct,
	});

	const currentEpochMs = attachParams.now ?? Date.now();
	const billingCycleAnchorMs =
		secondsToMs(stripeSubscription?.billing_cycle_anchor) ?? "now";

	// 1. Setup trial context first
	const trialContext = setupUpdateSubscriptionTrialContext({
		stripeSubscription,
		customerProduct: currentCustomerProduct,
		currentEpochMs,
		params,
		fullProduct,
	});

	const billingContext: UpdateSubscriptionBillingContext = {
		billingVersion: BillingVersion.V1,
		fullCustomer: attachParams.customer,
		fullProducts: [fullProduct],
		customerProduct: currentCustomerProduct,
		featureQuantities: optionsToUpdate.map((o) => o.new),
		currentEpochMs: attachParams.now ?? Date.now(),
		billingCycleAnchorMs,
		resetCycleAnchorMs: billingCycleAnchorMs,
		stripeCustomer: attachParams.stripeCus!,
		stripeSubscription,
		trialContext,
		paymentMethod: attachParams.paymentMethod ?? undefined,
	};

	const autumnBillingPlan = await computeUpdateSubscriptionPlan({
		ctx,
		billingContext,
		params,
	});

	logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });

	// 4. Evaluate Stripe billing plan
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
	});

	logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

	const billingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlan,
	};

	// 5. Execute billing plan
	const billingResult = await executeBillingPlan({
		ctx,
		billingContext,
		billingPlan,
	});

	logStripeBillingResult({ ctx, result: billingResult.stripe });

	const response = billingResultToResponse({
		billingContext,
		billingResult,
	});

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.FeaturesUpdated,
		message: `Successfully updated quantity for features: ${optionsToUpdate.map((o) => o.new.feature_id).join(", ")}`,
		invoice:
			config.invoiceOnly && response.invoice ? response.invoice : undefined,
	});

	// // Update quantities
	// const optionsToUpdate = attachParams.optionsToUpdate!;
	// const { curSameProduct } = attachParamToCusProducts({ attachParams });

	// // Check balance of each option to update...?
	// const stripeCli = attachParams.stripeCli;
	// const cusProduct = curSameProduct!;
	// const stripeSubs = await getStripeSubs({
	// 	stripeCli: stripeCli,
	// 	subIds: cusProduct.subscription_ids || [],
	// });

	// const invoices: Stripe.Invoice[] = [];

	// for (const options of optionsToUpdate) {
	// 	const result = await handleUpdateFeatureQuantity({
	// 		ctx,
	// 		attachParams,
	// 		attachConfig: config,
	// 		cusProduct,
	// 		stripeSubs,
	// 		oldOptions: options.old,
	// 		newOptions: options.new,
	// 	});

	// 	if (result?.invoice) {
	// 		invoices.push(result.invoice);
	// 	}
	// }

	// for (const stripeSub of stripeSubs) {
	// 	if (isStripeSubscriptionCanceling(stripeSub)) {
	// 		await stripeCli.subscriptions.update(stripeSub.id, {
	// 			cancel_at: null,
	// 		});
	// 	}
	// }

	// await CusProductService.update({
	// 	db,
	// 	cusProductId: cusProduct.id,
	// 	updates: {
	// 		options: optionsToUpdate.map((o) => o.new),
	// 		canceled_at: null,
	// 		canceled: false,
	// 		ended_at: null,
	// 	},
	// });

	// return AttachFunctionResponseSchema.parse({
	// 	code: SuccessCode.FeaturesUpdated,
	// 	message: `Successfully updated quantity for features: ${optionsToUpdate.map((o) => o.new.feature_id).join(", ")}`,
	// 	invoice:
	// 		config.invoiceOnly && invoices.length > 0 ? invoices[0] : undefined,
	// });
};
