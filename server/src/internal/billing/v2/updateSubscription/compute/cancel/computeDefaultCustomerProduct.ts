import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { UpdateSubscriptionBillingContext } from "@/internal/billing/v2/billingContext";
import { initFullCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProduct";

/**
 * Creates the default customer product to insert when canceling.
 * Returns undefined for add-ons or when no default product exists.
 * For 'cancel_immediately' mode, creates an active product.
 * For 'cancel_end_of_cycle' mode, creates a scheduled product.
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

	const newDefaultProduct = initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct: defaultProduct,
			featureQuantities: [],
			resetCycleAnchor: startsAt,
			now: currentEpochMs,
			freeTrial: null,

			existingUsagesConfig: {
				fromCustomerProduct: customerProduct,
			},

			existingRolloversConfig: {
				fromCustomerProduct: customerProduct,
			},
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
