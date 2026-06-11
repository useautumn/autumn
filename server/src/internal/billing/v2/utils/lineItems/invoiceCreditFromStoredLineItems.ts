import type { BillingContext } from "@autumn/shared";
import {
	type FullCusProduct,
	isOneOffPrice,
	type LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { augmentBillingContextForAnchorResetRefund } from "./augmentBillingContextForAnchorResetRefund";
import { chargeRowToRefundLineItem } from "./chargeRowToRefundLineItem";
import {
	computeAlreadyRefundedForCharge,
	computeProratedCredit,
	splitMultiEntityAmount,
} from "./storedLineItemUtils";

type InvoiceMatchedCreditResult = {
	lineItems: LineItem[];
	allPricesResolved: boolean;
	resolvedPriceIds: string[];
};

export const invoiceCreditFromStoredLineItems = ({
	ctx,
	customerProduct,
	billingContext,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
}): InvoiceMatchedCreditResult => {
	const { logger } = ctx;
	const now = billingContext.currentEpochMs;
	const chargeRows = billingContext.storedChargeLineItems ?? [];
	const refundRows = billingContext.storedRefundLineItems ?? [];

	const pricesToCredit = customerProduct.customer_prices.filter(
		(cp) => !isOneOffPrice(cp.price),
	);

	if (pricesToCredit.length === 0) {
		return { lineItems: [], allPricesResolved: true, resolvedPriceIds: [] };
	}

	const allLineItems: LineItem[] = [];
	const resolvedPriceIds: string[] = [];
	let anyMissed = false;

	for (const cusPrice of pricesToCredit) {
		const priceChargeRows = chargeRows.filter(
			(row) =>
				row.customer_product_ids.includes(customerProduct.id) &&
				(row.price_id === cusPrice.price.id ||
					row.stripe_price_id === cusPrice.price.config?.stripe_price_id),
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
			anyMissed = true;
			logger.warn(
				`[invoiceCreditFromStoredLineItems] No usable stored charge row for cusProduct=${customerProduct.id} price=${cusPrice.price.id}; falling back to catalog synthesis`,
			);
			continue;
		}

		resolvedPriceIds.push(cusPrice.price.id);

		const currentPeriodRefunds = refundRows.filter(
			(r) =>
				r.customer_product_ids.includes(customerProduct.id) &&
				r.effective_period_end != null &&
				r.effective_period_start != null &&
				r.effective_period_start <= now &&
				r.effective_period_end > now,
		);

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

			const attributedAmount = splitMultiEntityAmount(chargeRow);

			const alreadyRefunded = computeAlreadyRefundedForCharge({
				chargeRow,
				refundRows: currentPeriodRefunds,
			});

			const adjustedChargeRow = {
				...chargeRow,
				amount_after_discounts: attributedAmount,
			};

			const creditAmount = computeProratedCredit({
				chargeRow: adjustedChargeRow,
				now: effectiveNow,
				alreadyRefunded,
			});

			if (creditAmount === 0) continue;

			allLineItems.push(
				chargeRowToRefundLineItem({
					chargeRow,
					creditAmount,
					effectiveNow,
					customerProduct,
					billingContext,
					ctx,
				}),
			);
		}
	}

	if (anyMissed && allLineItems.length === 0) {
		return { lineItems: [], allPricesResolved: false, resolvedPriceIds };
	}

	return {
		lineItems: allLineItems,
		allPricesResolved: !anyMissed,
		resolvedPriceIds,
	};
};
