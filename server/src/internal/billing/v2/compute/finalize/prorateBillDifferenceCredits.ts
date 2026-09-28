import type { BillingContext, LineItem } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { billingContextBillsDifference } from "@/internal/billing/v2/utils/billingContext/billingContextToProrationNow";

const sumAmounts = (lineItems: LineItem[]) =>
	lineItems.reduce(
		(total, lineItem) => total.plus(lineItem.amount),
		new Decimal(0),
	);

const prorateToNow = ({
	lineItem,
	now,
}: {
	lineItem: LineItem;
	now: number;
}): LineItem => {
	const period = lineItem.context.billingPeriod;
	if (!period || period.end <= period.start) return lineItem;

	const fraction = new Decimal(Math.max(period.end - now, 0)).div(
		period.end - period.start,
	);
	const scale = (amount: number) => fraction.mul(amount).toNumber();

	return {
		...lineItem,
		amount: scale(lineItem.amount),
		amountAfterDiscounts: scale(lineItem.amountAfterDiscounts),
		discounts: lineItem.discounts.map((discount) => ({
			...discount,
			amountOff: scale(discount.amountOff),
		})),
		prorated: true,
		context: {
			...lineItem.context,
			effectivePeriod: { start: now, end: period.end },
		},
	};
};

/** `bill_difference` lines are built over the full period. A price that nets to a
 * credit is scaled back to its unused time, so removals never refund time already used. */
export const prorateBillDifferenceCredits = ({
	lineItems,
	billingContext,
}: {
	lineItems: LineItem[];
	billingContext: BillingContext;
}): LineItem[] => {
	if (!billingContextBillsDifference({ billingContext })) return lineItems;

	const creditPriceIds = new Set(
		[...new Set(lineItems.map((lineItem) => lineItem.context.price.id))].filter(
			(priceId) =>
				sumAmounts(
					lineItems.filter((lineItem) => lineItem.context.price.id === priceId),
				).isNegative(),
		),
	);

	return lineItems.map((lineItem) =>
		creditPriceIds.has(lineItem.context.price.id)
			? prorateToNow({ lineItem, now: billingContext.currentEpochMs })
			: lineItem,
	);
};
