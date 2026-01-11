import {
	type BillingPreviewResponse,
	orgToCurrency,
	sumValues,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";
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
	const previewImmediateLineItems = autumnBillingPlan.lineItems
		.filter((line) => line.chargeImmediately)
		.map((line) => ({
			description: line.description,
			amount: line.finalAmount,
		}));

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

	return {
		customer_id: fullCustomer.id || "",
		line_items: previewImmediateLineItems,
		total,
		currency,
		next_cycle: nextCycle,
	} satisfies BillingPreviewResponse;
};
