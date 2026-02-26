import type { BillingContext, BillingPlan } from "@autumn/shared";
import {
	type BillingPreviewResponse,
	orgToCurrency,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToNextCyclePreview } from "./billingPlan/billingPlanToNextCyclePreview";
import { lineItemToPreviewLineItem } from "./lineItems/lineItemToPreviewLineItem";
import { logBillingPreview } from "./logs/logBillingPreview";

export const billingPlanToPreviewResponse = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}): BillingPreviewResponse => {
	const { fullCustomer } = billingContext;

	const autumnBillingPlan = billingPlan.autumn;
	const allLineItems = autumnBillingPlan.lineItems ?? [];

	const immediateLineItems = allLineItems.filter(
		(line) => line.chargeImmediately,
	);

	const previewImmediateLineItems = immediateLineItems.map(
		lineItemToPreviewLineItem,
	);

	// Exclude deferred items from total (they'll be charged after trial ends)
	const chargeableItems = previewImmediateLineItems.filter(
		(line) => !line.deferred_for_trial,
	);

	const rawTotal = new Decimal(
		sumValues(chargeableItems.map((line) => line.amount)),
	)
		.toDP(2)
		.toNumber();

	const currency = orgToCurrency({ org: ctx.org });

	// Get next cycle object
	const { nextCycle, debug: nextCycleDebug } = billingPlanToNextCyclePreview({
		ctx,
		billingContext,
		billingPlan,
	});

	// When total is negative (refund credit exceeds new charges), clamp to 0
	// and emit a credit object. Reduce the next cycle total by the credit amount
	// to reflect what Stripe actually does (apply customer balance to next invoice).
	const total = rawTotal;

	logBillingPreview({
		ctx,
		allLineItems,
		immediateLineItems,
		total,
		currency,
		nextCycleDebug,
		nextCycle,
	});

	// Extract billing period from first line item with a billing period
	const firstLineWithPeriod = immediateLineItems.find(
		(line) => line.context.billingPeriod,
	);
	const periodStart = firstLineWithPeriod?.context.billingPeriod?.start;
	const periodEnd = firstLineWithPeriod?.context.billingPeriod?.end;

	return {
		object: "billing_preview" as const,
		customer_id: fullCustomer.id || "",
		line_items: previewImmediateLineItems,
		total,
		currency,
		// credit,
		period_start: periodStart,
		period_end: periodEnd,
		next_cycle: nextCycle,
	} satisfies BillingPreviewResponse;
};
