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
	const planLineItems = autumnBillingPlan.lineItems ?? [];

	const immediateLineItems = planLineItems.filter(
		(line) => line.chargeImmediately,
	);

	const previewImmediateLineItems = immediateLineItems.map(
		lineItemToPreviewLineItem,
	);

	// Exclude deferred items from total (they'll be charged after trial ends)
	const chargeableItems = previewImmediateLineItems.filter(
		(line) => !line.deferred_for_trial,
	);

	const total = new Decimal(
		sumValues(chargeableItems.map((line) => line.amount)),
	)
		.toDP(2)
		.toNumber();

	const currency = orgToCurrency({ org: ctx.org });

	// Get next cycle object
	const nextCycle = billingPlanToNextCyclePreview({
		ctx,
		billingContext,
		billingPlan,
	});

	// Extract billing period from first line item with a billing period
	const firstLineWithPeriod = immediateLineItems.find(
		(line) => line.context.billingPeriod,
	);
	const periodStart = firstLineWithPeriod?.context.billingPeriod?.start;
	const periodEnd = firstLineWithPeriod?.context.billingPeriod?.end;

	return {
		customer_id: fullCustomer.id || "",
		line_items: previewImmediateLineItems,
		total,
		currency,
		period_start: periodStart,
		period_end: periodEnd,
		next_cycle: nextCycle,
	} satisfies BillingPreviewResponse;
};
