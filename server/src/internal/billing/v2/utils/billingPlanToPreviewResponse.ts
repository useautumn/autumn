import type { BillingContext, BillingPlan } from "@autumn/shared";
import { type BillingPreviewResponse, orgToCurrency } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeNextCycleTaxPreview } from "./billingPlan/preview/tax/computeNextCycleTaxPreview";
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
 * `next_cycle.total` is adjusted separately via `applyNextCycleTaxPreview`
 * (tax only — credits are consumed by the immediate invoice first).
 *
 * If `billingPlan.preview` is undefined (non-attach flows that skip the
 * enrichment step) the math is a no-op and `total` is unchanged.
 */
// Tax-only next-cycle adjustment; skipped for non-preview flows (no
// billingPlan.preview bag) so checkout recomputes stay unchanged.
const applyNextCycleTaxPreview = async ({
	ctx,
	billingContext,
	billingPlan,
	nextCycle,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	nextCycle: BillingPreviewResponse["next_cycle"];
}): Promise<BillingPreviewResponse["next_cycle"]> => {
	if (!nextCycle || !billingPlan.preview) return nextCycle;

	const tax = await computeNextCycleTaxPreview({
		ctx,
		billingContext,
		netSubtotal: nextCycle.total,
	});
	if (!tax) return nextCycle;

	return {
		...nextCycle,
		total: new Decimal(nextCycle.total).add(tax.total).toDP(2).toNumber(),
	};
};

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
	const currency = orgToCurrency({ org: ctx.org });

	const {
		immediateLineItems,
		previewLineItems,
		subtotal,
		total: lineItemsTotal,
	} = billingPlanToImmediatePreview({
		billingContext,
		billingPlan,
		currency,
	});

	const total = applyPreviewAdjustmentsToTotal({
		subtotal,
		total: lineItemsTotal,
		billingPlan,
	});

	// Get next cycle object
	const { nextCycle: rawNextCycle, debug: nextCycleDebug } =
		billingPlanToNextCyclePreview({
			ctx,
			billingContext,
			billingPlan,
		});

	const nextCycle = await applyNextCycleTaxPreview({
		ctx,
		billingContext,
		billingPlan,
		nextCycle: rawNextCycle,
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
