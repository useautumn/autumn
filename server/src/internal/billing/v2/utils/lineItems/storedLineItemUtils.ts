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

const sharesInvoice = (a: DbInvoiceLineItem, b: DbInvoiceLineItem): boolean =>
	a.invoice_id != null && b.invoice_id != null && a.invoice_id === b.invoice_id;

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

export const computeAlreadyRefundedByCharge = ({
	chargeRows,
	refundRows,
}: {
	chargeRows: DbInvoiceLineItem[];
	refundRows: DbInvoiceLineItem[];
}): Map<string, number> => {
	const alreadyRefundedByCharge = new Map<string, number>();
	const chronologicalRefunds = [...refundRows].sort(
		(a, b) => a.created_at - b.created_at,
	);

	for (const refund of chronologicalRefunds) {
		const matchingCharge = chargeRows
			.filter(
				(charge) =>
					charge.created_at < refund.created_at &&
					!sharesInvoice(charge, refund) &&
					isWithinPeriod(refund, charge) &&
					hasSamePrice(refund, charge),
			)
			.sort((a, b) => b.created_at - a.created_at)[0];
		if (!matchingCharge) continue;

		const alreadyRefunded = alreadyRefundedByCharge.get(matchingCharge.id) ?? 0;
		alreadyRefundedByCharge.set(
			matchingCharge.id,
			new Decimal(alreadyRefunded)
				.plus(Math.abs(splitMultiEntityAmount(refund)))
				.toNumber(),
		);
	}

	return alreadyRefundedByCharge;
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
