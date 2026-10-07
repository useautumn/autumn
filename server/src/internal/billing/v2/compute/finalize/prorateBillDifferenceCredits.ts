import type { BillingContext, LineItem } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
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

const byDirection = (lineItems: LineItem[]) => ({
	refunds: lineItems.filter((li) => li.context.direction === "refund"),
	charges: lineItems.filter((li) => li.context.direction === "charge"),
});

const hasQuantities = (lineItems: LineItem[]) =>
	lineItems.every((lineItem) => lineQuantity(lineItem) !== undefined);

/** Removal is judged by quantity, since stored credits may already be discounted. */
const priceIsRemoval = (lineItems: LineItem[]) => {
	const { refunds, charges } = byDirection(lineItems);
	if (refunds.length === 0) return false;
	if (charges.length === 0) return true;

	if (!hasQuantities(lineItems))
		return sumBy({ lineItems, value: (li) => li.amount }).isNegative();

	return sumBy({ lineItems: charges, value: lineQuantity }).lessThan(
		sumBy({ lineItems: refunds, value: lineQuantity }),
	);
};

const customerProductId = (lineItem: LineItem) =>
	lineItem.context.customerProduct?.id;

/** A changed quantity on a new customer product replaces the old quantity whole, so only
 * the old product's credit is prorated; an in-place change bills just the difference. */
const priceQuantityIsReplaced = (lineItems: LineItem[]) => {
	const { refunds, charges } = byDirection(lineItems);
	if (refunds.length === 0 || charges.length === 0) return false;
	if (!hasQuantities(lineItems)) return false;

	const chargedProductIds = new Set(charges.map(customerProductId));
	const movedProduct = refunds.every(
		(refund) => !chargedProductIds.has(customerProductId(refund)),
	);
	const quantityChanged = !sumBy({
		lineItems: charges,
		value: lineQuantity,
	}).equals(sumBy({ lineItems: refunds, value: lineQuantity }));
	return movedProduct && quantityChanged;
};

const creditedLineItems = ({
	lineItems,
	replacesQuantityOnRelist,
}: {
	lineItems: LineItem[];
	replacesQuantityOnRelist: boolean;
}) => {
	if (replacesQuantityOnRelist && priceQuantityIsReplaced(lineItems))
		return byDirection(lineItems).refunds;
	return priceIsRemoval(lineItems) ? lineItems : [];
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

/** `bill_difference` lines are built over the full period. Credits for what went out are
 * scaled back to their unused time, so removals never refund time already used. */
export const prorateBillDifferenceCredits = ({
	lineItems,
	billingContext,
}: {
	lineItems: LineItem[];
	billingContext: BillingContext;
}): LineItem[] => {
	if (!billingContextBillsDifference({ billingContext })) return lineItems;

	const priceIds = [
		...new Set(lineItems.map((lineItem) => lineItem.context.price.id)),
	];
	const proratedLineItems = new Set(
		priceIds.flatMap((priceId) =>
			creditedLineItems({
				lineItems: lineItems.filter(
					(lineItem) => lineItem.context.price.id === priceId,
				),
				// Only a set_plans re-list moves a quantity onto a new customer product.
				replacesQuantityOnRelist: isSetPlansBillingContext(billingContext),
			}),
		),
	);

	return lineItems.map((lineItem) =>
		proratedLineItems.has(lineItem)
			? prorateToNow({ lineItem, now: billingContext.currentEpochMs })
			: lineItem,
	);
};
