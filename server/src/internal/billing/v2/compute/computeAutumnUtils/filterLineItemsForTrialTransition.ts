import type { BillingContext } from "@autumn/shared";
import { isOneOffPrice, type LineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";

/**
 * Processes line items based on trial state transitions.
 *
 * Ending trial (isTrialing → !willBeTrialing):
 * - Excludes refund items (no refund for trial period)
 * - Excludes in_arrear positive items (no arrear charges for trial usage)
 *
 * Starting trial (!isTrialing → willBeTrialing):
 * - Marks in_advance positive items as deferred (charged after trial ends)
 */
export const filterLineItemsForTrialTransition = ({
	// biome-ignore lint/correctness/noUnusedFunctionParameters: might be used in the future
	ctx,
	lineItems,
	billingContext,
}: {
	ctx: AutumnContext;
	lineItems: LineItem[];
	billingContext: BillingContext;
}): LineItem[] => {
	const { isTrialing, willBeTrialing } = getTrialStateTransition({
		billingContext,
	});

	// No processing needed if no trial transition
	if (!isTrialing && !willBeTrialing) {
		return lineItems;
	}

	return lineItems
		.map((lineItem) => {
			const { billingTiming, direction, price } = lineItem.context;
			const isPositive = lineItem.amount > 0;
			const isRecurringPrice = !isOneOffPrice(price);

			// Starting trial (!isTrialing → willBeTrialing):
			// Mark in_advance positive recurring items as deferred (will be charged after trial)
			if (willBeTrialing) {
				if (billingTiming === "in_advance" && isPositive && isRecurringPrice) {
					return { ...lineItem, deferredForTrial: true };
				}
			}

			return lineItem;
		})
		.filter((lineItem) => {
			const { billingTiming, direction } = lineItem.context;
			const isPositive = lineItem.amount > 0;

			// Ending trial (isTrialing → !willBeTrialing):
			// Filter out refunds and in_arrear positive items (no refund for trial period, no arrear charges)
			if (isTrialing) {
				if (direction === "refund") return false;
				if (billingTiming === "in_arrear" && isPositive) return false;
			}

			return true;
		});
};
