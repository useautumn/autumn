import {
	type AutumnBillingPlan,
	type LineItem,
	PooledBalanceResetOwnerType,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

import { computeCancelPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/cancel/computeCancelPlan";

import { computeCustomPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/customPlan/computeCustomPlan";
import { finalizeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/finalizeUpdateSubscriptionPlan";
import { computeManualTopUpPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/manualTopUp/computeManualTopUpPlan";
import { computeUpdateLicenseQuantityPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/updateLicenseQuantity/computeUpdateLicenseQuantityPlan";
import { computeUpdateQuantityPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/updateQuantity/computeUpdateQuantityPlan";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { addStripeSubscriptionIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionIdToBillingPlan";
import {
	computeFieldUpdatePooledBalanceOps,
	computeFieldUpdates,
} from "./computeFieldUpdates";

/**
 * Compute the subscription update plan
 */
export const computeUpdateSubscriptionPlan = async ({
	ctx,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	params: UpdateSubscriptionV1Params;
}): Promise<AutumnBillingPlan> => {
	const { intent } = billingContext;

	let plan: AutumnBillingPlan;
	switch (intent) {
		case UpdateSubscriptionIntent.ManualTopUp:
			plan = computeManualTopUpPlan({ ctx, billingContext, params });
			break;
		case UpdateSubscriptionIntent.UpdateQuantity:
			plan = computeUpdateQuantityPlan({
				ctx,
				updateSubscriptionContext: billingContext,
			});
			break;
		case UpdateSubscriptionIntent.UpdateLicenseQuantity:
			plan = computeUpdateLicenseQuantityPlan({
				ctx,
				updateSubscriptionContext: billingContext,
			});
			break;
		case UpdateSubscriptionIntent.UpdatePlan:
			plan = await computeCustomPlan({
				ctx,
				params,
				updateSubscriptionContext: billingContext,
			});
			break;
		case UpdateSubscriptionIntent.None:
		case UpdateSubscriptionIntent.CancelAction:
			plan = {
				customerId: billingContext.fullCustomer?.id ?? "",
				insertCustomerProducts: [],
				updateCustomerProduct: {
					customerProduct: billingContext.customerProduct,
					updates: {},
				},
				deleteCustomerProduct: undefined,
				customPrices: [],
				customEntitlements: [],
				customFreeTrial: undefined,
				lineItems: computeAnchorResetLineItems({ ctx, billingContext }),
				updateCustomerEntitlements: undefined,
			};

			break;
	}

	const fieldUpdates = computeFieldUpdates({ params });
	if (Object.keys(fieldUpdates).length > 0) {
		plan.updateCustomerProduct = {
			customerProduct: billingContext.customerProduct,
			updates: {
				...plan.updateCustomerProduct?.updates,
				...fieldUpdates,
			},
		};
	}
	if (
		!billingContext.cancelAction &&
		plan.insertCustomerProducts.length === 0
	) {
		plan.pooledBalanceOps = [
			...(plan.pooledBalanceOps ?? []),
			...computeFieldUpdatePooledBalanceOps({ billingContext, params }),
		];
	}
	const processorSubscriptionId = params.processor_subscription_id;
	if (processorSubscriptionId) {
		plan.pooledBalanceOps = plan.pooledBalanceOps?.map((operation) => {
			if (
				(operation.op !== "upsert_source" &&
					operation.op !== "transfer_source") ||
				operation.sourceCustomerProductId !==
					billingContext.customerProduct.id ||
				operation.resetOwnerType !== PooledBalanceResetOwnerType.Subscription
			) {
				return operation;
			}

			return { ...operation, resetOwnerId: processorSubscriptionId };
		});
	}

	// Apply cancel plan if cancelAction is set in context
	plan = computeCancelPlan({ ctx, billingContext, plan });

	plan = await finalizeUpdateSubscriptionPlan({
		ctx,
		plan,
		billingContext,
		params,
	});

	// When skipBillingChanges is true, Stripe is never called, so the post-Stripe
	// sub-id linkage in executeStripeSubscriptionAction never runs.
	const existingSubscriptionId =
		billingContext.customerProduct.subscription_ids?.[0];
	const subscriptionIdForPlan =
		params.processor_subscription_id !== undefined
			? (params.processor_subscription_id ?? undefined)
			: existingSubscriptionId;

	if (billingContext.skipBillingChanges && subscriptionIdForPlan) {
		addStripeSubscriptionIdToBillingPlan({
			autumnBillingPlan: plan,
			stripeSubscriptionId: subscriptionIdForPlan,
		});
	}

	return plan;
};

/** Computes refund + charge line items when billing cycle anchor is being reset. */
const computeAnchorResetLineItems = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
}): LineItem[] => {
	if (billingContext.requestedBillingCycleAnchor !== "now") return [];

	const { customerProduct } = billingContext;

	const { allLineItems } = buildAutumnLineItems({
		ctx,
		deletedCustomerProduct: customerProduct,
		newCustomerProducts: [customerProduct],
		billingContext,
	});

	return allLineItems;
};
