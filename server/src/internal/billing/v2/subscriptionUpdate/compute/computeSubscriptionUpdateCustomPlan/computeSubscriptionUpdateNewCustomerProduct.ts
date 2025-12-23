import type { FullProduct, SubscriptionUpdateV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { FreeTrialPlan } from "@/internal/billing/v2/billingPlan";
import { computeSubscriptionUpdateFeatureQuantities } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateFeatureQuantities";
import type { UpdateSubscriptionContext } from "@/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";
import { cusProductToExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/cusProductToExistingRollovers";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

export const computeSubscriptionUpdateNewCustomerProduct = ({
	ctx,
	params,
	updateSubscriptionContext,
	fullProduct,
	freeTrialPlan,
	billingCycleAnchor,
}: {
	ctx: AutumnContext;
	params: SubscriptionUpdateV0Params;
	updateSubscriptionContext: UpdateSubscriptionContext;
	fullProduct: FullProduct;
	freeTrialPlan: FreeTrialPlan;
	billingCycleAnchor?: number;
}) => {
	const {
		customerProduct,
		fullCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
	} = updateSubscriptionContext;

	// 1. Get feature quantities
	const existingUsages = cusProductToExistingUsages({
		cusProduct: customerProduct,
		entityId: fullCustomer.entity?.id,
	});

	const existingRollovers = cusProductToExistingRollovers({
		cusProduct: customerProduct,
	});

	const featureQuantities = computeSubscriptionUpdateFeatureQuantities({
		ctx,
		fullProduct,
		currentCustomerProduct: customerProduct,
		params,
	});

	const now = updateSubscriptionContext.testClockFrozenTime ?? Date.now();

	// 1. Compute the new full customer product
	const newFullCustomerProduct = initFullCustomerProduct({
		ctx,

		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			existingUsages,
			existingRollovers,
			resetCycleAnchor: billingCycleAnchor ?? "now",
			now,

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
