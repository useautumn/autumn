import type { AttachBillingContext, AttachParamsV1 } from "@autumn/shared";
import {
	CusProductStatus,
	deduplicateArray,
	type ExistingUsagesConfig,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { carryOverUsagesToExistingUsagesConfig } from "@/internal/billing/v2/utils/handleCarryOvers/carryOverUtils";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

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

const getStartsAt = ({
	startDate,
	isScheduled,
	endOfCycleMs,
}: {
	startDate?: number;
	isScheduled: boolean;
	endOfCycleMs?: number;
}) => {
	if (startDate) return startDate;
	if (isScheduled) return endOfCycleMs;
	return undefined;
};

const getResetCycleAnchor = ({
	startDate,
	resetCycleAnchorMs,
}: {
	startDate?: number;
	resetCycleAnchorMs: number | "now";
}) => {
	if (resetCycleAnchorMs !== "now") return resetCycleAnchorMs;
	return startDate ?? resetCycleAnchorMs;
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

	const isScheduled = planTiming === "end_of_cycle";
	const startsAt = getStartsAt({
		startDate: params.start_date,
		isScheduled,
		endOfCycleMs,
	});
	const resetCycleAnchor = getResetCycleAnchor({
		startDate: params.start_date,
		resetCycleAnchorMs,
	});

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
			status: isScheduled ? CusProductStatus.Scheduled : undefined,
			startsAt,
			externalId,
			billingCycleAnchorResetsAt: getScheduledBillingCycleAnchorResetAt({
				requestedBillingCycleAnchor,
				currentEpochMs,
			}),
		},
	});

	return newFullCustomerProduct;
};
