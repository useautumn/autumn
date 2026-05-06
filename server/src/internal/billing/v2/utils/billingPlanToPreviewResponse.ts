import type { BillingContext, BillingPlan } from "@autumn/shared";
import { type BillingPreviewResponse, orgToCurrency } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToImmediatePreview } from "./billingPlan/toImmediatePreview/billingPlanToImmediatePreview";
import { billingPlanToNextCyclePreview } from "./billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview";
import { billingPlanToChanges } from "./billingPlan/toPreviewChanges/billingPlanToChanges";
import { logBillingPreview } from "./logs/logBillingPreview";

/**
 * Apply preview-layer adjustments (Stripe Tax, Stripe customer credit
 * balance) to the immediate-period total. Mirrors what Stripe will actually
 * invoice:
 *  - Tax is added on top of the discounted subtotal.
 *  - Customer credit is subtracted, capped at (subtotal + tax) so the total
 *    never goes negative. Leftover credit rolls to the next invoice in
 *    Stripe; we don't surface that here beyond the row tooltip on the FE.
 *
 * `next_cycle.total` is intentionally NOT adjusted — we don't compute
 * next-cycle tax (would require a forward-dated Stripe Tax calculation),
 * and the `subtotal`/`total` doc strings on `next_cycle` reflect that.
 *
 * If `billingPlan.preview` is undefined (non-attach flows that skip the
 * enrichment step) the math is a no-op and `total` is unchanged.
 */
const applyPreviewAdjustmentsToTotal = ({
	subtotal,
	total,
	billingPlan,
}: {
	subtotal: number;
	total: number;
	billingPlan: BillingPlan;
}): number => {
	const taxTotal = billingPlan.preview?.tax?.total ?? 0;
	const creditBalance = billingPlan.preview?.invoiceCredits?.balance ?? 0;

	const taxed = new Decimal(total).add(taxTotal);
	const cappedCredit = Decimal.min(creditBalance, Decimal.max(taxed, 0));
	return taxed.sub(cappedCredit).toDP(2).toNumber();
};

export const billingPlanToPreviewResponse = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): Promise<BillingPreviewResponse> => {
	const { fullCustomer } = billingContext;

	const autumnBillingPlan = billingPlan.autumn;
	const allLineItems = autumnBillingPlan.lineItems ?? [];

	const {
		immediateLineItems,
		previewLineItems,
		subtotal,
		total: lineItemsTotal,
	} = billingPlanToImmediatePreview({ billingPlan });

	const total = applyPreviewAdjustmentsToTotal({
		subtotal,
		total: lineItemsTotal,
		billingPlan,
	});

	const currency = orgToCurrency({ org: ctx.org });

	// Get next cycle object
	const { nextCycle, debug: nextCycleDebug } = billingPlanToNextCyclePreview({
		ctx,
		billingContext,
		billingPlan,
	});

	logBillingPreview({
		ctx,
		allLineItems,
		immediateLineItems,
		total,
		currency,
		nextCycleDebug,
		nextCycle,
	});

	const { incoming, outgoing } = await billingPlanToChanges({
		ctx,
		billingContext,
		billingPlan,
	});

	return {
		object: "billing_preview" as const,
		customer_id: fullCustomer.id || "",
		line_items: previewLineItems,
		subtotal,
		total,
		currency,
		next_cycle: nextCycle,
		incoming,
		outgoing,
		refund: autumnBillingPlan.refundPlan,
	} satisfies BillingPreviewResponse;
};
