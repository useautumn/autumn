import {
	type AttachBillingContext,
	ErrCode,
	isOneOffPrice,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/**
 * Validates that scheduled switches (downgrades) don't target products with mixed recurring + one-off prices.
 *
 * Throws error when:
 * - planTiming is "end_of_cycle" (scheduled switch / downgrade)
 * - AND the target product has BOTH recurring prices AND one-off prices
 *
 * This is blocked because scheduled switches to mixed products aren't fully supported yet.
 */
export const handleScheduledSwitchOneOffErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	const { planTiming, attachProduct } = billingContext;

	// Only check for scheduled switches (downgrades)
	if (planTiming !== "end_of_cycle") return;

	const prices = attachProduct.prices;

	// Check if product has mixed recurring + one-off prices
	const hasOneOffPrices = prices.some(isOneOffPrice);
	const hasRecurringPrices = prices.some((p) => !isOneOffPrice(p));
	const isMixedProduct = hasOneOffPrices && hasRecurringPrices;

	if (isMixedProduct) {
		throw new RecaseError({
			message:
				"Scheduled switch to products with both recurring and one-off prices is not supported. Use an immediate switch instead.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
