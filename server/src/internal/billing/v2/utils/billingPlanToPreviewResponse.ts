import {
	type BillingPreviewResponse,
	orgToCurrency,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@autumn/shared";
import type { BillingPlan } from "@autumn/shared";
import { billingPlanToNextCyclePreview } from "./billingPlan/billingPlanToNextCyclePreview";

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

	const previewImmediateLineItems = immediateLineItems.map((line) => {
		const feature = line.context.feature;

		// Use feature name if available, otherwise product name
		const title = feature?.name || line.context.product.name || "Item";
		const isBase = !feature;

		return {
			title,
			description: line.description,
			amount: line.finalAmount,
			is_base: isBase,
			total_quantity: line.total_quantity ?? 1,
			paid_quantity: line.paid_quantity ?? 1,
		};
	});

	const total = new Decimal(
		sumValues(previewImmediateLineItems.map((line) => line.amount)),
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
