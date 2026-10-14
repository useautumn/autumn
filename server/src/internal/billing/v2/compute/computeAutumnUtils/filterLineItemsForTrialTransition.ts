import type { BillingContext } from "@autumn/shared";
import { isOneOffPrice, type LineItem } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isCustomerProductAutumnManagedTrial } from "@/internal/billing/v2/setup/trialContext/isCustomerProductAutumnManagedTrial";
import { getTrialStateTransition } from "@/internal/billing/v2/utils/billingContext/getTrialStateTransition";

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

	const isFromAutumnManagedTrial = (lineItem: LineItem) =>
		isCustomerProductAutumnManagedTrial(lineItem.context.customerProduct);

	return lineItems.filter((lineItem) => {
		const { billingTiming, direction, price } = lineItem.context;
		const isPositive = lineItem.amount > 0;
		const isRecurringPrice = !isOneOffPrice(price);

		if (isTrialing || isFromAutumnManagedTrial(lineItem)) {
			if (direction === "refund") return false;
			if (billingTiming === "in_arrear" && isPositive) return false;
		}

		if (willBeTrialing) {
			if (billingTiming === "in_advance" && isPositive && isRecurringPrice)
				return false;
		}

		return true;
	});
};
