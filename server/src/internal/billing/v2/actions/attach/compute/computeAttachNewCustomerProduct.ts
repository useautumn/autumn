import type { AttachBillingContext, AttachParamsV1 } from "@autumn/shared";
import {
	CollectionMethod,
	deduplicateArray,
	type ExistingUsagesConfig,
	type FullCusProduct,
	isFutureStartDate,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { carryOverUsagesToExistingUsagesConfig } from "@/internal/billing/v2/utils/handleCarryOvers/carryOverUtils";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

type NewCustomerProductParams = Partial<
	Pick<AttachParamsV1, "carry_over_usages" | "ends_at">
>;

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
	params = {},
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
	params?: NewCustomerProductParams;
}): FullCusProduct => {
	const {
		attachProduct,
		fullCustomer,
		currentCustomerProduct,
		planTiming,
		endOfCycleMs,
		stripeSubscription,
		stripeSubscriptionSchedule,
		currentEpochMs,
		featureQuantities,
		customerLicenseQuantities,
		trialContext,
		isCustom,
		billingVersion,
		transitionConfig,
		externalId,
		requestedBillingCycleAnchor,
		resetCycleAnchorMs,
		accessStartsAt,
		billingStartsAt,
		paymentMethod,
		processorTypeOverride,
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
	const startsAt = billingStartsAt ?? (isScheduled ? endOfCycleMs : undefined);
	const hasAutoChargePaymentMethod =
		paymentMethod !== undefined && paymentMethod.type !== "custom";
	const shouldSendInvoiceForFutureStart =
		isFutureStartDate(startsAt, currentEpochMs) && !hasAutoChargePaymentMethod;
	const collectionMethod = shouldSendInvoiceForFutureStart
		? CollectionMethod.SendInvoice
		: undefined;

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

	const isRevertTrial =
		trialContext?.onEnd === "revert" && planTiming === "immediate";

	const newFullCustomerProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct: attachProduct,
			featureQuantities,
			customerLicenseQuantities,
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
			subscriptionId: stripeSubscription?.id,
			subscriptionScheduleId: stripeSubscriptionSchedule?.id,
			startsAt,
			endedAt: params.ends_at,
			accessStartsAt,
			collectionMethod,
			externalId,
			processorType: processorTypeOverride,
			billingCycleAnchorResetsAt: getScheduledBillingCycleAnchorResetAt({
				requestedBillingCycleAnchor,
				currentEpochMs,
			}),
			...(isRevertTrial && {
				previousCustomerProductId: currentCustomerProduct?.id,
				onTrialEnd: "revert" as const,
			}),
		},
	});

	return newFullCustomerProduct;
};
