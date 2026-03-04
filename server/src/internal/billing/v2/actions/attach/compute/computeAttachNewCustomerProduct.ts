import type { AttachBillingContext, AttachParamsV1 } from "@autumn/shared";
import {
	CusProductStatus,
	deduplicateArray,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyCarryOverUsageFeatureIds } from "@/internal/billing/v2/utils/handleCarryOvers/carryOverUtils";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

/**
 * Creates the new FullCusProduct to insert when attaching a product.
 *
 * For upgrades (planTiming === "immediate"): creates an active product
 * For downgrades (planTiming === "end_of_cycle"): creates a scheduled product that starts at endOfCycleMs
 */
export const computeAttachNewCustomerProduct = ({
	ctx,
	attachBillingContext,
	params = {} as AttachParamsV1,
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
	params?: AttachParamsV1;
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
		billingVersion,
		transitionConfig,
		externalId,
	} = attachBillingContext;

	const currentCustomerEntitlements =
		currentCustomerProduct?.customer_entitlements ?? [];

	// LEGACY: carry_from_previous flag on entitlements
	const featuresToCarryUsagesFor = deduplicateArray(
		currentCustomerEntitlements
			.filter((ce) => {
				return ce.entitlement.carry_from_previous;
			})
			.map((ce) => ce.entitlement.feature.id),
	);

	// carry_over_usages param override — replaces legacy list with consumable feature ids if necessary
	const consumableFeatureIdsToCarry = applyCarryOverUsageFeatureIds({
		params,
		currentCustomerEntitlements,
		featuresToCarryUsagesFor,
	});

	// Determine if this is a scheduled product (downgrade)
	const isScheduled = planTiming === "end_of_cycle";

	const existingUsagesConfig =
		!isScheduled && currentCustomerProduct
			? {
					fromCustomerProduct: currentCustomerProduct,
					consumableFeatureIdsToCarry,
				}
			: undefined;

	const existingRolloversConfig =
		!isScheduled && currentCustomerProduct
			? {
					fromCustomerProduct: currentCustomerProduct,
				}
			: undefined;

	const newFullCustomerProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct: attachProduct,
			featureQuantities,
			// existingUsages: isScheduled ? undefined : existingUsages,
			// existingRollovers,
			resetCycleAnchor: resetCycleAnchorMs,
			now: currentEpochMs,
			freeTrial: trialContext?.freeTrial ?? null,
			trialEndsAt: trialContext?.trialEndsAt ?? undefined,
			billingVersion: billingVersion,

			existingUsagesConfig,
			existingRolloversConfig,
			transitionConfig,
		},
		initOptions: {
			isCustom,
			// subscriptionId: isScheduled ? undefined : stripeSubscription?.id,
			subscriptionId: stripeSubscription?.id,
			subscriptionScheduleId: stripeSubscriptionSchedule?.id,
			status: isScheduled ? CusProductStatus.Scheduled : undefined,
			startsAt: isScheduled ? endOfCycleMs : undefined,
			externalId,
		},
	});

	return newFullCustomerProduct;
};
