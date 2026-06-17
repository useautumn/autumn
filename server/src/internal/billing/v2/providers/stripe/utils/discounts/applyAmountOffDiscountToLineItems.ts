import {
	atmnToStripeAmount,
	type LineItem,
	type LineItemDiscount,
	type StripeDiscountWithCoupon,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { addDiscountTagToDescription } from "./addDiscountTagToDescription";
import { discountAppliesToLineItem } from "./discountAppliesToLineItem";
import { getBackdatedDiscountCycleCount } from "./getBackdatedDiscountCycleCount";

const allocateAmountOffDiscounts = ({
	lineItems,
	amountOffMinorUnits,
	currency,
}: {
	lineItems: LineItem[];
	amountOffMinorUnits: number;
	currency: string;
}) => {
	const weightedItems = lineItems
		.map((item, index) => ({
			item,
			index,
			weight: atmnToStripeAmount({ amount: Math.abs(item.amount), currency }),
		}))
		.filter((item) => item.weight > 0);

	const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);
	if (totalWeight === 0) return new Map<LineItem, number>();

	const allocations = weightedItems.map(({ item, index, weight }) => {
		const exact = new Decimal(amountOffMinorUnits).times(weight).div(totalWeight);
		const minorUnits = exact.floor().toNumber();
		return { item, index, minorUnits, remainder: exact.minus(minorUnits) };
	});

	let remaining =
		amountOffMinorUnits -
		allocations.reduce((sum, allocation) => sum + allocation.minorUnits, 0);
	const byRemainder = [...allocations].sort((a, b) => {
		const diff = b.remainder.comparedTo(a.remainder);
		return diff === 0 ? a.index - b.index : diff;
	});

	for (const { index } of byRemainder) {
		if (remaining <= 0) break;
		allocations[index].minorUnits += 1;
		remaining -= 1;
	}

	return new Map(
		allocations.map(({ item, minorUnits }) => [
			item,
			stripeToAtmnAmount({ amount: minorUnits, currency }),
		]),
	);
};

/**
 * Applies an amount_off discount to line items.
 * Only applies to charge items (not refunds) - distributes proportionally across charges.
 */
export const applyAmountOffDiscountToLineItems = ({
	lineItems,
	discount,
	options = {},
}: {
	lineItems: LineItem[];
	discount: StripeDiscountWithCoupon;
	options?: {
		skipDescriptionTag?: boolean;
	};
}): LineItem[] => {
	const coupon = discount.source.coupon;
	const amountOffCents = coupon.amount_off;

	if (!amountOffCents || amountOffCents === 0) {
		return lineItems;
	}

	const currency = coupon.currency ?? "usd";

	// Filter to applicable CHARGE line items only
	// Discounts reduce what the customer pays, so only apply to charges
	const applicableChargeItems = lineItems.filter((item) =>
		discountAppliesToLineItem({ discount, lineItem: item }),
	);

	if (applicableChargeItems.length === 0) return lineItems;

	const eligibleCycleCount = Math.max(
		...applicableChargeItems.map((item) =>
			getBackdatedDiscountCycleCount({ lineItem: item, coupon }),
		),
	);
	if (eligibleCycleCount <= 0) return lineItems;

	// Build a map of line item -> discount amount
	const discountMap = allocateAmountOffDiscounts({
		lineItems: applicableChargeItems,
		amountOffMinorUnits: amountOffCents,
		currency,
	});

	// Apply discounts to line items
	return lineItems.map((item) => {
		const itemDiscount = discountMap.get(item);

		if (!itemDiscount || itemDiscount === 0) return item;

		const newDiscount: LineItemDiscount = {
			amountOff: itemDiscount,
			stripeCouponId: coupon.id,
			couponName: coupon.name || coupon.id,
		};

		const existingDiscounts = item.discounts ?? [];
		const totalDiscount =
			existingDiscounts.reduce((sum, d) => sum + d.amountOff, 0) + itemDiscount;

		// Discounts only apply to charges (refunds filtered by discountAppliesToLineItem)
		// Cap at 0 to prevent negative charges
		const amountAfterDiscounts = Math.max(
			new Decimal(item.amount).minus(totalDiscount).toNumber(),
			0,
		);

		const description = item.context.discountable
			? item.description // if discountable, stripe applies discount, don't need our own tag
			: addDiscountTagToDescription({ description: item.description });

		return {
			...item,
			description,
			discounts: [...existingDiscounts, newDiscount],
			amountAfterDiscounts,
		};
	});
};
