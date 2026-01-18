import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

/**
 * Creates the default customer product to insert when canceling.
 * Returns undefined for add-ons or when no default product exists.
 * For 'immediately' mode, creates an active product.
 * For 'end_of_cycle' mode, creates a scheduled product.
 */
export const computeDefaultCustomerProduct = ({
	ctx,
	billingContext,
	endOfCycleMs,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	endOfCycleMs: number;
}): FullCusProduct | undefined => {
	const {
		cancelMode,
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

	const startsAt = cancelMode === "immediately" ? currentEpochMs : endOfCycleMs;
	const status =
		cancelMode === "immediately"
			? CusProductStatus.Active
			: CusProductStatus.Scheduled;

	const newDefaultProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
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
