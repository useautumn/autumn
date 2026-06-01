import {
	type FullCusProduct,
	truncateMsToSecondPrecision,
} from "@autumn/shared";

export const normalizeCustomerProductTimestamps = (
	customerProduct: FullCusProduct,
): FullCusProduct => ({
	...customerProduct,
	starts_at: truncateMsToSecondPrecision(customerProduct.starts_at),
	ended_at: customerProduct.ended_at
		? truncateMsToSecondPrecision(customerProduct.ended_at)
		: undefined,
	billing_cycle_anchor_resets_at: customerProduct.billing_cycle_anchor_resets_at
		? truncateMsToSecondPrecision(
				customerProduct.billing_cycle_anchor_resets_at,
			)
		: customerProduct.billing_cycle_anchor_resets_at,
	trial_ends_at: customerProduct.trial_ends_at
		? truncateMsToSecondPrecision(customerProduct.trial_ends_at)
		: customerProduct.trial_ends_at,
});
