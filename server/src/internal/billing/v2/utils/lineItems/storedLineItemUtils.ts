import type { DbInvoiceLineItem } from "@autumn/shared";
import { Decimal } from "decimal.js";

export const isWithinPeriod = (
	inner: DbInvoiceLineItem,
	outer: DbInvoiceLineItem,
): boolean =>
	inner.effective_period_start != null &&
	outer.effective_period_start != null &&
	inner.effective_period_end != null &&
	outer.effective_period_end != null &&
	inner.effective_period_start >= outer.effective_period_start &&
	inner.effective_period_end <= outer.effective_period_end;

export const hasSamePrice = (
	a: DbInvoiceLineItem,
	b: DbInvoiceLineItem,
): boolean =>
	(a.price_id != null && a.price_id === b.price_id) ||
	(a.stripe_price_id != null && a.stripe_price_id === b.stripe_price_id);

export const computeProratedCredit = ({
	chargeRow,
	now,
	alreadyRefunded,
}: {
	chargeRow: DbInvoiceLineItem;
	now: number;
	alreadyRefunded: number;
}): number => {
	const periodStart = chargeRow.effective_period_start;
	const periodEnd = chargeRow.effective_period_end;

	if (periodStart == null || periodEnd == null || periodEnd <= periodStart) {
		return 0;
	}

	const totalCharged = chargeRow.amount_after_discounts;
	const refundable = new Decimal(totalCharged).minus(alreadyRefunded);

	if (refundable.lte(0)) return 0;

	const remaining = new Decimal(periodEnd).minus(now);
	const total = new Decimal(periodEnd).minus(periodStart);

	if (remaining.lte(0)) return 0;

	const prorationFraction = remaining.div(total);
	return prorationFraction.mul(refundable).neg().toNumber();
};

export const computeAlreadyRefundedForCharge = ({
	chargeRow,
	refundRows,
}: {
	chargeRow: DbInvoiceLineItem;
	refundRows: DbInvoiceLineItem[];
}): number => {
	const matchingRefunds = refundRows.filter(
		(refund) =>
			isWithinPeriod(refund, chargeRow) && hasSamePrice(refund, chargeRow),
	);

	return matchingRefunds.reduce(
		(sum, r) =>
			new Decimal(sum)
				.plus(Math.abs(splitMultiEntityAmount(r)))
				.toNumber(),
		0,
	);
};

export const splitMultiEntityAmount = (
	chargeRow: DbInvoiceLineItem,
): number => {
	const ids = chargeRow.customer_product_ids;
	if (ids.length <= 1) return chargeRow.amount_after_discounts;
	return new Decimal(chargeRow.amount_after_discounts)
		.div(ids.length)
		.toNumber();
};
