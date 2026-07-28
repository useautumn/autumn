import type {
	BillingContext,
	FullCusProduct,
	FullProductWithoutLicenses,
	LineItem,
	Price,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { augmentBillingContextForAnchorResetRefund } from "./augmentBillingContextForAnchorResetRefund";
import { chargeRowToRefundLineItem } from "./chargeRowToRefundLineItem";
import {
	computeAlreadyRefundedForCharge,
	computeProratedCredit,
	splitMultiEntityAmount,
} from "./storedLineItemUtils";

type StoredInvoiceCreditForPriceResult = {
	lineItems: LineItem[];
	resolved: boolean;
};

export const storedInvoiceCreditForPrice = ({
	ctx,
	customerProduct,
	billingContext,
	target,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	target: {
		price: Price;
		product?: FullProductWithoutLicenses;
	};
}): StoredInvoiceCreditForPriceResult => {
	const { price, product } = target;
	const now = billingContext.currentEpochMs;
	const chargeRows = billingContext.storedChargeLineItems ?? [];
	const refundRows = billingContext.storedRefundLineItems ?? [];
	const priceChargeRows = chargeRows.filter(
		(row) =>
			row.customer_product_ids.includes(customerProduct.id) &&
			(row.price_id === price.id ||
				row.stripe_price_id === price.config?.stripe_price_id) &&
			(!product ||
				row.internal_product_id === product.internal_id ||
				row.product_id === product.id),
	);
	const usableRows = priceChargeRows.filter(
		(row) =>
			row.customer_product_ids.length > 0 &&
			row.effective_period_start != null &&
			row.effective_period_end != null &&
			row.effective_period_start <= now &&
			row.effective_period_end > now,
	);

	if (usableRows.length === 0) {
		ctx.logger.warn(
			`[storedInvoiceCreditForPrice] No usable stored charge row for cusProduct=${customerProduct.id} price=${price.id}; falling back to catalog synthesis`,
		);
		return { lineItems: [], resolved: false };
	}

	const currentPeriodRefunds = refundRows.filter(
		(row) =>
			row.customer_product_ids.includes(customerProduct.id) &&
			row.effective_period_end != null &&
			row.effective_period_start != null &&
			row.effective_period_start <= now &&
			row.effective_period_end > now,
	);
	const lineItems: LineItem[] = [];

	for (const chargeRow of usableRows) {
		const periodStart = chargeRow.effective_period_start;
		const periodEnd = chargeRow.effective_period_end;
		if (periodStart == null || periodEnd == null) continue;

		const action = augmentBillingContextForAnchorResetRefund({
			currentEpochMs: now,
			billingPeriod: { start: periodStart, end: periodEnd },
			anchorResetRefund: billingContext.anchorResetRefund,
		});
		if (action.type === "skip") continue;
		const effectiveNow =
			action.type === "use_snapped_now" ? action.snappedNow : now;
		const alreadyRefunded = computeAlreadyRefundedForCharge({
			chargeRow,
			refundRows: currentPeriodRefunds,
		});
		const creditAmount = computeProratedCredit({
			chargeRow: {
				...chargeRow,
				amount_after_discounts: splitMultiEntityAmount(chargeRow),
			},
			now: effectiveNow,
			alreadyRefunded,
		});
		if (creditAmount === 0) continue;

		lineItems.push(
			chargeRowToRefundLineItem({
				chargeRow,
				creditAmount,
				effectiveNow,
				customerProduct,
				billingContext,
				ctx,
				contextOverride: product ? { price, product } : undefined,
			}),
		);
	}

	return { lineItems, resolved: true };
};
