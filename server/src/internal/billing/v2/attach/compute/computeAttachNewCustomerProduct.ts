import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { cusProductToExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/cusProductToExistingRollovers";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import type { AttachBillingContext } from "../types/attachBillingContext";

/**
 * Creates the new FullCusProduct to insert when attaching a product.
 *
 * For upgrades (planTiming === "immediate"): creates an active product
 * For downgrades (planTiming === "end_of_cycle"): creates a scheduled product that starts at endOfCycleMs
 */
export const computeAttachNewCustomerProduct = ({
	ctx,
	attachBillingContext,
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
}): FullCusProduct => {
	const {
		attachProduct,
		fullCustomer,
		currentCustomerProduct,
		planTiming,
		endOfCycleMs,
		stripeSubscription,
		stripeSubscriptionSchedule,
		resetCycleAnchorMs,
		currentEpochMs,
		featureQuantities,
		trialContext,
		isCustom,
	} = attachBillingContext;

	// Get existing usages/rollovers if transitioning from an existing product
	const existingUsages = cusProductToExistingUsages({
		cusProduct: currentCustomerProduct,
		entityId: fullCustomer.entity?.id,
	});

	const existingRollovers = cusProductToExistingRollovers({
		cusProduct: currentCustomerProduct,
	});

	ctx.logger.debug(
		`[computeAttachNewCustomerProduct] existing usages:`,
		existingUsages,
	);

	// Determine if this is a scheduled product (downgrade)
	const isScheduled = planTiming === "end_of_cycle";

	const newFullCustomerProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct: attachProduct,
			featureQuantities,
			existingUsages,
			existingRollovers,
			resetCycleAnchor: resetCycleAnchorMs,
			now: currentEpochMs,
			freeTrial: trialContext?.freeTrial ?? null,
			trialEndsAt: trialContext?.trialEndsAt ?? undefined,
		},
		initOptions: {
			isCustom,
			subscriptionId: isScheduled ? undefined : stripeSubscription?.id,
			subscriptionScheduleId: stripeSubscriptionSchedule?.id,
			status: isScheduled ? CusProductStatus.Scheduled : undefined,
			startsAt: isScheduled ? endOfCycleMs : undefined,
		},
	});

	return newFullCustomerProduct;
};
