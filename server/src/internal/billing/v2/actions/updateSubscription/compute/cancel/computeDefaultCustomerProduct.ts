import {
	CusProductStatus,
	cp,
	enrichFullCustomerWithEntity,
	type FullCusProduct,
	hasCustomerProductEnded,
	isFutureStartDate,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

const hasOtherEffectivePaidMainProduct = ({
	billingContext,
	effectiveAt,
	excludedCustomerProductIds,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	effectiveAt: number;
	excludedCustomerProductIds: Set<string>;
}) => {
	const { customerProduct, fullCustomer } = billingContext;
	const internalEntityId = customerProduct.internal_entity_id ?? undefined;

	return fullCustomer.customer_products.some((candidate) => {
		if (candidate.id === customerProduct.id) return false;
		// The same cancel deletes these, so they cover nothing after it applies.
		if (excludedCustomerProductIds.has(candidate.id)) return false;

		const inScope = cp(candidate)
			.hasRelevantStatus()
			.paidRecurring()
			.main()
			.hasProductGroup({ productGroup: customerProduct.product.group })
			.onEntity({ internalEntityId }).valid;

		return (
			inScope &&
			!isFutureStartDate(candidate.starts_at, effectiveAt, 0) &&
			!hasCustomerProductEnded(candidate, {
				nowMs: effectiveAt,
				toleranceMs: 0,
			})
		);
	});
};

/**
 * Creates the default customer product to insert when canceling.
 * Returns undefined for add-ons or when no default product exists.
 * For 'cancel_immediately' mode, creates an active product.
 * For 'cancel_end_of_cycle' mode, creates a scheduled product.
 *
 * @param excludedCustomerProductIds - Customer products the same cancel plan
 *   deletes (e.g. a scheduled downgrade). They must not count as coverage, or
 *   cancelling a plan with a scheduled downgrade leaves the customer with
 *   nothing at cycle end.
 */
export const computeDefaultCustomerProduct = ({
	ctx,
	billingContext,
	endOfCycleMs,
	excludedCustomerProductIds = new Set<string>(),
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	endOfCycleMs: number;
	excludedCustomerProductIds?: Set<string>;
}): FullCusProduct | undefined => {
	const {
		cancelAction,
		customerProduct,
		defaultProduct,
		fullCustomer,
		currentEpochMs,
	} = billingContext;

	const isAddOn = customerProduct.product.is_add_on;

	// Add-ons don't get default products
	if (isAddOn) return undefined;

	// No default product configured
	if (!defaultProduct) return undefined;

	const startsAt =
		cancelAction === "cancel_immediately" ? currentEpochMs : endOfCycleMs;
	const status =
		cancelAction === "cancel_immediately"
			? CusProductStatus.Active
			: CusProductStatus.Scheduled;

	if (
		hasOtherEffectivePaidMainProduct({
			billingContext,
			effectiveAt: startsAt,
			excludedCustomerProductIds,
		})
	) {
		return undefined;
	}

	const newDefaultProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer: enrichFullCustomerWithEntity({
				fullCustomer,
				internalEntityId: customerProduct.internal_entity_id ?? null,
			}),
			fullProduct: defaultProduct,
			featureQuantities: [],
			resetCycleAnchor: startsAt,
			now: currentEpochMs,
			freeTrial: null,
		},
		initOptions: {
			isCustom: false,
			startsAt,
			status,
		},
	});

	ctx.logger.debug(
		`[computeDefaultCustomerProduct] Created default product '${defaultProduct.name}' with status ${status}`,
	);

	return newDefaultProduct;
};
