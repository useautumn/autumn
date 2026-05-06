import type { AttachBillingContext, AttachParamsV1 } from "@autumn/shared";
import {
	deduplicateArray,
	type ExistingUsagesConfig,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { carryOverUsagesToExistingUsagesConfig } from "@/internal/billing/v2/utils/handleCarryOvers/carryOverUtils";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";
import { applyAttachStartDates } from "./applyAttachStartDates";
import { getAttachStartTiming } from "./getAttachStartTiming";

const getScheduledBillingCycleAnchorResetAt = ({
	requestedBillingCycleAnchor,
	currentEpochMs,
}: {
	requestedBillingCycleAnchor?: number | "now";
	currentEpochMs: number;
}) => {
	if (
		typeof requestedBillingCycleAnchor === "number" &&
		requestedBillingCycleAnchor > currentEpochMs
	) {
		return requestedBillingCycleAnchor;
	}

	return null;
};

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
		stripeSubscription,
		stripeSubscriptionSchedule,
		currentEpochMs,
		featureQuantities,
		trialContext,
		isCustom,
		billingVersion,
		transitionConfig,
		externalId,
		requestedBillingCycleAnchor,
	} = attachBillingContext;

	const currentCustomerEntitlements =
		currentCustomerProduct?.customer_entitlements ?? [];
	const carryOverUsages = params.carry_over_usages;

	// LEGACY: carry_from_previous flag on entitlements
	const featuresToCarryUsagesFor = deduplicateArray(
		currentCustomerEntitlements
			.filter((ce) => {
				return ce.entitlement.carry_from_previous;
			})
			.map((ce) => ce.entitlement.feature.id),
	);

	const attachStartTiming = getAttachStartTiming({
		attachBillingContext,
		params,
	});
	const { billingAnchorStartsAt, resetCycleAnchor, status } = attachStartTiming;
	const isScheduled = planTiming === "end_of_cycle";

	let existingUsagesConfig: ExistingUsagesConfig | undefined =
		!isScheduled && currentCustomerProduct
			? {
					fromCustomerProduct: currentCustomerProduct,
					consumableFeatureIdsToCarry: featuresToCarryUsagesFor,
				}
			: undefined;

	const existingRolloversConfig =
		!isScheduled && currentCustomerProduct
			? {
					fromCustomerProduct: currentCustomerProduct,
				}
			: undefined;

	if (!isScheduled && currentCustomerProduct && carryOverUsages?.enabled) {
		existingUsagesConfig = carryOverUsagesToExistingUsagesConfig({
			ctx,
			params,
			currentCustomerProduct,
		});
	}

	const newFullCustomerProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct: attachProduct,
			featureQuantities,
			// existingUsages: isScheduled ? undefined : existingUsages,
			// existingRollovers,
			resetCycleAnchor,
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
			status,
			startsAt: billingAnchorStartsAt,
			externalId,
			billingCycleAnchorResetsAt: getScheduledBillingCycleAnchorResetAt({
				requestedBillingCycleAnchor,
				currentEpochMs,
			}),
		},
	});

	applyAttachStartDates({
		newFullCustomerProduct,
		attachBillingContext,
		attachStartTiming,
	});

	return newFullCustomerProduct;
};
