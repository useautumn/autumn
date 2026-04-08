import {
	type AutumnBillingPlan,
	type LineItem,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

import { computeCancelPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/cancel/computeCancelPlan";

import { computeCustomPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/customPlan/computeCustomPlan";
import { finalizeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/finalizeUpdateSubscriptionPlan";
import { computeUpdateQuantityPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/updateQuantity/computeUpdateQuantityPlan";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { computeFieldUpdates } from "./computeFieldUpdates";

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
		case UpdateSubscriptionIntent.UpdateQuantity:
			plan = computeUpdateQuantityPlan({
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

	// Apply cancel plan if cancelAction is set in context
	plan = computeCancelPlan({ ctx, billingContext, plan });

	plan = finalizeUpdateSubscriptionPlan({
		ctx,
		plan,
		billingContext,
		params,
	});

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
