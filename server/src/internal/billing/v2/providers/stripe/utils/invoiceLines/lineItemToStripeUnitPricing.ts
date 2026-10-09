import {
	atmnToStripeAmount,
	atmnToStripeAmountDecimal,
	type LineItem,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

const STRIPE_UNIT_AMOUNT_MAX_DECIMALS = 12;

/**
 * The quantity × unit amount Stripe should bill a line, or undefined for quantity 1 × total.
 * Only returned when the product is exactly the billed amount, so totals never move.
 */
export const lineItemToStripeUnitPricing = ({
	lineItem,
}: {
	lineItem: LineItem;
}): { quantity: number; unitAmountDecimal: string } | undefined => {
	const { unitPricing, context, amount, amountAfterDiscounts } = lineItem;
	if (!unitPricing) return undefined;

	const { quantity, unitAmount } = unitPricing;
	const isWholeQuantity = Number.isInteger(quantity) && quantity > 0;
	if (!isWholeQuantity) return undefined;

	const { currency, discountable } = context;
	const billedMinor = atmnToStripeAmount({
		amount: discountable ? amount : amountAfterDiscounts,
		currency,
	});
	const unitAmountDecimal = atmnToStripeAmountDecimal({
		amount: unitAmount,
		currency,
		decimalPlaces: STRIPE_UNIT_AMOUNT_MAX_DECIMALS,
	});

	const multipliesToBilledAmount = new Decimal(unitAmountDecimal)
		.mul(quantity)
		.eq(billedMinor);
	if (!multipliesToBilledAmount) return undefined;

	return { quantity, unitAmountDecimal };
};
