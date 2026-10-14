import type { BillingContext, LineItem } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { applyStripeDiscountsToLineItems } from "@/internal/billing/v2/providers/stripe/utils/discounts/applyStripeDiscountsToLineItems";
import { billingContextBillsDifference } from "@/internal/billing/v2/utils/billingContext/billingContextToProrationNow";

/** One change is one plan slot: a main plan's group or an add-on, per entity. Past usage
 * and backdated cycles are billed as they are, so they belong to no change. */
const changeKey = (lineItem: LineItem): string | undefined => {
	const { customerProduct, billingTiming, backdate } = lineItem.context;
	if (!customerProduct || billingTiming === "in_arrear" || backdate) return;

	const { product, internal_entity_id } = customerProduct;
	const slot = product.is_add_on
		? `add_on:${product.id}`
		: `group:${product.group ?? ""}`;
	return `${internal_entity_id ?? ""}|${slot}`;
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

/** Percent-off coupons scale each line, so they count in the comparison. A fixed-amount
 * coupon comes off the invoice whichever side wins, so it can't change the choice. */
const amountsAfterCoupons = ({
	lineItems,
	billingContext,
}: {
	lineItems: LineItem[];
	billingContext: BillingContext;
}): number[] => {
	const percentOffDiscounts = (billingContext.stripeDiscounts ?? []).filter(
		(discount) => discount.source.coupon.percent_off,
	);
	const discounted = percentOffDiscounts.length
		? applyStripeDiscountsToLineItems({
				lineItems,
				discounts: percentOffDiscounts,
				options: { disableDiscountableForFreshDiscounts: true },
			})
		: lineItems;
	return discounted.map((lineItem) => lineItem.amountAfterDiscounts);
};

const totalsByChange = ({
	keys,
	amounts,
}: {
	keys: (string | undefined)[];
	amounts: number[];
}) => {
	const totals = new Map<string, Decimal>();
	keys.forEach((key, index) => {
		if (key === undefined) return;
		totals.set(key, (totals.get(key) ?? new Decimal(0)).plus(amounts[index]));
	});
	return totals;
};

/** `bill_difference` lines are built over the full period. Each change bills the larger of
 * that full difference and its normal proration, so it never bills less than proration. */
export const billDifferenceOrProration = ({
	lineItems,
	billingContext,
}: {
	lineItems: LineItem[];
	billingContext: BillingContext;
}): LineItem[] => {
	if (!billingContextBillsDifference({ billingContext })) return lineItems;

	const keys = lineItems.map(changeKey);
	const proratedLineItems = lineItems.map((lineItem, index) =>
		keys[index] === undefined
			? lineItem
			: prorateToNow({ lineItem, now: billingContext.currentEpochMs }),
	);

	const differenceTotals = totalsByChange({
		keys,
		amounts: amountsAfterCoupons({ lineItems, billingContext }),
	});
	const prorationTotals = totalsByChange({
		keys,
		amounts: amountsAfterCoupons({
			lineItems: proratedLineItems,
			billingContext,
		}),
	});

	const proratesChange = (key: string | undefined) =>
		key !== undefined &&
		prorationTotals.get(key)?.greaterThan(differenceTotals.get(key) ?? 0) ===
			true;

	return lineItems.map((lineItem, index) =>
		proratesChange(keys[index]) ? proratedLineItems[index] : lineItem,
	);
};
