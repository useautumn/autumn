import type { FullCusProduct, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import { computeCancelFields } from "@/internal/billing/v2/updateSubscription/compute/cancel/computeCancelFields";

import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

export const computeCustomPlanNewCustomerProduct = ({
	ctx,
	updateSubscriptionContext,
	fullProduct,
	currentCustomerProduct,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	fullProduct: FullProduct;
	currentCustomerProduct: FullCusProduct;
}) => {
	const {
		customerProduct,
		fullCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
		resetCycleAnchorMs,
		currentEpochMs,
		featureQuantities,
		trialContext,
		cancelAction,
	} = updateSubscriptionContext;

	const cancelFields = computeCancelFields({
		cancelAction,
		currentCustomerProduct,
	});

	// Compute the new full customer product
	const newFullCustomerProduct = initFullCustomerProduct({
		ctx,

		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			existingUsagesConfig: {
				fromCustomerProduct: customerProduct,
				carryAllConsumableFeatures: true,
			},

			existingRolloversConfig: {
				fromCustomerProduct: customerProduct,
			},
			resetCycleAnchor: resetCycleAnchorMs,
			now: currentEpochMs,

			freeTrial: trialContext?.freeTrial ?? null,
			trialEndsAt: trialContext?.trialEndsAt ?? undefined,
		},

		initOptions: {
			isCustom: updateSubscriptionContext.isCustom,
			subscriptionId: stripeSubscription?.id, // don't populate if it's starting in the future.
			subscriptionScheduleId: stripeSubscriptionSchedule?.id,
			startsAt: currentCustomerProduct.starts_at ?? undefined,
			...cancelFields,
		},
	});

	return newFullCustomerProduct;
};
