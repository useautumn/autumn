import type {
	FullCusProduct,
	FullProduct,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeCancelFields } from "@/internal/billing/v2/actions/updateSubscription/compute/cancel/computeCancelFields";
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
		billingVersion,
	} = updateSubscriptionContext;

	const cancelFields = computeCancelFields({
		cancelAction,
		currentCustomerProduct,
	});

	// const existingUsages = cusProductToExistingUsages({
	// 	cusProduct: customerProduct,
	// 	entityId: fullCustomer.entity?.id,
	// });

	// const existingRollovers = cusProductToExistingRollovers({
	// 	cusProduct: customerProduct,
	// });

	// Compute the new full customer product
	const newFullCustomerProduct = initFullCustomerProduct({
		ctx,

		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			// existingUsages,
			// existingRollovers,
			resetCycleAnchor: resetCycleAnchorMs,
			now: currentEpochMs,

			freeTrial: trialContext?.freeTrial ?? null,
			trialEndsAt: trialContext?.trialEndsAt ?? undefined,
			billingVersion: billingVersion,

			existingUsagesConfig: {
				fromCustomerProduct: customerProduct,
				carryAllConsumableFeatures: true,
			},

			existingRolloversConfig: {
				fromCustomerProduct: customerProduct,
			},
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
