import type { AttachBillingContext, AttachParamsV1 } from "@autumn/shared";
import {
	type BalanceTransitionPlan,
	CollectionMethod,
	deduplicateArray,
	type ExistingUsagesConfig,
	type FullCusProduct,
	isFutureStartDate,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { carryOverUsagesToExistingUsagesConfig } from "@/internal/billing/v2/utils/handleCarryOvers/carryOverUtils";
import { initFullCustomerProductWithBalanceTransitions } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

type NewCustomerProductParams = Partial<
	Pick<AttachParamsV1, "carry_over_usages" | "ends_at" | "no_billing_changes">
>;

export const resolveAttachExistingUsagesConfig = ({
	ctx,
	attachBillingContext,
	params,
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
	params: NewCustomerProductParams;
}): ExistingUsagesConfig | undefined => {
	const { currentCustomerProduct, carryOverSourceCustomerProduct, planTiming } =
		attachBillingContext;
	const carryOverSource =
		carryOverSourceCustomerProduct ?? currentCustomerProduct;

	if (planTiming === "end_of_cycle" || !carryOverSource) return undefined;

	const consumableFeatureIdsToCarry = deduplicateArray(
		carryOverSource.customer_entitlements
			.filter((customerEntitlement) =>
				Boolean(customerEntitlement.entitlement.carry_from_previous),
			)
			.map((customerEntitlement) => customerEntitlement.entitlement.feature.id),
	);

	if (params.carry_over_usages?.enabled) {
		return carryOverUsagesToExistingUsagesConfig({
			ctx,
			params,
			currentCustomerProduct: carryOverSource,
		});
	}

	return {
		fromCustomerProduct: carryOverSource,
		consumableFeatureIdsToCarry,
	};
};

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
type ComputeAttachNewCustomerProductParams = {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
	params?: NewCustomerProductParams;
};

const computeAttachNewCustomerProductResult = ({
	ctx,
	attachBillingContext,
	params = {},
}: ComputeAttachNewCustomerProductParams): {
	customerProduct: FullCusProduct;
	balanceTransitionPlan?: BalanceTransitionPlan;
} => {
	const {
		attachProduct,
		fullCustomer,
		currentCustomerProduct,
		carryOverSourceCustomerProduct,
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

	// multiAttach / scheduled-activation contexts don't set the carry-over source;
	// fall back to the same-group product so their carry-over is preserved.
	const carryOverSource =
		carryOverSourceCustomerProduct ?? currentCustomerProduct;

	const isScheduled = planTiming === "end_of_cycle";
	const startsAt = billingStartsAt ?? (isScheduled ? endOfCycleMs : undefined);
	const hasAutoChargePaymentMethod =
		paymentMethod !== undefined && paymentMethod.type !== "custom";
	const shouldSendInvoiceForFutureStart =
		isFutureStartDate(startsAt, currentEpochMs) && !hasAutoChargePaymentMethod;
	const collectionMethod = shouldSendInvoiceForFutureStart
		? CollectionMethod.SendInvoice
		: undefined;

	const existingUsagesConfig = resolveAttachExistingUsagesConfig({
		ctx,
		attachBillingContext,
		params,
	});

	const existingRolloversConfig =
		!isScheduled && carryOverSource
			? {
					fromCustomerProduct: carryOverSource,
				}
			: undefined;

	const isRevertTrial =
		trialContext?.onEnd === "revert" && planTiming === "immediate";
	const preservedBillingLinkage = params.no_billing_changes
		? currentCustomerProduct
		: undefined;

	return initFullCustomerProductWithBalanceTransitions({
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
			subscriptionId:
				stripeSubscription?.id ??
				preservedBillingLinkage?.subscription_ids?.[0],
			subscriptionScheduleId:
				stripeSubscriptionSchedule?.id ??
				preservedBillingLinkage?.scheduled_ids?.[0],
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
};

export const computeAttachNewCustomerProductWithBalanceTransitions = (
	params: ComputeAttachNewCustomerProductParams,
) => computeAttachNewCustomerProductResult(params);

export const computeAttachNewCustomerProduct = (
	params: ComputeAttachNewCustomerProductParams,
): FullCusProduct =>
	computeAttachNewCustomerProductResult(params).customerProduct;
