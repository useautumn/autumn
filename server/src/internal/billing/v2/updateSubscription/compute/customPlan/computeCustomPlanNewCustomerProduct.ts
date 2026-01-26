import type { FullCusProduct, FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import { computeCancelFields } from "@/internal/billing/v2/updateSubscription/compute/cancel/computeCancelFields";
import { cusProductToExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/cusProductToExistingRollovers";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";
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

	const existingUsages = cusProductToExistingUsages({
		cusProduct: customerProduct,
		entityId: fullCustomer.entity?.id,
	});

	const existingRollovers = cusProductToExistingRollovers({
		cusProduct: customerProduct,
	});

	ctx.logger.debug(
		`[computeNewCustomerProduct] existing usages:`,
		existingUsages,
	);

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
			existingUsages,
			existingRollovers,
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
