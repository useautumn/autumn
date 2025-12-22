import type { FullProduct, SubscriptionUpdateV0Params } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusProductToExistingRollovers } from "@/internal/billing/billingUtils/handleExistingRollovers/cusProductToExistingRollovers";
import { cusProductToExistingUsages } from "@/internal/billing/billingUtils/handleExistingUsages/cusProductToExistingUsages";
import { initFullCustomerProduct } from "@/internal/billing/billingUtils/initFullCusProduct/initFullCustomerProduct";
import { computeSubscriptionUpdateFeatureQuantities } from "@/internal/billing/v2/subscriptionUpdate/compute/computeSubscriptionUpdateCustomPlan/computeSubscriptionUpdateFeatureQuantities";
import type { UpdateSubscriptionContext } from "@/internal/billing/v2/subscriptionUpdate/fetch/updateSubscriptionContextSchema";

export const computeSubscriptionUpdateNewCustomerProduct = async ({
	ctx,
	subscriptionUpdateContext,
	params,
	fullProduct,
}: {
	ctx: AutumnContext;
	subscriptionUpdateContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
	fullProduct: FullProduct;
}) => {
	const {
		customerProduct,
		fullCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
	} = subscriptionUpdateContext;

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

	// 1. Compute the new full customer product
	const newFullCustomerProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			existingUsages,
			existingRollovers,
		},
		initOptions: {
			isCustom: true,
			// resetCycleAnchor,
			subscriptionId: stripeSubscription?.id,
			subscriptionScheduleId: stripeSubscriptionSchedule?.id,
		},
	});

	return newFullCustomerProduct;
};
