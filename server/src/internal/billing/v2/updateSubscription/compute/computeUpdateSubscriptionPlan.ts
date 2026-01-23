import type { UpdateSubscriptionV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan";

import { computeCancelPlan } from "@/internal/billing/v2/updateSubscription/compute/cancel/computeCancelPlan";

import {
	computeUpdateSubscriptionIntent,
	UpdateSubscriptionIntent,
} from "@/internal/billing/v2/updateSubscription/compute/computeUpdateSubscriptionIntent";
import { computeCustomPlan } from "@/internal/billing/v2/updateSubscription/compute/customPlan/computeCustomPlan";
import { finalizeUpdateSubscriptionPlan } from "@/internal/billing/v2/updateSubscription/compute/finalizeUpdateSubscriptionPlan";
import { computeUpdateQuantityPlan } from "@/internal/billing/v2/updateSubscription/compute/updateQuantity/computeUpdateQuantityPlan";

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
	params: UpdateSubscriptionV0Params;
}): Promise<AutumnBillingPlan> => {
	const intent = computeUpdateSubscriptionIntent(params);

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
				updateSubscriptionContext: billingContext,
				params,
			});
			break;
		case UpdateSubscriptionIntent.None:
			plan = {
				insertCustomerProducts: [],
				updateCustomerProduct: {
					customerProduct: billingContext.customerProduct,
					updates: {},
				},
				deleteCustomerProduct: undefined,
				customPrices: [],
				customEntitlements: [],
				customFreeTrial: undefined,
				lineItems: [],
				updateCustomerEntitlements: undefined,
			};
			break;
	}

	// Apply cancel plan if cancelMode is set in context
	plan = computeCancelPlan({ ctx, billingContext, plan });

	plan = finalizeUpdateSubscriptionPlan({
		ctx,
		plan,
		billingContext,
		params,
	});

	return plan;
};
