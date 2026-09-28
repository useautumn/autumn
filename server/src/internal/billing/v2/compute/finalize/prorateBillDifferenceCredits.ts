import type { BillingContext, LineItem } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { billingContextBillsDifference } from "@/internal/billing/v2/utils/billingContext/billingContextToProrationNow";

const sumBy = ({
	lineItems,
	value,
}: {
	lineItems: LineItem[];
	value: (lineItem: LineItem) => number | undefined;
}) =>
	lineItems.reduce(
		(total, lineItem) => total.plus(value(lineItem) ?? 0),
		new Decimal(0),
	);

const lineQuantity = (lineItem: LineItem) =>
	lineItem.paidQuantity ?? lineItem.totalQuantity;

/** Removal is judged by quantity, since stored credits may already be discounted. */
const priceIsRemoval = (lineItems: LineItem[]) => {
	const refunds = lineItems.filter((li) => li.context.direction === "refund");
	const charges = lineItems.filter((li) => li.context.direction === "charge");
	if (refunds.length === 0) return false;
	if (charges.length === 0) return true;

	const hasQuantities = lineItems.every(
		(lineItem) => lineQuantity(lineItem) !== undefined,
	);
	if (!hasQuantities)
		return sumBy({ lineItems, value: (li) => li.amount }).isNegative();

	return sumBy({ lineItems: charges, value: lineQuantity }).lessThan(
		sumBy({ lineItems: refunds, value: lineQuantity }),
	);
};

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

/** `bill_difference` lines are built over the full period. A price whose quantity went
 * down is scaled back to its unused time, so removals never refund time already used. */
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
				priceIsRemoval(
					lineItems.filter((lineItem) => lineItem.context.price.id === priceId),
				),
		),
	);

	return lineItems.map((lineItem) =>
		creditPriceIds.has(lineItem.context.price.id)
			? prorateToNow({ lineItem, now: billingContext.currentEpochMs })
			: lineItem,
	);
};
