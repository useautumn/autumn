import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import type { FreeTrialPlan } from "@/internal/billing/v2/types/billingPlan";
import { cusProductToExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/cusProductToExistingRollovers";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

export const computeCustomPlanNewCustomerProduct = ({
	ctx,
	updateSubscriptionContext,
	fullProduct,
	freeTrialPlan,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionBillingContext;
	fullProduct: FullProduct;
	freeTrialPlan: FreeTrialPlan;
}) => {
	const {
		customerProduct,
		fullCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
		billingCycleAnchorMs,
		currentEpochMs,
		featureQuantities,
	} = updateSubscriptionContext;

	const existingUsages = cusProductToExistingUsages({
		cusProduct: customerProduct,
		entityId: fullCustomer.entity?.id,
	});

	const existingRollovers = cusProductToExistingRollovers({
		cusProduct: customerProduct,
	});

	// Compute the new full customer product
	const newFullCustomerProduct = initFullCustomerProduct({
		ctx,

		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			existingUsages,
			existingRollovers,
			resetCycleAnchor: billingCycleAnchorMs ?? "now",
			now: currentEpochMs,

			freeTrial: freeTrialPlan.freeTrial ?? null,
			trialEndsAt: freeTrialPlan.trialEndsAt,
		},

		initOptions: {
			isCustom: true,
			subscriptionId: stripeSubscription?.id,
			subscriptionScheduleId: stripeSubscriptionSchedule?.id,
		},
	});

	return newFullCustomerProduct;
};
